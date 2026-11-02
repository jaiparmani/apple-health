import Foundation
import CryptoKit
import WidgetKit

/// Owns all sync work so the UI, HealthKit background delivery, BGTask refreshes and
/// App Intents share one pipeline: one run at a time, retries for failed days,
/// no-op detection, and a refreshed widget snapshot after every successful run.
actor SyncEngine {
    static let shared = SyncEngine()

    enum Trigger: Sendable {
        case healthKit, backgroundRefresh, foreground, manual, intent

        /// Minimum time since the last successful sync before this trigger runs again.
        var throttle: TimeInterval {
            switch self {
            case .manual, .intent: return 0
            case .foreground: return 5 * 60
            case .healthKit, .backgroundRefresh: return 15 * 60
            }
        }
    }

    struct Outcome: Sendable {
        var synced = 0
        var unchanged = 0
        var failed = 0
        var lastError: String?
        var today: HealthMetrics?
        var snapshot: HealthSnapshot?
    }

    private let healthKit = HealthKitManager.shared
    private let service = SyncService.shared
    private var inFlight: Task<Outcome, Never>?

    /// Failed days older than this are dropped from the retry queue.
    private static let retryWindowDays = 14
    private static let seriesRefreshInterval: TimeInterval = 3 * 3600
    private static let bulkChunkSize = 31

    // MARK: - Entry points

    func startObserving() async {
        await healthKit.startBackgroundDelivery {
            _ = await SyncEngine.shared.syncRecent(trigger: .healthKit)
        }
    }

    /// Syncs today, yesterday (once, after it ends) and any queued retries.
    /// Concurrent callers share the in-flight run instead of starting another.
    func syncRecent(trigger: Trigger) async -> Outcome {
        if let inFlight { return await inFlight.value }
        guard AppConfig.isConfigured else {
            return Outcome(lastError: SyncError.noConfiguration.localizedDescription)
        }
        let automatic = trigger != .manual && trigger != .intent
        if automatic, !AppConfig.autoSync { return Outcome() }
        if let last = SharedStore.lastSuccessfulSync, Date().timeIntervalSince(last) < trigger.throttle {
            return Outcome()
        }

        let task = Task { await self.performRecentSync(force: trigger == .manual) }
        inFlight = task
        let outcome = await task.value
        inFlight = nil
        return outcome
    }

    /// Uploads a date range in chunks through `/import-bulk` (one server commit per chunk).
    func backfill(from start: Date, to end: Date,
                  progress: @escaping @Sendable (_ done: Int, _ total: Int) -> Void) async -> Outcome {
        guard AppConfig.isConfigured else {
            return Outcome(lastError: SyncError.noConfiguration.localizedDescription)
        }
        let calendar = Calendar.current
        var dates: [Date] = []
        var cursor = calendar.startOfDay(for: min(start, end))
        let last = calendar.startOfDay(for: max(start, end))
        while cursor <= last {
            dates.append(cursor)
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }

        var collected: [HealthMetrics] = []
        for (index, date) in dates.enumerated() {
            if let metrics = try? await healthKit.queryMetrics(for: date), metrics.nonNilCount > 0 {
                collected.append(metrics)
            }
            progress(index + 1, dates.count)
        }

        var outcome = Outcome()
        for chunk in stride(from: 0, to: collected.count, by: Self.bulkChunkSize).map({
            Array(collected[$0..<min($0 + Self.bulkChunkSize, collected.count)])
        }) {
            let label = chunk.count == 1 ? chunk[0].date : "\(chunk[0].date) → \(chunk[chunk.count - 1].date)"
            let metricsCount = chunk.reduce(0) { $0 + $1.nonNilCount }
            do {
                try await service.syncBulk(days: chunk, serverURL: AppConfig.serverURL, token: AppConfig.token)
                outcome.synced += chunk.count
                Self.appendHistory(SyncRecord(id: UUID(), date: label, syncedAt: Date(),
                                              metricsCount: metricsCount, success: true, errorMessage: nil))
            } catch {
                outcome.failed += chunk.count
                outcome.lastError = error.localizedDescription
                Self.appendHistory(SyncRecord(id: UUID(), date: label, syncedAt: Date(), metricsCount: 0,
                                              success: false, errorMessage: error.localizedDescription))
            }
        }
        if outcome.synced > 0 {
            SharedStore.lastSuccessfulSync = Date()
            outcome.snapshot = await refreshInsights(today: nil, forcePrediction: true)
        }
        return outcome
    }

    /// Re-reads server analytics, refits the prediction when stale, and updates the widget.
    @discardableResult
    func refreshInsights(today: HealthMetrics?, forcePrediction: Bool = false) async -> HealthSnapshot? {
        guard AppConfig.isConfigured else { return SharedStore.snapshot }
        let serverURL = AppConfig.serverURL
        let token = AppConfig.token

        let trends = try? await service.get(TrendsResponse.self, path: "/api/trends", serverURL: serverURL, token: token)

        var prediction = SharedStore.prediction
        let seriesAge = SharedStore.lastSeriesFetch.map { Date().timeIntervalSince($0) } ?? .infinity
        if forcePrediction || prediction == nil || seriesAge > Self.seriesRefreshInterval,
           let series = try? await service.get(SeriesResponse.self, path: "/api/series",
                                               serverURL: serverURL, token: token) {
            prediction = RecoveryPredictor.predict(days: series.days, age: healthKit.age())
            SharedStore.prediction = prediction
            SharedStore.lastSeriesFetch = Date()
        }

        let todayKey = HealthKitManager.dateFormatter.string(from: Date())
        let previous = SharedStore.snapshot
        let brief = SharedStore.brief?.date == todayKey ? SharedStore.brief : nil
        let snapshot = HealthSnapshot(
            updatedAt: Date(),
            date: todayKey,
            recoveryScore: trends?.recovery?.score.map { Int($0.rounded()) } ?? previous?.recoveryScore,
            strain: trends?.todayStrain ?? previous?.strain,
            sleepHours: today?.sleepHours ?? previous?.sleepHours,
            sleepScore: trends?.recovery?.sleepScore.map { Int($0.rounded()) } ?? previous?.sleepScore,
            hrv: today?.hrv ?? previous?.hrv,
            restingHeartRate: today?.restingHeartRate ?? previous?.restingHeartRate,
            steps: today?.steps ?? previous?.steps,
            prediction: prediction,
            briefHeadline: brief?.headline
        )
        SharedStore.snapshot = snapshot
        WidgetCenter.shared.reloadAllTimelines()
        return snapshot
    }

    /// Today's brief, cached per day; regenerates when asked or when the cache is stale.
    func brief(regenerate: Bool = false) async -> BriefContent {
        let todayKey = HealthKitManager.dateFormatter.string(from: Date())
        if !regenerate, let cached = SharedStore.brief, cached.date == todayKey { return cached }

        let metrics = try? await healthKit.queryMetrics(for: Date())
        let snapshot = SharedStore.snapshot
        let brief = await BriefGenerator.generate(date: todayKey, metrics: metrics, snapshot: snapshot,
                                                  prediction: SharedStore.prediction)
        SharedStore.brief = brief
        if var updated = snapshot {
            updated.briefHeadline = brief.headline
            SharedStore.snapshot = updated
            WidgetCenter.shared.reloadAllTimelines()
        }
        return brief
    }

    // MARK: - Implementation

    private func performRecentSync(force: Bool) async -> Outcome {
        let calendar = Calendar.current
        let now = Date()
        let todayKey = HealthKitManager.dateFormatter.string(from: now)
        let yesterday = calendar.date(byAdding: .day, value: -1, to: now) ?? now
        let yesterdayKey = HealthKitManager.dateFormatter.string(from: yesterday)
        let retryCutoff = calendar.date(byAdding: .day, value: -Self.retryWindowDays, to: now) ?? now

        var targets: [String: Date] = [todayKey: now]
        if SharedStore.lastFinalizedDate != yesterdayKey { targets[yesterdayKey] = yesterday }
        var pending = SharedStore.pendingDates
        for key in pending {
            if let date = HealthKitManager.dateFormatter.date(from: key), date >= retryCutoff {
                targets[key] = date
            } else {
                pending.remove(key)
            }
        }

        var hashes = SharedStore.sentHashes
        var outcome = Outcome()
        for (key, date) in targets.sorted(by: { $0.key < $1.key }) {
            do {
                let metrics = try await healthKit.queryMetrics(for: date)
                if key == todayKey { outcome.today = metrics }
                // Nothing readable (e.g. device locked): leave any retry queued for later.
                guard metrics.nonNilCount > 0 else { continue }

                let hash = SHA256.hash(data: try SyncService.encode(metrics))
                    .map { String(format: "%02x", $0) }.joined()
                if !force, hashes[key] == hash {
                    outcome.unchanged += 1
                } else {
                    _ = try await service.sync(metrics: metrics, serverURL: AppConfig.serverURL, token: AppConfig.token)
                    hashes[key] = hash
                    outcome.synced += 1
                    Self.appendHistory(SyncRecord(id: UUID(), date: key, syncedAt: Date(),
                                                  metricsCount: metrics.nonNilCount, success: true, errorMessage: nil))
                }
                pending.remove(key)
                if key == yesterdayKey { SharedStore.lastFinalizedDate = yesterdayKey }
            } catch {
                pending.insert(key)
                outcome.failed += 1
                outcome.lastError = error.localizedDescription
                Self.appendHistory(SyncRecord(id: UUID(), date: key, syncedAt: Date(), metricsCount: 0,
                                              success: false, errorMessage: error.localizedDescription))
            }
        }

        SharedStore.pendingDates = pending
        SharedStore.sentHashes = hashes.filter { key, _ in
            (HealthKitManager.dateFormatter.date(from: key) ?? .distantPast) >= retryCutoff
        }
        if outcome.failed == 0 || outcome.synced > 0 {
            SharedStore.lastSuccessfulSync = Date()
        }
        if outcome.synced > 0 || force || SharedStore.snapshot?.date != todayKey {
            outcome.snapshot = await refreshInsights(today: outcome.today)
        }
        return outcome
    }

    // MARK: - History (app-private, shown in the Sync tab)

    static let historyKey = "syncHistory"

    static func loadHistory() -> [SyncRecord] {
        guard let data = UserDefaults.standard.data(forKey: historyKey),
              let records = try? JSONDecoder().decode([SyncRecord].self, from: data) else { return [] }
        return records
    }

    private static func appendHistory(_ record: SyncRecord) {
        var history = loadHistory()
        history.insert(record, at: 0)
        if let data = try? JSONEncoder().encode(Array(history.prefix(50))) {
            UserDefaults.standard.set(data, forKey: historyKey)
        }
    }
}
