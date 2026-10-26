import Foundation

// The native ledger remains the source of truth. Acknowledgments are written only
// after the private Counter relay confirms delivery; retries are idempotent.
final class DialedWeightSync: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
    static let shared = DialedWeightSync()
    static let sessionID = "com.connorbyers.counter.dialed-weight"
    var completion: (() -> Void)?
    private var records: [BodyWeightRecord] = []
    private var acknowledged: Set<String> = []
    private var checking = false
    private var directory: URL?
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 7 * 86400
        config.httpMaximumConnectionsPerHost = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()
    override init() {
        super.init()
        do {
            let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let folder = support.appendingPathComponent("Counter/Dialed", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            directory = folder
            if let data = try? Data(contentsOf: folder.appendingPathComponent("acknowledged.json")), let ids = try? JSONDecoder().decode([String].self, from: data) { acknowledged = Set(ids) }
        } catch { /* Ledger is retained and replayed on the next app launch. */ }
    }
    func enqueue(_ incoming: [BodyWeightRecord]) {
        records = incoming
        pump()
    }
    func restoreSession() { _ = session }
    private func pump() {
        guard !checking, directory != nil, !records.isEmpty else { return }
        guard let token = Bundle.main.object(forInfoDictionaryKey: "CounterPersonalSession") as? String, !token.isEmpty else { return }
        checking = true
        session.getAllTasks { [weak self] tasks in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.checking = false
                guard tasks.isEmpty, let directory = self.directory else { return }
                let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = .autoupdatingCurrent; formatter.dateFormat = "yyyy-MM-dd"
                let pending = self.records.filter { !self.acknowledged.contains($0.id) }
                let grouped = Dictionary(grouping: pending, by: { formatter.string(from: $0.recordedAt) })
                let dates = grouped.keys.sorted(by: >).prefix(20)
                guard !dates.isEmpty else { return }
                let iso = ISO8601DateFormatter()
                let days: [[String: Any]] = dates.compactMap { date in
                    guard let latest = grouped[date]?.max(by: { $0.recordedAt < $1.recordedAt }) else { return nil }
                    return ["date": date, "weight": ["id": latest.id, "kilograms": latest.kilograms, "recordedAt": iso.string(from: latest.recordedAt)]]
                }
                let ids = dates.flatMap { grouped[$0]?.map(\.id) ?? [] }
                let file = directory.appendingPathComponent(UUID().uuidString + ".json")
                do {
                    let data = try JSONSerialization.data(withJSONObject: ["streamId": "counter-native-body", "days": days])
                    try data.write(to: file, options: .atomic)
                    var request = URLRequest(url: URL(string: "https://dumbcount.netlify.app/api/dialed")!)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("counter-session=" + token, forHTTPHeaderField: "Cookie")
                    let task = self.session.uploadTask(with: request, fromFile: file)
                    let metadata = try JSONSerialization.data(withJSONObject: ["ids": ids, "file": file.lastPathComponent])
                    task.taskDescription = String(data: metadata, encoding: .utf8)
                    task.resume()
                } catch { /* No acknowledgment is advanced on a failed write. */ }
            }
        }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let text = task.taskDescription, let data = text.data(using: .utf8), let metadata = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let ids = metadata["ids"] as? [String], let file = metadata["file"] as? String, let directory = directory else { return }
        if error == nil, let response = task.response as? HTTPURLResponse, response.statusCode == 200 {
            let next = acknowledged.union(ids)
            do { try JSONEncoder().encode(Array(next)).write(to: directory.appendingPathComponent("acknowledged.json"), options: .atomic); acknowledged = next } catch { /* A replay is safe. */ }
        }
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(file))
        DispatchQueue.main.asyncAfter(deadline: .now() + (error == nil && (task.response as? HTTPURLResponse)?.statusCode == 200 ? 0.1 : 30)) { [weak self] in self?.pump() }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let done = completion; completion = nil; done?()
    }
}
