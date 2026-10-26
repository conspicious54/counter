import SwiftUI
import CoreBluetooth

struct NearbyBodyScale: Identifiable {
    let id: UUID
    let name: String
    let rssi: Int
}
// This manager is owned by the application, never by a web view or food-entry sheet.
final class BodyScaleManager: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    static let shared = BodyScaleManager()
    static let restorationID = "com.connorbyers.counter.body-scale"
    @Published var presentSheet = false
    @Published private(set) var status = "Not connected"
    @Published private(set) var nearby: [NearbyBodyScale] = []
    @Published private(set) var records: [BodyWeightRecord] = []
    @Published private(set) var rememberedName: String?
    @Published private(set) var enabled = false
    @Published private(set) var storageError: String?
    var onChange: (() -> Void)?
    private var ledger: BodyWeightLedger?
    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var discovered: [UUID: CBPeripheral] = [:]
    private var selecting = false
    private var scanTimer: Timer?
    private var connectTimer: Timer?
    private var retryTimer: Timer?
    private var retryCount = 0
    private var verified = false
    private var pendingFrames: [(BodyWeightFrame, String, Date)] = []
    private let weightCharacteristic = CBUUID(string: "FFF1")
    override init() {
        super.init()
        openLedger()
        NotificationCenter.default.addObserver(self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }
    private func openLedger() {
        guard ledger == nil else { return }
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            ledger = try BodyWeightLedger(url: directory.appendingPathComponent("Counter/body-weight.json"))
            storageError = nil
            refresh()
        } catch { storageError = "Body-weight storage could not be opened. Existing data has been kept safe." }
    }
    func start(restoring: Bool = false) {
        guard ledger != nil, central == nil, restoring || enabled else { return }
        central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionRestoreIdentifierKey: Self.restorationID])
    }
    private func refresh() {
        guard let ledger = ledger else { return }
        records = ledger.state.records
        DialedWeightSync.shared.enqueue(records)
        rememberedName = ledger.state.deviceName
        enabled = ledger.state.reconnect
        onChange?()
    }
    private func setStatus(_ value: String) { guard status != value else { return }; status = value; onChange?() }
    private func persist(_ change: (inout BodyScaleState) -> Void) -> Bool {
        do { try ledger?.update(change); storageError = nil; refresh(); return ledger != nil }
        catch { storageError = "Could not save body-weight data. Free device storage; keep CalCounter open to retry."; onChange?(); return false }
    }
    @objc private func foreground() {
        openLedger()
        retryPending()
        if enabled { start(); reconnect() }
    }
    @objc private func background() {
        if selecting { selecting = false; central?.stopScan(); scanTimer?.invalidate() }
        // Keep the remembered body-scale connection/pending connection alive. Food BLE is separate.
    }
    func findScales() {
        guard ledger != nil else { return }
        selecting = true; nearby = []; discovered = [:]
        if central == nil { central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionRestoreIdentifierKey: Self.restorationID]) }
        else { beginScan() }
    }
    private func beginScan() {
        guard selecting, central?.state == .poweredOn, UIApplication.shared.applicationState != .background else { return }
        setStatus("Wake your bathroom scale, then select it below")
        // Initial discovery is foreground-only and does not guess an advertised service UUID.
        central?.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        scanTimer?.invalidate()
        scanTimer = Timer.scheduledTimer(withTimeInterval: 25, repeats: false) { [weak self] _ in
            self?.central?.stopScan(); self?.selecting = false
            if self?.nearby.isEmpty == true { self?.setStatus("No scale found. Wake it and try again.") }
        }
    }
    func select(_ id: UUID) {
        guard let candidate = discovered[id] else { return }
        guard persist({ $0.deviceID = id.uuidString; $0.deviceName = candidate.name ?? "Bathroom scale"; $0.serviceID = nil; $0.reconnect = true }) else { return }
        selecting = false; scanTimer?.invalidate(); central?.stopScan()
        if let previous = peripheral, previous.identifier != id { central?.cancelPeripheralConnection(previous) }
        peripheral = candidate; candidate.delegate = self
        connect(candidate)
    }
    func resume() {
        guard ledger?.state.deviceID != nil else { findScales(); return }
        guard persist({ $0.reconnect = true }) else { return }
        start(); reconnect()
    }
    func disconnect() {
        guard persist({ $0.reconnect = false }) else { return }
        stopConnection(); setStatus("Disconnected · automatic capture paused")
    }
    func forget() {
        guard persist({ $0.deviceID = nil; $0.deviceName = nil; $0.serviceID = nil; $0.reconnect = false; $0.cycleOpen = false; $0.cycleSaved = false; $0.lastFinalKg = nil; $0.lastFinalAt = nil }) else { return }
        stopConnection(); setStatus("Scale forgotten · saved weigh-ins kept")
    }
    private func stopConnection() {
        selecting = false; scanTimer?.invalidate(); connectTimer?.invalidate(); retryTimer?.invalidate()
        central?.stopScan()
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil
    }
    private func connect(_ p: CBPeripheral) {
        guard enabled, central?.state == .poweredOn else { return }
        p.delegate = self
        if p.state == .connected {
            if !(p.services ?? []).flatMap({ $0.characteristics ?? [] }).contains(where: { $0.uuid == weightCharacteristic && $0.isNotifying }) { discover(p) }
            return
        }
        if p.state != .connecting { central?.connect(p, options: nil) }
        setStatus("Waiting for bathroom scale to wake")
        // CoreBluetooth owns a pending connection; do not time it out while the scale sleeps.
    }
    private func reconnect() {
        guard enabled, central?.state == .poweredOn, !selecting,
              let raw = ledger?.state.deviceID, let id = UUID(uuidString: raw) else { return }
        if let p = peripheral { connect(p); return }
        if let known = central?.retrievePeripherals(withIdentifiers: [id]).first {
            peripheral = known; connect(known)
        } else if let actualService = ledger?.state.serviceID {
            // Learned from this physical scale, not assumed from the food-scale profile.
            central?.scanForPeripherals(withServices: [CBUUID(string: actualService)], options: nil)
            setStatus("Waiting for remembered bathroom scale")
        } else { setStatus("Open scale settings and wake the scale to reconnect") }
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn: if selecting { beginScan() } else { reconnect() }
        case .poweredOff: setStatus("Turn on Bluetooth for automatic body weight")
        case .unauthorized: setStatus("Allow Bluetooth in iPhone Settings")
        case .unsupported: setStatus("Bluetooth is unavailable")
        default: setStatus("Bluetooth is getting ready")
        }
    }
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        guard enabled else {
            (dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral])?.forEach { central.cancelPeripheralConnection($0) }
            return
        }
        for p in dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] ?? [] {
            guard p.identifier.uuidString == ledger?.state.deviceID else { central.cancelPeripheralConnection(p); continue }
            peripheral = p; p.delegate = self
            if p.state == .connected { discover(p) }
        }
        setStatus("Restoring bathroom scale connection")
    }
    func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        if !selecting {
            guard p.identifier.uuidString == ledger?.state.deviceID else { return }
            central.stopScan(); peripheral = p; connect(p); return
        }
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? p.name ?? ""
        // Show candidates for explicit selection; a 22-byte ESF551 frame must still verify the model.
        guard !name.isEmpty, name != "Etekcity Nutrition Scale",
              name.localizedCaseInsensitiveContains("scale") || name.localizedCaseInsensitiveContains("esf") || name.localizedCaseInsensitiveContains("etek") else { return }
        discovered[p.identifier] = p
        if !nearby.contains(where: { $0.id == p.identifier }) {
            nearby.append(NearbyBodyScale(id: p.identifier, name: name, rssi: RSSI.intValue))
        }
    }
    private func discover(_ p: CBPeripheral) {
        setStatus("Checking bathroom scale services")
        // Discover actual services; FFF0 is deliberately not assumed for the bathroom model.
        p.discoverServices(nil)
        connectTimer?.invalidate()
        connectTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.setStatus("Scale did not provide weight notifications. Wake it to retry.")
            if let p = self.peripheral { self.central?.cancelPeripheralConnection(p) }
        }
    }
    func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        guard enabled, p.identifier.uuidString == ledger?.state.deviceID else { central.cancelPeripheralConnection(p); return }
        retryCount = 0; verified = false; discover(p)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services, !services.isEmpty else { setStatus("Could not read bathroom scale services"); central?.cancelPeripheralConnection(peripheral); return }
        for service in services { peripheral.discoverCharacteristics([weightCharacteristic], for: service) }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let c = service.characteristics?.first(where: { $0.uuid == weightCharacteristic && ($0.properties.contains(.notify) || $0.properties.contains(.indicate)) }) else { return }
        guard persist({ $0.serviceID = service.uuid.uuidString }) else { return }
        peripheral.setNotifyValue(true, for: c)
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
        guard c.uuid == weightCharacteristic else { return }
        guard error == nil, c.isNotifying else { setStatus("Could not subscribe to bathroom scale"); central?.cancelPeripheralConnection(peripheral); return }
        connectTimer?.invalidate()
        setStatus("Connected · step on the bathroom scale")
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard error == nil, enabled, peripheral.identifier.uuidString == ledger?.state.deviceID,
              c.uuid == weightCharacteristic, let data = c.value else { return }
        guard let frame = BodyWeightFrame.decode(data) else {
            if !verified { setStatus("Waiting for a verified ESF551 weight packet") }; return
        }
        verified = true
        let stamp = Date()
        if !pendingFrames.isEmpty {
            pendingFrames.append((frame, peripheral.identifier.uuidString, stamp))
            retryPending()
            return
        }
        do {
            let record = try ledger?.ingest(frame, deviceID: peripheral.identifier.uuidString, at: stamp)
            storageError = nil
            if record != nil { refresh(); setStatus("Weigh-in saved on iPhone") }
            else if !frame.stable { setStatus("Weighing… stand still") }
            else { setStatus("Stable weigh-in already saved") }
        } catch {
            pendingFrames.append((frame, peripheral.identifier.uuidString, stamp))
            storageError = "Weigh-in is waiting for device storage. Keep CalCounter open and free space."
            onChange?()
        }
    }
    private func retryPending() {
        guard let ledger = ledger else { return }
        while let pending = pendingFrames.first {
            do { try ledger.ingest(pending.0, deviceID: pending.1, at: pending.2); pendingFrames.removeFirst() }
            catch { return }
        }
        storageError = nil; refresh()
    }
    func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { scheduleReconnect(p) }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard enabled, p.identifier.uuidString == ledger?.state.deviceID else { return }
        connectTimer?.invalidate(); peripheral = p
        // Immediately leave a pending CoreBluetooth reconnect, including while suspended.
        // Background capture must not depend on a JavaScript callback or an iOS Timer firing.
        connect(p)
    }
    private func scheduleReconnect(_ p: CBPeripheral) {
        guard enabled, p.identifier.uuidString == ledger?.state.deviceID else { return }
        connectTimer?.invalidate(); peripheral = p
        setStatus("Waiting for bathroom scale to wake")
        // Bound retries to avoid connection-error loops; normal sleeping devices stay pending in iOS.
        retryCount = min(retryCount + 1, 6)
        retryTimer?.invalidate()
        retryTimer = Timer.scheduledTimer(withTimeInterval: Double(min(60, 1 << retryCount)), repeats: false) { [weak self] _ in self?.reconnect() }
    }
    func snapshot() -> [String: Any] {
        ["records": ledger?.webRecords() ?? [], "status": status, "enabled": enabled,
         "deviceName": rememberedName ?? "", "error": storageError ?? ""]
    }
}

struct BodyScaleView: View {
    @ObservedObject var manager = BodyScaleManager.shared
    var body: some View {
        NavigationStack {
            List {
                Section("Body weight · ESF551") {
                    Text(manager.status)
                    if let error = manager.storageError { Text(error).foregroundStyle(.red) }
                    if let name = manager.rememberedName {
                        Text(name).foregroundStyle(.secondary)
                        if manager.enabled { Button("Disconnect / pause automatic capture") { manager.disconnect() } }
                        else { Button("Resume automatic capture") { manager.resume() } }
                        Button("Forget scale", role: .destructive) { manager.forget() }
                    }
                    Button("Find bathroom scale") { manager.findScales() }
                }
                if !manager.nearby.isEmpty {
                    Section("Select your bathroom scale") {
                        ForEach(manager.nearby) { device in
                            Button { manager.select(device.id) } label: {
                                VStack(alignment: .leading) { Text(device.name); Text("Signal \(device.rssi) dBm · \(device.id.uuidString.suffix(6))").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                Section("Saved weigh-ins") {
                    if manager.records.isEmpty { Text("Your final stable weight will save automatically.").foregroundStyle(.secondary) }
                    ForEach(manager.records.reversed()) { record in
                        HStack { Text(String(format: "%.1f lb · %.2f kg", record.kilograms * 2.2046226218, record.kilograms)); Spacer(); Text(record.recordedAt, format: .dateTime.month(.abbreviated).day().hour().minute()).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section {
                    Text("Keep Bluetooth enabled. iOS may reconnect in the background; capture is not guaranteed after force-quitting CalCounter. Weigh-ins save on this iPhone before appearing in the app. No VeSync or body composition estimates.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Body weight")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { manager.presentSheet = false } } }
        }
    }
}
