import Foundation

@main struct BodyWeightTests {
    static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    static func packet(_ kg: Double, stable: Bool = true, display: UInt8 = 0, sequence: UInt8 = 1) -> Data {
        var b = [UInt8](repeating: 0, count: 22)
        b[0] = 0xa5; b[1] = 2; b[2] = sequence; b[3] = 0x10
        b[6] = 1; b[7] = 0x61; b[8] = 0xa1
        let weight = Int((kg * 1000).rounded())
        b[10] = UInt8(weight & 255); b[11] = UInt8((weight >> 8) & 255); b[12] = UInt8((weight >> 16) & 255)
        b[19] = stable ? 1 : 0; b[21] = display
        return Data(b)
    }
    static func main() throws {
        let data = packet(80.25, display: 1)
        expect(BodyWeightFrame.decode(data)?.kilograms == 80.25, "lb display must retain wire kilograms")
        expect(BodyWeightFrame.decode(packet(80.25, display: 2))?.kilograms == 80.25, "stone display must retain kilograms")
        expect(BodyWeightFrame.decode(packet(80.25, stable: false))?.stable == false, "settling frame")
        expect(BodyWeightFrame.decode(Data(repeating: 0, count: 22)) == nil, "reject wrong frame profile")
        expect(BodyWeightFrame.decode(Data(data.prefix(16))) == nil, "reject food frames and truncation")
        var wrong = [UInt8](data); wrong[7] = 0x83
        expect(BodyWeightFrame.decode(Data(wrong)) == nil, "reject nutrition-scale opcode")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("weights.json")
        let ledger = try BodyWeightLedger(url: path)
        let now = Date(timeIntervalSince1970: 1700000000)
        let final = BodyWeightFrame.decode(data)!
        expect(tryRecord(ledger, final, now) != nil, "first final saves")
        let repeatFrame = BodyWeightFrame.decode(packet(80.25, display: 0, sequence: 99))!
        expect(tryRecord(ledger, repeatFrame, now.addingTimeInterval(0.1)) == nil, "sequence/display changes do not duplicate final")
        let reopened = try BodyWeightLedger(url: path)
        expect(reopened.state.records.count == 1, "durable before any web replay")
        expect(tryRecord(reopened, final, now.addingTimeInterval(10)) == nil, "reconnect/relaunch does not duplicate final")
        _ = try reopened.ingest(BodyWeightFrame.decode(packet(70, stable: false))!, deviceID: "test-device", at: now.addingTimeInterval(20))
        expect(tryRecord(reopened, final, now.addingTimeInterval(21)) != nil, "new settling cycle preserves legitimate identical weight")
        expect(tryRecord(reopened, final, now.addingTimeInterval(86400)) != nil, "later-day stable-only weigh-in preserved")
        expect(tryRecord(reopened, BodyWeightFrame.decode(packet(0))!, now) == nil, "zero cannot become a weigh-in")
        expect(reopened.state.records.count == 3, "exactly three distinct weigh-ins")
        expect(reopened.webRecords().count == 3, "replay retains all native records")
        expect(Set(reopened.state.records.map { $0.id }).count == 3, "immutable unique replay identifiers")
        try reopened.update { $0.deviceID = "remembered"; $0.reconnect = true }
        let remembered = try BodyWeightLedger(url: path)
        expect(remembered.state.deviceID == "remembered" && remembered.state.reconnect, "remember device and reconnect intent")
        let before = remembered.state.records.count
        let encoded = try Data(contentsOf: path)
        try FileManager.default.removeItem(at: dir)
        try Data().write(to: dir) // Force atomic-write failure; parent is a file.
        do { _ = try remembered.ingest(BodyWeightFrame(kilograms: 90, stable: true), deviceID: "test", at: now); fatalError("write should fail") }
        catch { expect(remembered.state.records.count == before, "failed save must not publish or deduplicate") }
        try FileManager.default.removeItem(at: dir)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try encoded.write(to: path)
        expect(tryRecord(remembered, BodyWeightFrame(kilograms: 90, stable: true), now) != nil, "same reading retries after storage failure")
        try Data("invalid".utf8).write(to: path)
        do { _ = try BodyWeightLedger(url: path); fatalError("corrupt ledger should fail closed") } catch {}
        print("BodyWeightTests: 20 parser, deduplication, persistence, replay, and failure checks passed")
    }
    static func tryRecord(_ ledger: BodyWeightLedger, _ frame: BodyWeightFrame, _ date: Date) -> BodyWeightRecord? {
        do { return try ledger.ingest(frame, deviceID: "test-device", at: date) }
        catch { fatalError("Unexpected storage failure: \(error)") }
    }
}
