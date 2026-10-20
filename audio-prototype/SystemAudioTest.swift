
import Foundation
import ScreenCaptureKit
import CoreMedia
import Dispatch
import AudioToolbox
import AVFoundation


final class AudioOutput: NSObject, SCStreamOutput {
    private var receivedAudio = false

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, !receivedAudio else { return }
        receivedAudio = true

        print("SUCCESS: Received system-audio buffers.")
        print("Sample count: \(CMSampleBufferGetNumSamples(sampleBuffer))")
        print("Total sample size: \(CMSampleBufferGetTotalSampleSize(sampleBuffer)) bytes")

        do {
            try sampleBuffer.withAudioBufferList(
                blockBufferMemoryAllocator: nil,
                flags: []
            ) { buffers, _ in
                for (index, buffer) in buffers.enumerated() {
                    print(
                        "Audio buffer \(index): " +
                        "\(buffer.mDataByteSize) bytes, " +
                        "\(buffer.mNumberChannels) channel(s)"
                    )
                }
            }
        } catch {
            print("Could not inspect audio buffers: \(error)")
        }

        if let format = CMSampleBufferGetFormatDescription(sampleBuffer),
           let audioFormat = CMAudioFormatDescriptionGetStreamBasicDescription(format) {
            let description = audioFormat.pointee
            print("Sample rate: \(description.mSampleRate) Hz")
            print("Channels: \(description.mChannelsPerFrame)")
            print("Bits per channel: \(description.mBitsPerChannel)")
            print("Format ID: \(description.mFormatID)")
            print("Format flags: \(description.mFormatFlags)")
        }
    }
}

@main
struct SystemAudioTest {
    static func main() async {
        do {
            print("Looking for available displays...")

            let content = try await SCShareableContent
                .excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                print("ERROR: No available display was found.")
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

            let output = AudioOutput()
            let queue = DispatchQueue(label: "system-audio-capture")

            try stream.addStreamOutput(
                output,
                type: .audio,
                sampleHandlerQueue: queue
            )

            print("Starting system-audio capture...")
            try await stream.startCapture()

            print("Capture running for 20 seconds.")
            print("Now play audio from a video or another application.")

            try await Task.sleep(for: .seconds(20))

            try await stream.stopCapture()
            print("Capture stopped.")
        } catch {
            print("CAPTURE ERROR: \(error)")
        }
    }
}
