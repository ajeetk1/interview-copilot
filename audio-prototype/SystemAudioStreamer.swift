import AVFoundation
import CoreMedia
import Darwin
import Foundation
import ScreenCaptureKit

private struct AudioFormatSignature: Equatable {
    let sampleRate: Float64
    let formatID: AudioFormatID
    let formatFlags: AudioFormatFlags
    let bytesPerPacket: UInt32
    let framesPerPacket: UInt32
    let bytesPerFrame: UInt32
    let channelsPerFrame: UInt32
    let bitsPerChannel: UInt32

    init(_ description: AudioStreamBasicDescription) {
        sampleRate = description.mSampleRate
        formatID = description.mFormatID
        formatFlags = description.mFormatFlags
        bytesPerPacket = description.mBytesPerPacket
        framesPerPacket = description.mFramesPerPacket
        bytesPerFrame = description.mBytesPerFrame
        channelsPerFrame = description.mChannelsPerFrame
        bitsPerChannel = description.mBitsPerChannel
    }
}

private final class AudioConverterInputProvider: @unchecked Sendable {
    private let lock = NSLock()
    private let input: AVAudioPCMBuffer
    private var suppliedInput = false

    init(input: AVAudioPCMBuffer) {
        self.input = input
    }

    func provide(
        status: UnsafeMutablePointer<AVAudioConverterInputStatus>
    ) -> AVAudioBuffer? {
        lock.lock()
        defer { lock.unlock() }

        guard !suppliedInput else {
            status.pointee = .noDataNow
            return nil
        }

        suppliedInput = true
        status.pointee = .haveData
        return input
    }
}

private final class InterruptWaiter {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Never>?
    private var receivedSignal = false
    private var source: DispatchSourceSignal?

    func start() {
        Darwin.signal(SIGINT, SIG_IGN)

        let signalSource = DispatchSource.makeSignalSource(
            signal: SIGINT,
            queue: DispatchQueue.global()
        )
        signalSource.setEventHandler { [weak self] in
            self?.resumeWaiter()
        }
        signalSource.resume()
        source = signalSource
    }

    func wait() async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if receivedSignal {
                lock.unlock()
                continuation.resume()
            } else {
                self.continuation = continuation
                lock.unlock()
            }
        }
    }

    func stop() {
        source?.cancel()
        source = nil
    }

    private func resumeWaiter() {
        lock.lock()
        receivedSignal = true
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume()
    }
}

private final class SystemAudioStreamer: NSObject, SCStreamOutput {
    private let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 16_000,
        channels: 1,
        interleaved: true
    )!

    private var sourceSignature: AudioFormatSignature?
    private var sourceFormat: AVAudioFormat?
    private var converter: AVAudioConverter?
    private var reportedIssues = Set<String>()
    private var reportedBufferLayout = false

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio else { return }
        guard CMSampleBufferDataIsReady(sampleBuffer) else {
            reportOnce("not-ready", "Received an audio sample buffer that is not ready.")
            return
        }

        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let streamDescription =
                CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)
        else {
            reportOnce("missing-format", "Audio sample buffer has no format description.")
            return
        }

        let asbd = streamDescription.pointee
        let signature = AudioFormatSignature(asbd)
        guard asbd.mFormatID == kAudioFormatLinearPCM,
              asbd.mSampleRate > 0,
              asbd.mChannelsPerFrame > 0,
              asbd.mBytesPerFrame > 0,
              let inputFormat = withUnsafePointer(to: asbd, {
                  AVAudioFormat(streamDescription: $0)
              })
        else {
            reportOnce(
                "unsupported-format",
                "Unsupported source audio format: \(formatDescriptionDescription(asbd))."
            )
            return
        }

        if signature != sourceSignature {
            guard let newConverter = AVAudioConverter(
                from: inputFormat,
                to: outputFormat
            ) else {
                reportOnce("converter-create", "Could not create the audio converter.")
                return
            }

            sourceSignature = signature
            sourceFormat = inputFormat
            converter = newConverter
            reportSourceFormat(asbd)
        }

        guard let sourceFormat, let converter else {
            reportOnce("converter-missing", "Audio converter is unavailable.")
            return
        }

        let sampleCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard sampleCount > 0 else { return }
        guard sampleCount <= Int(Int32.max), sampleCount <= Int(UInt32.max) else {
            reportOnce("sample-count", "Audio sample buffer contains too many frames.")
            return
        }

        let inputFrames = AVAudioFrameCount(sampleCount)
        guard let input = AVAudioPCMBuffer(
            pcmFormat: sourceFormat,
            frameCapacity: inputFrames
        ) else {
            reportOnce("input-allocation", "Could not allocate an audio input buffer.")
            return
        }

        // Set the valid frame count before copying so the destination
        // audio buffers report the required byte sizes.
        input.frameLength = inputFrames

        if !reportedBufferLayout {
            reportedBufferLayout = true
            reportBufferLayout(sampleBuffer, input: input)
        }

        let copyStatus = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(sampleCount),
            into: input.mutableAudioBufferList
        )
        guard copyStatus == noErr else {
            reportOnce(
                "sample-copy-\(copyStatus)",
                "Could not copy PCM samples from CoreMedia (OSStatus \(copyStatus))."
            )
            return
        }

        let scaledCapacity =
            ceil(Double(inputFrames) * outputFormat.sampleRate / sourceFormat.sampleRate)
            + 512
        guard scaledCapacity <= Double(UInt32.max) else {
            reportOnce("output-capacity", "Converted audio buffer would be too large.")
            return
        }

        guard let output = AVAudioPCMBuffer(
            pcmFormat: outputFormat,
            frameCapacity: AVAudioFrameCount(scaledCapacity)
        ) else {
            reportOnce("output-allocation", "Could not allocate an audio output buffer.")
            return
        }

        let inputProvider = AudioConverterInputProvider(input: input)
        var conversionError: NSError?
        let conversionStatus = converter.convert(
            to: output,
            error: &conversionError
        ) { _, inputStatus in
            inputProvider.provide(status: inputStatus)
        }

        if let conversionError {
            reportOnce("conversion-error", "Audio conversion failed: \(conversionError).")
            return
        }
        guard conversionStatus != .error else {
            reportOnce("conversion-status", "Audio conversion failed without an error detail.")
            return
        }
        guard output.frameLength > 0 else { return }

        let outputBuffer = output.mutableAudioBufferList.pointee.mBuffers
        let expectedByteCount = Int(output.frameLength) * MemoryLayout<Int16>.size
        guard output.mutableAudioBufferList.pointee.mNumberBuffers == 1,
              outputBuffer.mNumberChannels == 1,
              let data = outputBuffer.mData,
              Int(outputBuffer.mDataByteSize) == expectedByteCount
        else {
            reportOnce("output-layout", "Converted audio has an unexpected PCM buffer layout.")
            return
        }

        do {
            try FileHandle.standardOutput.write(
                contentsOf: Data(bytes: data, count: expectedByteCount)
            )
        } catch {
            reportOnce("stdout-write", "Could not write PCM audio to stdout: \(error).")
        }
    }

    private func reportSourceFormat(_ asbd: AudioStreamBasicDescription) {
        fputs(
            "Source PCM: \(asbd.mSampleRate) Hz, "
                + "\(asbd.mChannelsPerFrame) channels, "
                + "\(asbd.mBitsPerChannel)-bit, "
                + "\(asbd.mBytesPerFrame) bytes/frame, "
                + "flags=0x\(String(asbd.mFormatFlags, radix: 16))\n",
            stderr
        )
        fputs("Output PCM: 16000 Hz, mono, signed Int16\n", stderr)
    }

    private func reportBufferLayout(
        _ sampleBuffer: CMSampleBuffer,
        input: AVAudioPCMBuffer
    ) {
        do {
            try sampleBuffer.withAudioBufferList(
                blockBufferMemoryAllocator: nil,
                flags: []
            ) { sourceBuffers, _ in
                let destinationBuffers = UnsafeMutableAudioBufferListPointer(
                    input.mutableAudioBufferList
                )
                fputs(
                    "CoreMedia buffers: \(sourceBuffers.count); "
                        + "AVAudioPCMBuffer buffers: \(destinationBuffers.count)\n",
                    stderr
                )
                for index in 0..<sourceBuffers.count {
                    let buffer = sourceBuffers[index]
                    fputs(
                        "Source buffer \(index): \(buffer.mDataByteSize) bytes, "
                            + "\(buffer.mNumberChannels) channel(s)\n",
                        stderr
                    )
                }
                for index in 0..<destinationBuffers.count {
                    let buffer = destinationBuffers[index]
                    fputs(
                        "Input buffer \(index) capacity: \(buffer.mDataByteSize) bytes, "
                            + "\(buffer.mNumberChannels) channel(s)\n",
                        stderr
                    )
                }
            }
        } catch {
            reportOnce("layout-inspection", "Could not inspect PCM buffer layout: \(error).")
        }
    }

    private func reportOnce(_ key: String, _ message: String) {
        guard reportedIssues.insert(key).inserted else { return }
        fputs("ERROR: \(message)\n", stderr)
    }

    private func formatDescriptionDescription(
        _ asbd: AudioStreamBasicDescription
    ) -> String {
        "\(asbd.mFormatID) / \(asbd.mSampleRate) Hz / "
            + "\(asbd.mChannelsPerFrame) channels / \(asbd.mBitsPerChannel) bits"
    }
}

@main
private struct SystemAudioStreamerApp {
    static func main() async {
        do {
            let content = try await SCShareableContent
                .excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                fputs("ERROR: No display found for ScreenCaptureKit.\n", stderr)
                exit(EXIT_FAILURE)
            }

            let filter = SCContentFilter(
                display: display,
                excludingWindows: []
            )
            let configuration = SCStreamConfiguration()
            configuration.capturesAudio = true
            configuration.excludesCurrentProcessAudio = true
            configuration.sampleRate = 48_000
            configuration.channelCount = 2
            configuration.width = 2
            configuration.height = 2

            let stream = SCStream(
                filter: filter,
                configuration: configuration,
                delegate: nil
            )
            let output = SystemAudioStreamer()
            try stream.addStreamOutput(
                output,
                type: .audio,
                sampleHandlerQueue: DispatchQueue(label: "system-audio-capture")
            )

            let interruptWaiter = InterruptWaiter()
            interruptWaiter.start()
            fputs("Starting system-audio capture. Press Ctrl+C to stop.\n", stderr)
            try await stream.startCapture()
            await interruptWaiter.wait()
            interruptWaiter.stop()

            do {
                try await stream.stopCapture()
                fputs("System-audio capture stopped.\n", stderr)
            } catch {
                fputs("ERROR: Could not stop capture cleanly: \(error)\n", stderr)
                exit(EXIT_FAILURE)
            }
        } catch {
            fputs("ERROR: ScreenCaptureKit capture failed: \(error)\n", stderr)
            exit(EXIT_FAILURE)
        }
    }
}
