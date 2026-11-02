import AppIntents
import SwiftUI

/// Snapshots older than this are refreshed before an intent answers.
private let intentFreshness: TimeInterval = 30 * 60

private func freshSnapshot() async -> HealthSnapshot? {
    if let snapshot = SharedStore.snapshot,
       Date().timeIntervalSince(snapshot.updatedAt) < intentFreshness,
       snapshot.date == HealthKitManager.dateFormatter.string(from: Date()) {
        return snapshot
    }
    return await SyncEngine.shared.syncRecent(trigger: .intent).snapshot ?? SharedStore.snapshot
}

struct CheckRecoveryIntent: AppIntent {
    static let title: LocalizedStringResource = "Check Recovery"
    static let description = IntentDescription("Shows today's recovery, strain and sleep from HealthSync.")

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let snapshot = await freshSnapshot()
        guard let snapshot, let recovery = snapshot.recoveryScore else {
            return .result(dialog: "I don't have a recovery score yet. Open HealthSync to sync.",
                           view: RecoverySnippetView(snapshot: snapshot))
        }
        var sentence = "Recovery is \(recovery) percent"
        if let strain = snapshot.strain { sentence += ", strain \(String(format: "%.1f", strain))" }
        if let sleep = snapshot.sleepHours { sentence += ", and you slept \(String(format: "%.1f", sleep)) hours" }
        return .result(dialog: "\(sentence).", view: RecoverySnippetView(snapshot: snapshot))
    }
}

struct PredictRecoveryIntent: AppIntent {
    static let title: LocalizedStringResource = "Predict Tomorrow's Recovery"
    static let description = IntentDescription("Forecasts tomorrow morning's recovery from your history.")

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        var prediction = SharedStore.prediction
        if prediction == nil {
            prediction = await SyncEngine.shared.refreshInsights(today: nil, forcePrediction: true)?.prediction
        }
        guard let prediction else {
            return .result(dialog: "There isn't enough history yet to forecast recovery.",
                           view: PredictionSnippetView(prediction: nil))
        }
        var sentence = "Tomorrow's recovery should be around \(prediction.score) percent, "
            + "between \(prediction.low) and \(prediction.high), "
            + "if you sleep \(String(format: "%g", prediction.assumedSleepHours)) hours."
        if let best = prediction.scenarios.last, best.score > prediction.score {
            sentence += " Sleeping \(String(format: "%g", best.sleepHours)) hours could lift it to \(best.score)."
        }
        return .result(dialog: "\(sentence)", view: PredictionSnippetView(prediction: prediction))
    }
}

struct MorningBriefIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Health Brief"
    static let description = IntentDescription("Today's coaching brief, written on-device by Apple Intelligence.")

    @Parameter(title: "Regenerate", default: false)
    var regenerate: Bool

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        _ = await freshSnapshot()
        let brief = await SyncEngine.shared.brief(regenerate: regenerate)
        return .result(dialog: "\(brief.headline) \(brief.summary)", view: BriefSnippetView(brief: brief))
    }
}

struct SyncHealthDataIntent: AppIntent {
    static let title: LocalizedStringResource = "Sync Health Data"
    static let description = IntentDescription("Sends the latest Apple Health data to your dashboard.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await SyncEngine.shared.syncRecent(trigger: .intent)
        if let error = outcome.lastError, outcome.synced == 0 {
            return .result(dialog: "Sync failed: \(error)")
        }
        if outcome.synced == 0 {
            return .result(dialog: "Everything is already up to date.")
        }
        return .result(dialog: "Synced \(outcome.synced) \(outcome.synced == 1 ? "day" : "days").")
    }
}

struct HealthSyncShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CheckRecoveryIntent(),
            phrases: [
                "What's my recovery in \(.applicationName)",
                "Check my recovery in \(.applicationName)",
                "How recovered am I in \(.applicationName)",
            ],
            shortTitle: "Recovery",
            systemImageName: "heart.circle"
        )
        AppShortcut(
            intent: MorningBriefIntent(),
            phrases: [
                "Get my \(.applicationName) brief",
                "Give me my health brief in \(.applicationName)",
            ],
            shortTitle: "Daily Brief",
            systemImageName: "text.bubble"
        )
        AppShortcut(
            intent: PredictRecoveryIntent(),
            phrases: [
                "Predict my recovery in \(.applicationName)",
                "What will my recovery be tomorrow in \(.applicationName)",
            ],
            shortTitle: "Tomorrow",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
        AppShortcut(
            intent: SyncHealthDataIntent(),
            phrases: ["Sync \(.applicationName)", "Sync my health data with \(.applicationName)"],
            shortTitle: "Sync Now",
            systemImageName: "arrow.triangle.2.circlepath"
        )
    }
}

// MARK: - Snippet views

struct RecoverySnippetView: View {
    let snapshot: HealthSnapshot?

    var body: some View {
        HStack(spacing: 16) {
            RecoveryRing(score: snapshot?.recoveryScore, lineWidth: 8)
                .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 4) {
                if let strain = snapshot?.strain {
                    Label(String(format: "Strain %.1f", strain), systemImage: "flame.fill")
                }
                if let sleep = snapshot?.sleepHours {
                    Label(String(format: "Sleep %.1f h", sleep), systemImage: "bed.double.fill")
                }
                if let p = snapshot?.prediction {
                    Label("Tomorrow ~\(p.score)%", systemImage: "chart.line.uptrend.xyaxis")
                }
            }
            .font(.subheadline)
            Spacer(minLength: 0)
        }
        .padding()
    }
}

struct PredictionSnippetView: View {
    let prediction: RecoveryPrediction?

    var body: some View {
        if let prediction {
            PredictionCard(prediction: prediction, compact: true).padding()
        } else {
            Text("Sync more days to unlock predictions.").padding()
        }
    }
}

struct BriefSnippetView: View {
    let brief: BriefContent

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(brief.headline).font(.headline)
            ForEach(brief.focus, id: \.self) { item in
                Label(item, systemImage: "checkmark.circle")
                    .font(.subheadline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }
}
