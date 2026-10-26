import SwiftUI
import AppIntents
import WebKit
import CoreBluetooth

@main
struct CounterApp: App {
    @UIApplicationDelegateAdaptor(CounterAppDelegate.self) var appDelegate
    init() { CounterShortcuts.updateAppShortcutParameters() }
    var body: some Scene { WindowGroup { CounterRootView() } }
}
final class CounterAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let restoring = (launchOptions?[.bluetoothCentrals] as? [String])?.contains(BodyScaleManager.restorationID) == true
        BodyScaleManager.shared.start(restoring: restoring)
        return true
    }
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        if identifier == DialedWeightSync.sessionID {
            DialedWeightSync.shared.completion = completionHandler
            DialedWeightSync.shared.restoreSession()
        } else { completionHandler() }
    }
}
struct CounterRootView: View {
    @ObservedObject private var bodyScale = BodyScaleManager.shared
    var body: some View {
        CounterWebView().ignoresSafeArea(edges: .bottom)
            .sheet(isPresented: $bodyScale.presentSheet) { BodyScaleView() }
    }
}

struct CounterWebView: UIViewRepresentable {
    static let appURL = URL(string: "https://dumbcount.netlify.app/")!
    func makeCoordinator() -> ScaleBridge { ScaleBridge() }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "counterScale")
        config.userContentController.add(context.coordinator, name: "counterBody")
        config.userContentController.add(context.coordinator, name: "counterSiri")
        config.userContentController.add(context.coordinator, name: "counterCapture")
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        context.coordinator.web = web
        context.coordinator.capture.web = web
        // Optional locally provisioned session, supplied only at signing time. No API key is embedded.
        if let token = Bundle.main.object(forInfoDictionaryKey: "CounterPersonalSession") as? String,
           !token.isEmpty,
           let expiry = TimeInterval(token.components(separatedBy: ".").first ?? ""),
           let cookie = HTTPCookie(properties: [
             .domain: Self.appURL.host!, .path: "/", .name: "counter-session", .value: token,
             .secure: "TRUE", .expires: Date(timeIntervalSince1970: expiry),
             HTTPCookiePropertyKey("HttpOnly"): "TRUE", HTTPCookiePropertyKey("SameSite"): "Strict"
           ]) {
            web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                web.load(URLRequest(url: Self.appURL))
            }
        } else {
            web.load(URLRequest(url: Self.appURL))
        }
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ web: WKWebView, coordinator: ScaleBridge) {
        coordinator.disconnect()
        coordinator.capture.cancelAll()
        web.configuration.userContentController.removeScriptMessageHandler(forName: "counterScale")
        web.configuration.userContentController.removeScriptMessageHandler(forName: "counterBody")
        web.configuration.userContentController.removeScriptMessageHandler(forName: "counterSiri")
        web.configuration.userContentController.removeScriptMessageHandler(forName: "counterCapture")
    }
}

// Read-only BLE bridge: no vendor commands, remote tare, or credentials.
final class ScaleBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, CBCentralManagerDelegate, CBPeripheralDelegate {
    // iOS retains the app-level camera/microphone choice. Avoid a second
    // WebKit prompt on every capture, only for our trusted top-level app.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let trusted = frame.isMainFrame && origin.protocol == "https"
            && origin.host == CounterWebView.appURL.host && (origin.port == 443 || origin.port == 0)
        decisionHandler(trusted ? .grant : .deny)
    }
    let capture = NativeCapture()
    weak var web: WKWebView?
    private var central: CBCentralManager!
    private var scale: CBPeripheral?
    private var pendingConnect = false
    private var timeout: Timer?
    private let service = CBUUID(string: "FFF0")
    private let notify = CBUUID(string: "FFF1")
    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(deliverSiriFood), name: .counterSiriFood, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(deliverSiriFood), name: UIApplication.didBecomeActiveNotification, object: nil)
        BodyScaleManager.shared.onChange = { [weak self] in self?.pushBodySnapshot() }
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }
    @objc private func background() { disconnect() }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == CounterWebView.appURL.host,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if message.name == "counterCapture" { capture.handle(body); return }
        if message.name == "counterSiri" { deliverSiriFood(); return }
        if message.name == "counterBody" {
            if action == "show" { BodyScaleManager.shared.presentSheet = true }
            if action == "sync" { pushBodySnapshot() }
            return
        }
        if action == "disconnect" { disconnect() }
        if action == "connect" {
            disconnect()
            pendingConnect = true
            if central == nil { central = CBCentralManager(delegate: self, queue: .main) }
            else { startIfReady() }
        }
    }
    private var deliveringSiri = false
    @objc private func deliverSiriFood() {
        guard !deliveringSiri, UIApplication.shared.applicationState == .active,
              let web = web, web.url?.scheme == "https", web.url?.host == CounterWebView.appURL.host,
              let queue = UserDefaults.standard.array(forKey: "counter.siri.pending") as? [[String: String]],
              let request = queue.first,
              let json = try? JSONSerialization.data(withJSONObject: request),
              let text = String(data: json, encoding: .utf8) else { return }
        deliveringSiri = true
        web.evaluateJavaScript("typeof window.counterReceiveFood === 'function' && window.counterReceiveFood(\(text))") { [weak self] result, error in
            self?.deliveringSiri = false
            if error == nil, result as? Bool == true {
                var pending = UserDefaults.standard.array(forKey: "counter.siri.pending") as? [[String: String]] ?? []
                pending.removeAll { $0["id"] == request["id"] }
                UserDefaults.standard.set(pending, forKey: "counter.siri.pending")
            }
        }
    }
    func pushBodySnapshot() {
        guard UIApplication.shared.applicationState == .active,
              let web = web, web.url?.scheme == "https", web.url?.host == CounterWebView.appURL.host,
              let json = try? JSONSerialization.data(withJSONObject: BodyScaleManager.shared.snapshot()),
              let text = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('counter-body',{detail:\(text)}));", completionHandler: nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pushBodySnapshot() }
    private func send(_ detail: [String: Any]) {
        guard let web = web, web.url?.host == CounterWebView.appURL.host,
              let json = try? JSONSerialization.data(withJSONObject: detail),
              let text = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('counter-scale',{detail:\(text)}));", completionHandler: nil)
    }
    private func status(_ value: String) { send(["status": value]) }
    func centralManagerDidUpdateState(_ central: CBCentralManager) { startIfReady() }
    private func startIfReady() {
        guard pendingConnect else { return }
        switch central.state {
        case .poweredOn:
            status("Connecting")
            central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
            timeout?.invalidate()
            timeout = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
                self?.disconnect(); self?.status("Scale not found. Turn it on and close VeSync.")
            }
        case .unauthorized: pendingConnect = false; status("Allow Bluetooth in iPhone Settings")
        case .poweredOff: pendingConnect = false; status("Turn on iPhone Bluetooth")
        case .unsupported: pendingConnect = false; status("Bluetooth unavailable")
        default: break
        }
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? ""
        guard pendingConnect, scale == nil, name == "Etekcity Nutrition Scale" else { return }
        central.stopScan()
        scale = peripheral
        peripheral.delegate = self
        central.connect(peripheral)
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) { peripheral.discoverServices([service]) }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let found = peripheral.services?.first(where: { $0.uuid == service }) else {
            disconnect(); status("Unsupported scale service"); return
        }
        peripheral.discoverCharacteristics([notify], for: found)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let characteristic = service.characteristics?.first(where: { $0.uuid == notify && $0.properties.contains(.notify) }) else {
            disconnect(); status("Scale weight notifications unavailable"); return
        }
        peripheral.setNotifyValue(true, for: characteristic)
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.isNotifying else { disconnect(); status("Could not read scale"); return }
        timeout?.invalidate(); pendingConnect = false; status("Connected")
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.uuid == notify, let data = characteristic.value, data.count == 16 else { return }
        send(["hex": data.map { String(format: "%02x", $0) }.joined()])
    }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { disconnect(); status("Connection failed. Close other scale apps and retry.") }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) { scale = nil; status("Disconnected") }
    func disconnect() {
        pendingConnect = false; timeout?.invalidate(); timeout = nil
        central?.stopScan()
        if let scale = scale { central?.cancelPeripheralConnection(scale) }
        scale = nil
        status("Disconnected")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "https" && url.host == CounterWebView.appURL.host { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
}
