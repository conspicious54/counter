import AppIntents
import Foundation

struct LogFoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Log food"
    static var description = IntentDescription("Describe food or a saved meal and review it in CalCounter.")
    // Keep iOS 17 compatibility; foreground presentation is required for weighing/review.
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Food", requestValueDialog: "What did you eat?")
    var food: String

    static var parameterSummary: some ParameterSummary { Summary("Log \(\.$food)") }

    @MainActor
    func perform() async throws -> some IntentResult {
        let text = food.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw $food.needsValueError("What did you eat?") }
        var queue = UserDefaults.standard.array(forKey: "counter.siri.pending") as? [[String: String]] ?? []
        queue.append(["id": UUID().uuidString, "text": String(text.prefix(4000))])
        UserDefaults.standard.set(queue, forKey: "counter.siri.pending")
        NotificationCenter.default.post(name: .counterSiriFood, object: nil)
        return .result()
    }
}

extension Notification.Name {
    static let counterSiriFood = Notification.Name("counterSiriFood")
}

struct CounterShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: LogFoodIntent(), phrases: [
            "Log food in \(.applicationName)",
            "Add food to \(.applicationName)",
            "Log a meal in \(.applicationName)"
        ], shortTitle: "Log food", systemImageName: "fork.knife")
    }
}
