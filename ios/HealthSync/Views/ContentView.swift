import SwiftUI

struct ContentView: View {
    @EnvironmentObject var syncManager: SyncManager

    var body: some View {
        TabView {
            Tab("Today", systemImage: "heart.text.square.fill") {
                DashboardView()
            }
            Tab("Dashboard", systemImage: "chart.bar.xaxis") {
                WebDashboardView()
            }
            Tab("Sync", systemImage: "arrow.triangle.2.circlepath") {
                SyncView()
            }
            Tab("Settings", systemImage: "gearshape") {
                SettingsView()
            }
        }
        .tint(.green)
        .task {
            await syncManager.requestHealthKitAccess()
        }
    }
}
