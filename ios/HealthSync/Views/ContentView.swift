import SwiftUI

struct ContentView: View {
    @EnvironmentObject var syncManager: SyncManager

    var body: some View {
        TabView {
            Tab("Today", systemImage: "heart.text.square") {
                DashboardView()
            }
            Tab("Dashboard", systemImage: "chart.bar.xaxis") {
                WebDashboardView()
            }
            Tab("Sync", systemImage: "arrow.triangle.2.circlepath") {
                SyncView()
            }
            Tab("Settings", systemImage: "gear") {
                SettingsView()
            }
        }
        .task {
            await syncManager.requestHealthKitAccess()
        }
    }
}
