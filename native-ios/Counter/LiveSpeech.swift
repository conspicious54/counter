import AVFoundation
import Speech

// All mutable state belongs to the capture queue. Input buffers are copied off
// the realtime callback before file encoding and recognition work is queued.
final class LiveSpeech {
    let id: String
    private let queue: DispatchQueue
    private let recognizer: SFSpeechRecognizer
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var file: AVAudioFile?
    private let url: URL
    private let emit: (String, [String: Any]) -> Void
    private let completed: () -> Void
    private let fallback: (URL) -> Void
    private var stopping = false
    private var finished = false
    private var failed = false
    private var transcript = ""
    private var finalTranscript = false
    private var deadline: DispatchWorkItem?
    private var limit: DispatchWorkItem?

    init(id: String, queue: DispatchQueue, recognizer: SFSpeechRecognizer, directory: URL,
         emit: @escaping (String, [String: Any]) -> Void,
         completed: @escaping () -> Void, fallback: @escaping (URL) -> Void) {
        self.id = id; self.queue = queue; self.recognizer = recognizer
        self.url = directory.appendingPathComponent(UUID().uuidString + ".m4a")
        self.emit = emit; self.completed = completed; self.fallback = fallback
    }
    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw LiveError.unavailable }
        file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderBitRateKey: 64000
        ], commonFormat: format.commonFormat, interleaved: format.isInterleaved)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.taskHint = .dictation
        self.request = request
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            self.queue.async {
                guard !self.finished else { return }
                if let result = result {
                    self.transcript = result.bestTranscription.formattedString
                    self.finalTranscript = result.isFinal
                    self.emit("partial", ["text": self.transcript])
                }
                if error != nil { self.failed = true }
                if self.stopping && (self.finalTranscript || self.failed) { self.resolve() }
            }
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self,
                  let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return }
            copy.frameLength = buffer.frameLength
            let source = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffer.audioBufferList))
            let target = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
            for index in 0..<min(source.count, target.count) {
                if let src = source[index].mData, let dst = target[index].mData {
                    memcpy(dst, src, Int(source[index].mDataByteSize))
                }
            }
            self.queue.async {
                guard !self.finished else { return }
                do { try self.file?.write(from: copy) } catch { self.failed = true }
                self.request?.append(copy)
            }
        }
        engine.prepare()
        do { try engine.start() }
        catch {
            input.removeTap(onBus: 0); file = nil; task?.cancel(); task = nil; self.request = nil
            try? FileManager.default.removeItem(at: url)
            throw error
        }
        emit("recording", ["streaming": true])
        let limit = DispatchWorkItem { [weak self] in self?.stop(deliver: true) }
        self.limit = limit
        queue.asyncAfter(deadline: .now() + 60, execute: limit)
    }
    func stop(deliver: Bool) {
        guard !stopping, !finished else { return }
        stopping = true
        limit?.cancel()
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        // Flush buffers already queued by the audio callback, then close the file.
        queue.async {
            self.file = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            guard deliver else {
                self.finished = true; self.task?.cancel(); self.request = nil
                self.completed() // Audio stays available through normal recovery.
                return
            }
            self.request?.endAudio()
            if self.finalTranscript || self.failed { self.resolve(); return }
            // If local recognition can't finalize promptly, the captured file is
            // retained and sent through the existing transcription fallback.
            let deadline = DispatchWorkItem { [weak self] in self?.resolve() }
            self.deadline = deadline
            self.queue.asyncAfter(deadline: .now() + 2, execute: deadline)
        }
    }
    private func resolve() {
        guard !finished else { return }
        finished = true; deadline?.cancel(); limit?.cancel()
        task?.cancel(); task = nil; request = nil
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if finalTranscript && !failed && !text.isEmpty {
            emit("transcript", ["text": text, "recordingId": url.deletingPathExtension().lastPathComponent])
        } else { fallback(url) }
        completed()
    }
    enum LiveError: Error { case unavailable }
}
