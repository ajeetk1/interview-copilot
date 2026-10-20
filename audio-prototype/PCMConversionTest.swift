
import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation
import Dispatch

final class AudioConversionOutput: NSObject, SCStreamOutput {
    private var didTest = false

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, !didTest else { return }
        didTest = true

        guard let description = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description) else {
            print("ERROR: Missing source audio format.")
            return
        }

        let sourceDescription = asbd.pointee

        guard let sourceFormat = withUnsafePointer(to: sourceDescription, {
            AVAudioFormat(streamDescription: $0)
        }),
        let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: true
        ),
        let converter = AVAudioConverter(
            from: sourceFormat,
            to: outputFormat
        ) else {
            print("ERROR: Could not create audio converter.")
            return
        }

        do {
            let inputFrames = AVAudioFrameCount(
                CMSampleBufferGetNumSamples(sampleBuffer)
            )

            guard let input = AVAudioPCMBuffer(
                pcmFormat: sourceFormat,
                frameCapacity: inputFrames
            ) else {
                print("ERROR: Could not allocate input buffer.")
                return
            }

            try sampleBuffer.withAudioBufferList(
                blockBufferMemoryAllocator: nil,
                flags: []
            ) { buffers, _ in
                let destination = UnsafeMutableAudioBufferListPointer(
    input.mutableAudioBufferList
)

guard buffers.count == destination.count else {
    print("ERROR: Audio buffer counts do not match.")
    return
}

for index in 0..<buffers.count {
    let sourceBuffer = buffers[index]
    let destinationBuffer = destination[index]

                    guard let sourceData = sourceBuffer.mData,
                          let destinationData = destinationBuffer.mData else {
                        continue
                    }

                    destinationData.copyMemory(
                        from: sourceData,
                        byteCount: min(
                            Int(sourceBuffer.mDataByteSize),
                            Int(destinationBuffer.mDataByteSize)
                        )
                    )
                }
            }

            input.frameLength = inputFrames

            let outputCapacity = AVAudioFrameCount(
                Double(inputFrames) * 16000.0 / sourceFormat.sampleRate + 512
            )

            guard let output = AVAudioPCMBuffer(
                pcmFormat: outputFormat,
                frameCapacity: outputCapacity
            ) else {
                print("ERROR: Could not allocate output buffer.")
                return
            }

            var suppliedInput = false
            var conversionError: NSError?

            let status = converter.convert(
                to: output,
                error: &conversionError
            ) { _, inputStatus in
                if suppliedInput {
                    inputStatus.pointee = .noDataNow
                    return nil
                }

                suppliedInput = true
                inputStatus.pointee = .haveData
                return input
            }

            if let conversionError {
                print("CONVERSION ERROR: \(conversionError)")
                return
            }

            guard status != .error else {
                print("ERROR: Conversion failed.")
                return
            }

            let byteCount = Int(
                output.audioBufferList.pointee.mBuffers.mDataByteSize
            )

            print("SUCCESS: Real system audio converted.")
            print("Input sample rate: \(sourceFormat.sampleRate) Hz")
            print("Input channels: \(sourceFormat.channelCount)")
            print("Output sample rate: \(outputFormat.sampleRate) Hz")
            print("Output channels: \(outputFormat.channelCount)")
            print("Output frames: \(output.frameLength)")
            print("Output bytes: \(byteCount)")
        } catch {
            print("ERROR: \(error)")
        }
    }
}

@main
struct PCMConversionTest {
    static func main() async {
        do {
            let content = try await SCShareableContent
                .excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                print("ERROR: No display found.")
                return
            }

            let filter = SCContentFilter(
                display: display,
                excludingWindows: []
            )

            let configuration = SCStreamConfiguration()
            configuration.capturesAudio = true
            configuration.excludesCurrentProcessAudio = true
            configuration.sampleRate = 48000
            configuration.channelCount = 2
            configuration.width = 2
            configuration.height = 2

            let stream = SCStream(
                filter: filter,
                configuration: configuration,
                delegate: nil
            )

            let output = AudioConversionOutput()
            let queue = DispatchQueue(label: "audio-conversion-test")

            try stream.addStreamOutput(
                output,
                type: .audio,
                sampleHandlerQueue: queue
            )

            print("Capturing system audio for 10 seconds.")
            print("Play audio from another application now.")

            try await stream.startCapture()
            try await Task.sleep(for: .seconds(10))
            try await stream.stopCapture()

            print("Capture stopped.")
        } catch {
            print("CAPTURE ERROR: \(error)")
        }
    }
}
