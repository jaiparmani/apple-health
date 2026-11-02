import Foundation
import FoundationModels

/// Structured output the on-device model fills in.
@Generable
struct GeneratedBrief {
    @Guide(description: "One punchy sentence, max 10 words, naming today's readiness")
    var headline: String
    @Guide(description: "Two or three sentences explaining today's numbers in plain language")
    var summary: String
    @Guide(description: "Concrete, specific actions for today", .count(3))
    var focus: [String]
    @Guide(description: "One thing to be careful about today, or an empty string if nothing stands out")
    var watchOut: String
}

/// Builds the daily brief with Apple's on-device Foundation Model, falling back to
/// deterministic rules when Apple Intelligence isn't available.
enum BriefGenerator {
    static var isModelAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }

    static func generate(date: String, metrics: HealthMetrics?, snapshot: HealthSnapshot?,
                         prediction: RecoveryPrediction?) async -> BriefContent {
        let facts = factSheet(metrics: metrics, snapshot: snapshot, prediction: prediction)
        guard isModelAvailable, !facts.isEmpty else {
            return ruleBased(date: date, snapshot: snapshot, prediction: prediction)
        }

        let session = LanguageModelSession(instructions: """
            You are a concise, encouraging performance coach in a personal health app, similar to WHOOP.
            Use ONLY the numbers provided. Never invent data. Never diagnose medical conditions.
            Recovery is 0-100 (67+ green, 34-66 yellow, under 34 red). Strain is 0-21.
            Prefer specific, practical advice (training intensity, bedtime, hydration, daylight).
            """)
        do {
            let response = try await session.respond(
                to: "Write today's brief from these facts:\n" + facts.joined(separator: "\n"),
                generating: GeneratedBrief.self
            )
            let brief = response.content
            return BriefContent(date: date, headline: brief.headline, summary: brief.summary,
                                focus: brief.focus, watchOut: brief.watchOut, generatedOnDevice: true)
        } catch {
            return ruleBased(date: date, snapshot: snapshot, prediction: prediction)
        }
    }

    // MARK: - Prompt facts

    private static func factSheet(metrics m: HealthMetrics?, snapshot s: HealthSnapshot?,
                                  prediction p: RecoveryPrediction?) -> [String] {
        var facts: [String] = []
        func add(_ label: String, _ value: Double?, _ unit: String = "", digits: Int = 0) {
            guard let value else { return }
            facts.append("- \(label): \(String(format: "%.\(digits)f", value))\(unit)")
        }
        if let r = s?.recoveryScore { facts.append("- Recovery today: \(r)%") }
        add("Strain so far today", s?.strain, digits: 1)
        add("Sleep last night", m?.sleepHours ?? s?.sleepHours, " h", digits: 1)
        add("Deep sleep", m?.sleepDeepHours, " h", digits: 1)
        add("REM sleep", m?.sleepRemHours, " h", digits: 1)
        add("Sleep efficiency", m?.sleepEfficiency.map { $0 * 100 }, "%")
        add("Overnight HRV", m?.hrv ?? s?.hrv, " ms")
        add("Resting heart rate", m?.restingHeartRate ?? s?.restingHeartRate, " bpm")
        add("Respiratory rate", m?.respiratoryRate, " /min", digits: 1)
        add("Steps so far", m?.steps ?? s?.steps)
        add("Exercise minutes so far", m?.exerciseMinutes)
        if let types = m?.workoutType, !types.isEmpty { facts.append("- Workouts today: \(types)") }
        if let p {
            facts.append("- Predicted recovery tomorrow: \(p.score)% (range \(p.low)-\(p.high)) assuming \(p.assumedSleepHours) h sleep")
            if let best = p.scenarios.last, let worst = p.scenarios.first {
                facts.append("- With \(worst.sleepHours) h sleep tomorrow's recovery ≈ \(worst.score)%, with \(best.sleepHours) h ≈ \(best.score)%")
            }
        }
        return facts
    }

    // MARK: - Fallback

    static func ruleBased(date: String, snapshot s: HealthSnapshot?, prediction p: RecoveryPrediction?) -> BriefContent {
        let recovery = s?.recoveryScore
        let headline: String
        var focus: [String] = []
        switch recovery {
        case .some(67...):
            headline = "Green day — you're primed to push."
            focus = ["Go for a hard session or intervals", "Fuel well before training", "Keep bedtime consistent"]
        case .some(34..<67):
            headline = "Yellow day — train, but don't max out."
            focus = ["Moderate effort: zone 2 or technique work", "Get 15+ minutes of daylight", "Aim for an earlier bedtime"]
        case .some:
            headline = "Red day — prioritise recovery."
            focus = ["Keep activity light: walk or mobility", "Hydrate and avoid alcohol", "Protect a long sleep window tonight"]
        case .none:
            headline = "Sync to see today's readiness."
            focus = ["Wear your Watch overnight", "Open the app after waking", "Check back after your first sync"]
        }
        var summary = recovery.map { "Recovery is \($0)%." } ?? "No recovery score yet today."
        if let sleep = s?.sleepHours { summary += String(format: " You slept %.1f h.", sleep) }
        if let p { summary += " Tomorrow is forecast at \(p.score)%." }
        let watchOut = (s?.sleepHours ?? 8) < 6 ? "Short sleep — expect lower energy this afternoon." : ""
        return BriefContent(date: date, headline: headline, summary: summary, focus: focus,
                            watchOut: watchOut, generatedOnDevice: false)
    }
}
