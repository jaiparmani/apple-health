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
                    HStack {
                        SecureField("Ingest Token", text: $syncManager.ingestToken)
                            .textContentType(.password)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        PasteButton(payloadType: String.self) { strings in
                            if let token = strings.first?.trimmingCharacters(in: .whitespacesAndNewlines) {
                                syncManager.ingestToken = token
                            }
                        }
                        .labelStyle(.iconOnly)
                        .buttonBorderShape(.capsule)
                    }
                } header: {
                    Text("Server")
                } footer: {
                    Text("Your Cloudflare Worker URL (e.g. https://apple-health.your-subdomain.workers.dev) and the INGEST_TOKEN you set up. The token is stored in the iOS Keychain.")
                }

                Section {
                    Toggle("Auto Sync", isOn: $syncManager.autoSync)
                        .onChange(of: syncManager.autoSync) {
                            SyncManager.scheduleBackgroundSync()
                        }
                } header: {
                    Text("Background")
                } footer: {
                    Text("Syncs whenever Apple Health records new sleep, HRV, resting heart rate or workouts (at most every 15 minutes), plus a periodic background refresh. Failed days are retried automatically for 14 days.")
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
