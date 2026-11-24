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

                Section {
                    HStack {
                        Label("HealthKit", systemImage: "heart.fill")
                            .foregroundStyle(.primary)
                        Spacer()
                        healthAccessControl
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
                } header: {
                    Text("Status")
                } footer: {
                    healthAccessFooter
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
            .task { await syncManager.refreshHealthAccess() }
        }
    }

    @ViewBuilder
    private var healthAccessControl: some View {
        switch syncManager.healthAccess {
        case .granted:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .unavailable:
            Text("Unavailable")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        case .denied:
            Button("Open Settings") { syncManager.openHealthSettings() }
                .font(.subheadline.weight(.medium))
        case .needsRequest, .unknown:
            if syncManager.isRequestingAccess {
                ProgressView()
            } else {
                Button("Allow") {
                    Task { await syncManager.requestHealthKitAccess() }
                }
                .font(.subheadline.weight(.medium))
            }
        }
    }

    @ViewBuilder
    private var healthAccessFooter: some View {
        switch syncManager.healthAccess {
        case .denied:
            Text("iOS only shows the Health permission sheet once. Turn access on in Settings → Apps → HealthSync → Health → Data Access, or in the Health app → profile → Apps → HealthSync → Turn On All.")
        case .unavailable:
            Text("HealthKit isn't available on this device.")
        default:
            if let error = syncManager.lastError, !syncManager.healthKitAuthorized {
                Text(error).foregroundStyle(.red)
            }
        }
    }
}
