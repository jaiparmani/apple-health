import SwiftUI
import BackgroundTasks

/// UI-facing state. All actual sync work is delegated to `SyncEngine`, which is also
/// used by background delivery, BGTask refreshes and App Intents.
@MainActor
final class SyncManager: ObservableObject {
    static let shared = SyncManager()

    @AppStorage("serverURL") var serverURL: String = AppConfig.defaultServerURL
    @AppStorage("autoSync") var autoSync: Bool = true

    /// Stored in the Keychain, never in UserDefaults or source.
    @Published var ingestToken: String {
        didSet { AppConfig.token = ingestToken }
    }

    @Published var isSyncing = false
    @Published var lastError: String?
    @Published var todayMetrics: HealthMetrics?
    @Published var syncHistory: [SyncRecord] = []
    @Published var healthAccess: HealthAccess = .unknown
    @Published var isRequestingAccess = false
    var healthKitAuthorized: Bool { healthAccess == .granted }
    @Published var lastSyncDate: Date?
    @Published var snapshot: HealthSnapshot?
    @Published var prediction: RecoveryPrediction?
    @Published var brief: BriefContent?
    @Published var isGeneratingBrief = false
    @Published var backfillProgress: (done: Int, total: Int)?

    private let engine = SyncEngine.shared

    init() {
        AppConfig.migrateLegacyToken()
        ingestToken = AppConfig.token
        reloadFromStore()
    }

    var isConfigured: Bool {
        !serverURL.isEmpty && !ingestToken.isEmpty
    }

    var dashboardURL: URL? {
        URL(string: AppConfig.serverURL)
    }

    enum HealthAccess: Equatable {
        case unknown
        case unavailable
        /// iOS will show the permission sheet.
        case needsRequest
        /// The sheet was already shown but nothing is readable — iOS won't show it again,
        /// so the user must turn access on in Settings.
        case denied
        case granted
    }

    /// Works out the real access state without prompting.
    func refreshHealthAccess() async {
        let hk = HealthKitManager.shared
        guard hk.isAvailable else { healthAccess = .unavailable; return }
        if await hk.needsAuthorizationRequest() {
            healthAccess = .needsRequest
        } else {
            healthAccess = await hk.canReadData() ? .granted : .denied
        }
    }

    /// Shows the HealthKit sheet when iOS still allows it; otherwise opens Settings,
    /// since a second `requestAuthorization` silently does nothing.
    func requestHealthKitAccess() async {
        guard !isRequestingAccess else { return }
        let hk = HealthKitManager.shared
        guard hk.isAvailable else {
            healthAccess = .unavailable
            lastError = HealthError.notAvailable.localizedDescription
            return
        }
        isRequestingAccess = true
        defer { isRequestingAccess = false }

        if await hk.needsAuthorizationRequest() {
            do {
                try await hk.requestAuthorization()
            } catch {
                lastError = "Couldn't ask for Health access: \(error.localizedDescription)"
            }
        }
        await refreshHealthAccess()
        if healthAccess == .granted {
            lastError = nil
            await engine.startObserving()
        }
    }

    /// The app's page in Settings, which has the Health → Data Access switches.
    func openHealthSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    func syncToday() async {
        guard isConfigured else {
            lastError = SyncError.noConfiguration.localizedDescription
            return
        }
        isSyncing = true
        lastError = nil
        let outcome = await engine.syncRecent(trigger: .manual)
        apply(outcome)
        isSyncing = false
    }

    func syncDateRange(from start: Date, to end: Date) async {
        guard isConfigured else {
            lastError = SyncError.noConfiguration.localizedDescription
            return
        }
        isSyncing = true
        lastError = nil
        backfillProgress = (0, 1)
        let outcome = await engine.backfill(from: start, to: end) { done, total in
            Task { @MainActor in SyncManager.shared.backfillProgress = (done, total) }
        }
        apply(outcome)
        if outcome.failed > 0 {
            lastError = "Synced \(outcome.synced) days, \(outcome.failed) failed: \(outcome.lastError ?? "")"
        }
        backfillProgress = nil
        isSyncing = false
    }

    /// Called whenever the app becomes active: catch up, then make sure today's brief exists.
    func onForeground() async {
        reloadFromStore()
        // Coming back from Settings may have flipped access on.
        let wasGranted = healthKitAuthorized
        await refreshHealthAccess()
        if healthKitAuthorized && !wasGranted { await engine.startObserving() }
        guard isConfigured else { return }
        let outcome = await engine.syncRecent(trigger: .foreground)
        apply(outcome)
        if brief?.date != HealthKitManager.dateFormatter.string(from: Date()) {
            await loadBrief(regenerate: false)
        }
    }

    func refreshInsights() async {
        snapshot = await engine.refreshInsights(today: todayMetrics, forcePrediction: true)
        reloadFromStore()
    }

    func loadBrief(regenerate: Bool) async {
        isGeneratingBrief = true
        brief = await engine.brief(regenerate: regenerate)
        snapshot = SharedStore.snapshot
        isGeneratingBrief = false
    }

    private func apply(_ outcome: SyncEngine.Outcome) {
        if let today = outcome.today { todayMetrics = today }
        if let error = outcome.lastError { lastError = error }
        reloadFromStore()
    }

    private func reloadFromStore() {
        syncHistory = SyncEngine.loadHistory()
        lastSyncDate = SharedStore.lastSuccessfulSync
        snapshot = SharedStore.snapshot
        prediction = SharedStore.prediction
        brief = SharedStore.brief
    }

    // MARK: - BGTaskScheduler fallback

    static let autoSyncInterval: TimeInterval = 2 * 3600
    static let refreshTaskIdentifier = "com.jaiparmani.HealthSync.refresh"

    /// Submits (or cancels) the background refresh request based on the Auto Sync setting.
    /// HealthKit background delivery is the primary trigger; this is a safety net.
    static func scheduleBackgroundSync() {
        guard AppConfig.autoSync else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: refreshTaskIdentifier)
            return
        }
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: autoSyncInterval)
        try? BGTaskScheduler.shared.submit(request)
    }
}
