import SwiftUI
import BackgroundTasks

@main
struct HealthSyncApp: App {
    @StateObject private var syncManager = SyncManager()

    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.jaiparmani.HealthSync.refresh",
            using: nil
        ) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            Task {
                await SyncManager.shared.performBackgroundSync()
                task.setTaskCompleted(success: true)
                SyncManager.scheduleBackgroundSync()
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(syncManager)
                .onAppear {
                    SyncManager.scheduleBackgroundSync()
                }
        }
    }
}
