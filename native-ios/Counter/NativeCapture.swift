import AVFoundation
import UIKit
import WebKit
import os

// Hardware configuration and recording I/O stay off the UI thread.
final class NativeCapture: NSObject, AVAudioRecorderDelegate {
    weak var web: WKWebView?
    private let audioQueue = DispatchQueue(label: "counter.capture.audio", qos: .userInitiated)
    private var recorder: AVAudioRecorder?
    private var audioID: String?
    private var recordingID: String?
    private var meter: DispatchSourceTimer?
    private var speechSamples = 0
    private var lastSpeech: TimeInterval = 0
    private var startedAt: TimeInterval = 0
    private var requestedVoice: String?
    private var scanner: BarcodeCamera?
    private let log = Logger(subsystem: "com.connorbyers.counter", category: "capture")
    private var recordings: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Counter/Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    func event(_ id: String, _ type: String, _ fields: [String: Any] = [:]) {
        DispatchQueue.main.async { [weak self] in
            guard let web = self?.web, web.url?.scheme == "https",
                  web.url?.host == CounterWebView.appURL.host else { return }
            var payload = fields
            payload["id"] = id; payload["type"] = type
            guard let data = try? JSONSerialization.data(withJSONObject: payload),
                  let text = String(data: data, encoding: .utf8) else { return }
            web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('counter-capture',{detail:\(text)}));", completionHandler: nil)
        }
    }
    func handle(_ body: [String: Any]) {
        guard let action = body["action"] as? String, let id = body["id"] as? String,
              id.count <= 100 else { return }
        switch action {
        case "voice.start": startVoice(id)
        case "voice.stop":
            if requestedVoice == id { requestedVoice = nil }
            audioQueue.async { self.finishVoice(id: id, deliver: true) }
        case "voice.cancel":
            if requestedVoice == id { requestedVoice = nil }
            audioQueue.async { self.finishVoice(id: id, deliver: false) }
        case "voice.recover":
            audioQueue.async {
                let files = self.savedRecordings()
                if let file = files.first { self.deliverAudio(file, to: id, recovered: true) }
                else { self.event(id, "idle") }
            }
        case "voice.clear":
            guard let recording = body["recordingId"] as? String, UUID(uuidString: recording) != nil else { return }
            audioQueue.async {
                try? FileManager.default.removeItem(at: self.recordings.appendingPathComponent(recording + ".m4a"))
            }
        case "scan.start": startScanner(id)
        case "scan.cancel":
            if scanner?.requestID == id { scanner?.close(); scanner = nil }
        default: break
        }
    }
    private func savedRecordings() -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: recordings, includingPropertiesForKeys: [.creationDateKey])) ?? [])
            .filter { $0.pathExtension == "m4a" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    private func startVoice(_ id: String) {
        scanner?.close(); scanner = nil
        requestedVoice = id
        let tap = ProcessInfo.processInfo.systemUptime
        let permission: (Bool) -> Void = { [weak self] granted in
            DispatchQueue.main.async {
                guard let self = self, self.requestedVoice == id else { return }
                guard granted else {
                    self.requestedVoice = nil
                    self.event(id, "error", ["message": "Microphone access is off. Enable it in Settings → Counter."])
                    return
                }
                self.audioQueue.async {
                    guard self.recorder == nil else { self.event(id, "error", ["message": "A recording is already running."]); return }
                    guard self.savedRecordings().isEmpty else {
                        self.deliverAudio(self.savedRecordings()[0], to: id, recovered: true); return
                    }
                    do {
                        let session = AVAudioSession.sharedInstance()
                        try session.setCategory(.record, mode: .measurement, options: [])
                        try session.setPreferredSampleRate(24000)
                        try session.setActive(true)
                        let recording = UUID().uuidString
                        let url = self.recordings.appendingPathComponent(recording + ".m4a")
                        let recorder = try AVAudioRecorder(url: url, settings: [
                            AVFormatIDKey: kAudioFormatMPEG4AAC,
                            AVSampleRateKey: 24000,
                            AVNumberOfChannelsKey: 1,
                            AVEncoderBitRateKey: 64000
                        ])
                        recorder.delegate = self
                        recorder.isMeteringEnabled = true
                        guard recorder.record() else { throw CaptureFailure.unavailable }
                        self.recorder = recorder; self.audioID = id; self.recordingID = recording
                        self.startedAt = ProcessInfo.processInfo.systemUptime
                        self.speechSamples = 0; self.lastSpeech = self.startedAt
                        let ms = (self.startedAt - tap) * 1000
                        self.log.info("Microphone started in \(ms, privacy: .public) ms")
                        self.event(id, "recording", ["startupMs": ms])
                        let timer = DispatchSource.makeTimerSource(queue: self.audioQueue)
                        timer.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100))
                        timer.setEventHandler { [weak self] in self?.measureVoice() }
                        self.meter = timer; timer.resume()
                    } catch {
                        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                        self.event(id, "error", ["message": "Couldn't start the microphone. Please try again."])
                    }
                }
            }
        }
        switch AVAudioApplication.shared.recordPermission {
        case .granted: permission(true)
        case .denied: permission(false)
        default: AVAudioApplication.requestRecordPermission(completionHandler: permission)
        }
    }
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        audioQueue.async {
            guard let id = self.audioID else { return }
            self.finishVoice(id: id, deliver: false)
            self.event(id, "error", ["message": "Recording was interrupted. Reopen Speak to recover any captured audio."])
        }
    }
    private func measureVoice() {
        guard let recorder = recorder, let id = audioID else { return }
        recorder.updateMeters()
        let now = ProcessInfo.processInfo.systemUptime
        if recorder.averagePower(forChannel: 0) > -35 {
            speechSamples += 1; lastSpeech = now
        }
        if (speechSamples >= 3 && now - lastSpeech > 1.7) || now - startedAt >= 60 {
            finishVoice(id: id, deliver: true)
        }
    }
    private func finishVoice(id: String, deliver: Bool) {
        guard audioID == id, let recorder = recorder else { return }
        meter?.cancel(); meter = nil
        let duration = max(recorder.currentTime, ProcessInfo.processInfo.systemUptime - startedAt)
        recorder.stop()
        let url = recorder.url
        self.recorder = nil; audioID = nil; recordingID = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if duration < 0.1 {
            try? FileManager.default.removeItem(at: url)
            if deliver { event(id, "error", ["message": "No audio captured. Try speaking again."]) }
            return
        }
        if deliver { deliverAudio(url, to: id, recovered: false) }
    }
    private func deliverAudio(_ url: URL, to id: String, recovered: Bool) {
        do {
            let data = try Data(contentsOf: url)
            guard data.count > 0 && data.count <= 8 * 1024 * 1024 else { throw CaptureFailure.unavailable }
            event(id, "audio", ["base64": data.base64EncodedString(),
                                "recordingId": url.deletingPathExtension().lastPathComponent,
                                "message": recovered ? "recovered" : "captured"])
        } catch { event(id, "error", ["message": "Couldn't read the saved recording. It remains on your phone."]) }
    }
    private func startScanner(_ id: String) {
        requestedVoice = nil
        audioQueue.async {
            if let current = self.audioID { self.finishVoice(id: current, deliver: false) }
        }
        if scanner?.requestID == id { return }
        scanner?.close()
        guard let web = web, let root = web.window?.rootViewController else {
            event(id, "error", ["message": "Camera unavailable. Reopen Counter and try again."]); return
        }
        var presenter = root
        while let next = presenter.presentedViewController { presenter = next }
        let camera = BarcodeCamera(requestID: id) { [weak self] type, fields in
            if self?.scanner?.requestID == id { self?.scanner = nil }
            self?.event(id, type, fields)
        }
        scanner = camera
        presenter.present(camera, animated: false)
    }
    @objc private func interrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        audioQueue.async { if let id = self.audioID { self.finishVoice(id: id, deliver: true) } }
    }
    @objc private func background() {
        requestedVoice = nil
        scanner?.close(); scanner = nil
        audioQueue.async { if let id = self.audioID { self.finishVoice(id: id, deliver: true) } }
    }
    func cancelAll() { background() }
}
private enum CaptureFailure: Error { case unavailable }

final class BarcodeCamera: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    let requestID: String
    private let result: (String, [String: Any]) -> Void
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "counter.capture.camera", qos: .userInitiated)
    private var device: AVCaptureDevice?
    private var preview: AVCaptureVideoPreviewLayer?
    private var firstFrame: NSKeyValueObservation?
    private var closed = false // Main-thread UI ownership.
    private var cancelled = false // Session-queue ownership.
    private var torchOn = false // Session-queue ownership.
    private let status = UILabel()
    private let flash = UIButton(type: .system)
    private let tapTime = ProcessInfo.processInfo.systemUptime
    private let log = Logger(subsystem: "com.connorbyers.counter", category: "capture")
    init(requestID: String, result: @escaping (String, [String: Any]) -> Void) {
        self.requestID = requestID; self.result = result
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    deinit { NotificationCenter.default.removeObserver(self) }
    @objc private func cameraFailed() {
        DispatchQueue.main.async { self.fail("Camera interrupted. Tap Open camera to try again.") }
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        NotificationCenter.default.addObserver(self, selector: #selector(cameraFailed), name: .AVCaptureSessionRuntimeError, object: session)
        status.text = "Opening camera…"; status.textColor = .white; status.textAlignment = .center
        status.numberOfLines = 0
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        flash.setTitle("Flash", for: .normal)
        flash.setImage(UIImage(systemName: "flashlight.off.fill"), for: .normal)
        flash.addTarget(self, action: #selector(toggleTorch), for: .touchUpInside)
        flash.isEnabled = false
        for element in [status, close, flash] {
            element.translatesAutoresizingMaskIntoConstraints = false
            element.tintColor = .white
            element.backgroundColor = UIColor.black.withAlphaComponent(0.65)
            element.layer.cornerRadius = 12; element.clipsToBounds = true
            view.addSubview(element)
        }
        NSLayoutConstraint.activate([
            close.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            close.widthAnchor.constraint(equalToConstant: 80), close.heightAnchor.constraint(equalToConstant: 48),
            flash.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            flash.topAnchor.constraint(equalTo: close.topAnchor),
            flash.widthAnchor.constraint(equalToConstant: 110), flash.heightAnchor.constraint(equalToConstant: 48),
            status.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            status.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            status.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
            status.heightAnchor.constraint(equalToConstant: 70)
        ])
        let granted: (Bool) -> Void = { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self = self, !self.closed else { return }
                if allowed { self.configure() }
                else { self.fail("Camera access is off. Enable it in Settings → Counter.") }
            }
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: granted(true)
        case .notDetermined: AVCaptureDevice.requestAccess(for: .video, completionHandler: granted)
        default: granted(false)
        }
    }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    private func configure() {
        queue.async {
            guard !self.cancelled else { return }
            do {
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw CaptureFailure.unavailable }
                let input = try AVCaptureDeviceInput(device: device)
                let output = AVCaptureMetadataOutput()
                self.session.beginConfiguration()
                self.session.sessionPreset = .high
                guard self.session.canAddInput(input), self.session.canAddOutput(output) else {
                    self.session.commitConfiguration(); throw CaptureFailure.unavailable
                }
                self.session.addInput(input); self.session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                let supported: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128, .code39, .interleaved2of5, .itf14]
                output.metadataObjectTypes = supported.filter { output.availableMetadataObjectTypes.contains($0) }
                self.device = device
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    if (try? device.lockForConfiguration()) != nil {
                        device.focusMode = .continuousAutoFocus
                        device.unlockForConfiguration()
                    }
                }
                self.session.commitConfiguration()
                DispatchQueue.main.async {
                    guard !self.closed else { return }
                    let preview = AVCaptureVideoPreviewLayer(session: self.session)
                    preview.videoGravity = .resizeAspectFill; preview.frame = self.view.bounds
                    if preview.connection?.isVideoRotationAngleSupported(90) == true { preview.connection?.videoRotationAngle = 90 }
                    self.firstFrame = preview.observe(\.isPreviewing, options: [.new]) { [weak self] layer, _ in
                        guard layer.isPreviewing, let self = self else { return }
                        let ms = (ProcessInfo.processInfo.systemUptime - self.tapTime) * 1000
                        self.log.info("Camera first preview frame in \(ms, privacy: .public) ms")
                    }
                    self.view.layer.insertSublayer(preview, at: 0); self.preview = preview
                    self.flash.isEnabled = device.hasTorch
                    self.status.text = "Point at the barcode"
                    self.queue.async {
                        guard !self.cancelled else { return }
                        self.session.startRunning()
                        if !self.session.isRunning {
                            DispatchQueue.main.async { self.fail("Camera couldn't start. Close other camera apps and try again.") }
                            return
                        }
                        let ms = (ProcessInfo.processInfo.systemUptime - self.tapTime) * 1000
                        self.log.info("Camera session started in \(ms, privacy: .public) ms")
                    }
                }
            } catch { DispatchQueue.main.async { self.fail("Couldn't open the camera. Please try again.") } }
        }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !closed, let code = metadataObjects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first, !code.isEmpty else { return }
        close(type: "barcode", fields: ["code": code])
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    @objc private func toggleTorch() {
        queue.async {
            guard !self.cancelled, let device = self.device, device.hasTorch else { return }
            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }
                let next = !self.torchOn
                if next { try device.setTorchModeOn(level: min(0.7, AVCaptureDevice.maxAvailableTorchLevel)) }
                else { device.torchMode = .off }
                self.torchOn = next
                DispatchQueue.main.async {
                    self.flash.setTitle(next ? "Flash on" : "Flash", for: .normal)
                    self.flash.setImage(UIImage(systemName: next ? "flashlight.on.fill" : "flashlight.off.fill"), for: .normal)
                    self.flash.accessibilityValue = next ? "On" : "Off"
                }
            } catch { DispatchQueue.main.async { self.status.text = "Flash unavailable. Try better light." } }
        }
    }
    private func fail(_ message: String) { close(type: "error", fields: ["message": message]) }
    @objc private func closeTapped() { close() }
    func close(type: String = "cancelled", fields: [String: Any] = [:]) {
        guard !closed else { return }
        closed = true
        queue.async {
            self.cancelled = true
            if let device = self.device, device.hasTorch {
                do { try device.lockForConfiguration(); device.torchMode = .off; device.unlockForConfiguration() } catch {}
            }
            if self.session.isRunning { self.session.stopRunning() }
        }
        dismiss(animated: false) { self.result(type, fields) }
    }
}
