import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var syncManager: SyncManager

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Server URL", text: $syncManager.serverURL)
                        .textContentType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("Ingest Token", text: $syncManager.ingestToken)
                        .textContentType(.password)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Server")
                } footer: {
                    Text("Your Cloudflare Worker URL (e.g. https://apple-health.your-subdomain.workers.dev) and the INGEST_TOKEN you set up.")
                }

                Section {
                    Toggle("Auto Sync", isOn: $syncManager.autoSync)
                } header: {
                    Text("Background")
                } footer: {
                    Text("Automatically sync health data every few hours in the background.")
                }

                Section {
                    HStack {
                        Text("HealthKit")
                        Spacer()
                        if syncManager.healthKitAuthorized {
                            Label("Authorized", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Button("Request Access") {
                                Task { await syncManager.requestHealthKitAccess() }
                            }
                        }
                    }
                    HStack {
                        Text("Server Connection")
                        Spacer()
                        if syncManager.isConfigured {
                            Label("Configured", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Text("Not configured")
                                .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Status")
                }

                Section {
                    Link("View Dashboard", destination: URL(string: syncManager.serverURL.isEmpty ? "about:blank" : syncManager.serverURL)!)
                        .disabled(syncManager.serverURL.isEmpty)
                } header: {
                    Text("Links")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
