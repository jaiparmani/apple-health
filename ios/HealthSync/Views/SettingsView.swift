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
                    Text("Your Cloudflare Worker URL and the INGEST_TOKEN. The token is stored in the iOS Keychain.")
                }

                Section {
                    Toggle("Auto Sync", isOn: $syncManager.autoSync)
                        .onChange(of: syncManager.autoSync) {
                            SyncManager.scheduleBackgroundSync()
                        }
                } header: {
                    Text("Background")
                } footer: {
                    Text("Syncs when Apple Health records new data (at most every 15 minutes), plus periodic background refresh.")
                }

                Section("Status") {
                    HStack {
                        Label("HealthKit", systemImage: "heart.fill")
                            .foregroundStyle(.primary)
                        Spacer()
                        if syncManager.healthKitAuthorized {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Button("Request") {
                                Task { await syncManager.requestHealthKitAccess() }
                            }
                            .font(.subheadline.weight(.medium))
                        }
                    }
                    HStack {
                        Label("Server", systemImage: "server.rack")
                            .foregroundStyle(.primary)
                        Spacer()
                        if syncManager.isConfigured {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Text("Not configured")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if syncManager.isConfigured, let url = URL(string: syncManager.serverURL) {
                    Section("Links") {
                        Link(destination: url) {
                            Label("Open Dashboard in Safari", systemImage: "safari")
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
