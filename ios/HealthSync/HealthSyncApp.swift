import SwiftUI
import BackgroundTasks

@main
struct HealthSyncApp: App {
    @StateObject private var syncManager = SyncManager.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: SyncManager.refreshTaskIdentifier,
            using: nil
        ) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            let work = Task {
                _ = await SyncEngine.shared.syncRecent(trigger: .backgroundRefresh)
                task.setTaskCompleted(success: true)
                SyncManager.scheduleBackgroundSync()
            }
            task.expirationHandler = { work.cancel() }
        }

        // HealthKit relaunches the app in the background for new samples and expects
        // the observer queries to be re-registered on every launch.
        Task { await SyncEngine.shared.startObserving() }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(syncManager)
                .onAppear {
                    SyncManager.scheduleBackgroundSync()
                }
                .onChange(of: scenePhase, initial: true) {
                    guard scenePhase == .active else { return }
                    Task { await syncManager.onForeground() }
                }
        }
    }
}
