import SwiftUI
import BackgroundTasks

@MainActor
final class SyncManager: ObservableObject {
    static let shared = SyncManager()

    @AppStorage("serverURL") var serverURL: String = "https://apple-health.brain-store.workers.dev"
    @AppStorage("ingestToken") var ingestToken: String = ""
    @AppStorage("autoSync") var autoSync: Bool = true
    @AppStorage("lastSyncDate") var lastSyncDateString: String = ""

    @Published var isSyncing = false
    @Published var lastError: String?
    @Published var todayMetrics: HealthMetrics?
    @Published var syncHistory: [SyncRecord] = []
    @Published var healthKitAuthorized = false

    private let healthKit = HealthKitManager.shared
    private let syncService = SyncService.shared

    init() {
        loadSyncHistory()
    }

    var isConfigured: Bool {
        !serverURL.isEmpty && !ingestToken.isEmpty
    }

    var lastSyncDate: Date? {
        guard !lastSyncDateString.isEmpty else { return nil }
        return ISO8601DateFormatter().date(from: lastSyncDateString)
    }

    func requestHealthKitAccess() async {
        guard healthKit.isAvailable else {
            lastError = "HealthKit not available on this device"
            return
        }
        do {
            try await healthKit.requestAuthorization()
            healthKitAuthorized = true
        } catch {
            lastError = error.localizedDescription
        }
    }

    func syncToday() async {
        guard isConfigured else {
            lastError = SyncError.noConfiguration.localizedDescription
            return
        }

        isSyncing = true
        lastError = nil

        do {
            let metrics = try await healthKit.queryMetrics(for: Date())
            todayMetrics = metrics

            if metrics.nonNilCount == 0 {
                lastError = "No health data found for today"
                isSyncing = false
                return
            }

            let response = try await syncService.sync(
                metrics: metrics, serverURL: serverURL, token: ingestToken
            )

            let record = SyncRecord(
                id: UUID(),
                date: metrics.date,
                syncedAt: Date(),
                metricsCount: metrics.nonNilCount,
                success: response.ok ?? false,
                errorMessage: response.error
            )
            appendSyncRecord(record)
            lastSyncDateString = ISO8601DateFormatter().string(from: Date())

            if let err = response.error {
                lastError = err
            }
        } catch {
            let record = SyncRecord(
                id: UUID(),
                date: HealthKitManager.dateFormatter.string(from: Date()),
                syncedAt: Date(),
                metricsCount: 0,
                success: false,
                errorMessage: error.localizedDescription
            )
            appendSyncRecord(record)
            lastError = error.localizedDescription
        }

        isSyncing = false
    }

    func syncDateRange(from start: Date, to end: Date) async {
        guard isConfigured else {
            lastError = SyncError.noConfiguration.localizedDescription
            return
        }

        isSyncing = true
        lastError = nil

        var current = Calendar.current.startOfDay(for: start)
        let endDay = Calendar.current.startOfDay(for: end)
        var synced = 0
        var failed = 0

        while current <= endDay {
            do {
                let metrics = try await healthKit.queryMetrics(for: current)
                if metrics.nonNilCount > 0 {
                    let _ = try await syncService.sync(
                        metrics: metrics, serverURL: serverURL, token: ingestToken
                    )
                    synced += 1
                }
            } catch {
                failed += 1
            }
            current = Calendar.current.date(byAdding: .day, value: 1, to: current) ?? endDay.addingTimeInterval(86400)
        }

        lastSyncDateString = ISO8601DateFormatter().string(from: Date())
        if failed > 0 {
            lastError = "Synced \(synced) days, \(failed) failed"
        }
        isSyncing = false
    }

    nonisolated func performBackgroundSync() async {
        let serverURL = await self.serverURL
        let ingestToken = await self.ingestToken
        guard !serverURL.isEmpty, !ingestToken.isEmpty else { return }

        do {
            let metrics = try await HealthKitManager.shared.queryMetrics(for: Date())
            guard metrics.nonNilCount > 0 else { return }
            let _ = try await SyncService.shared.sync(
                metrics: metrics, serverURL: serverURL, token: ingestToken
            )
        } catch {
            // Background sync failures are silent
        }
    }

    static func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: "com.jaiparmani.HealthSync.refresh")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }

    // MARK: - Persistence

    private func appendSyncRecord(_ record: SyncRecord) {
        syncHistory.insert(record, at: 0)
        if syncHistory.count > 50 { syncHistory = Array(syncHistory.prefix(50)) }
        saveSyncHistory()
    }

    private func saveSyncHistory() {
        if let data = try? JSONEncoder().encode(syncHistory) {
            UserDefaults.standard.set(data, forKey: "syncHistory")
        }
    }

    private func loadSyncHistory() {
        guard let data = UserDefaults.standard.data(forKey: "syncHistory"),
              let records = try? JSONDecoder().decode([SyncRecord].self, from: data) else { return }
        syncHistory = records
    }
}
