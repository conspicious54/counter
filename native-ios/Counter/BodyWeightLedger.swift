import Foundation

// ESF551 frame interpretation adapted from etekcity_esf551_ble, Copyright (c) 2024
// Ron Ben Yosef (MIT). Full attribution is bundled in Licenses/etekcity_esf551_ble.txt.
// Body kilograms only: deliberately independent of the 16-byte nutrition-scale decoder.
struct BodyWeightFrame {
    let kilograms: Double
    let stable: Bool
    static func decode(_ data: Data) -> BodyWeightFrame? {
        let b = [UInt8](data)
        guard b.count == 22, b[0] == 0xa5, b[1] == 0x02,
              b[3] == 0x10, b[4] == 0, Array(b[6...9]) == [0x01, 0x61, 0xa1, 0x00] else { return nil }
        let raw = Int(b[10]) | Int(b[11]) << 8 | Int(b[12]) << 16
        // Byte 21 describes the display only. The wire value is always kilograms / 1000.
        return BodyWeightFrame(kilograms: Double(raw) / 1000, stable: b[19] == 1)
    }
}
struct BodyWeightRecord: Codable, Identifiable, Equatable {
    var id: String
    var kilograms: Double
    var recordedAt: Date
    var deviceID: String
}
struct BodyScaleState: Codable {
    var deviceID: String? = nil
    var deviceName: String? = nil
    var serviceID: String? = nil
    var reconnect = false
    var records: [BodyWeightRecord] = []
    var lastFinalKg: Double? = nil
    var lastFinalDeviceID: String? = nil
    var lastFinalAt: Date? = nil
    var cycleOpen = false
    var cycleSaved = false
}
final class BodyWeightLedger {
    private(set) var state: BodyScaleState
    let url: URL
    init(url: URL) throws {
        self.url = url
        if FileManager.default.fileExists(atPath: url.path) {
            state = try Self.decoder.decode(BodyScaleState.self, from: Data(contentsOf: url))
        } else { state = BodyScaleState() }
    }
    private static var encoder: JSONEncoder { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }
    private static var decoder: JSONDecoder { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }
    func update(_ change: (inout BodyScaleState) -> Void) throws {
        var next = state
        change(&next)
        let data = try Self.encoder.encode(next)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        state = next // Publish only after the atomic disk write succeeds.
    }
    @discardableResult func ingest(_ frame: BodyWeightFrame, deviceID: String, at date: Date = Date()) throws -> BodyWeightRecord? {
        if !frame.stable {
            if !state.cycleOpen {
                try update { $0.cycleOpen = true; $0.cycleSaved = false }
            }
            return nil
        }
        guard frame.kilograms >= 0.1, frame.kilograms <= 500 else { return nil }
        let elapsed = date.timeIntervalSince(state.lastFinalAt ?? .distantPast)
        // Ignore repeats, including across reconnect/relaunch; a settling frame opens a new cycle.
        if state.lastFinalDeviceID == deviceID && state.cycleSaved && state.lastFinalKg == frame.kilograms && elapsed < 120 { return nil }
        if state.lastFinalDeviceID == deviceID && !state.cycleOpen && state.lastFinalKg == frame.kilograms && elapsed < 120 { return nil }
        let record = BodyWeightRecord(id: UUID().uuidString, kilograms: frame.kilograms, recordedAt: date, deviceID: deviceID)
        try update {
            $0.records.append(record)
            $0.lastFinalKg = frame.kilograms; $0.lastFinalAt = date; $0.lastFinalDeviceID = deviceID
            $0.cycleOpen = false; $0.cycleSaved = true
        }
        return record
    }
    // Always replay the native source of truth. Web storage deduplicates by this immutable record ID.
    func webRecords() -> [[String: Any]] {
        let formatter = ISO8601DateFormatter()
        return state.records.map { ["id": $0.id, "kilograms": $0.kilograms, "recordedAt": formatter.string(from: $0.recordedAt)] }
    }
}
