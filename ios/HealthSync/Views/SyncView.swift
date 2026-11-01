import SwiftUI

struct SyncView: View {
    @EnvironmentObject var syncManager: SyncManager
    @State private var showBackfill = false
    @State private var backfillStart = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
    @State private var backfillEnd = Date()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    syncButton
                    statusRow
                } header: {
                    Text("Quick Sync")
                }

                Section {
                    Button("Backfill Date Range") { showBackfill.toggle() }
                    if showBackfill {
                        DatePicker("From", selection: $backfillStart, displayedComponents: .date)
                        DatePicker("To", selection: $backfillEnd, displayedComponents: .date)
                        Button("Sync Range") {
                            Task {
                                await syncManager.syncDateRange(from: backfillStart, to: backfillEnd)
                            }
                        }
                        .disabled(syncManager.isSyncing)
                    }
                } header: {
                    Text("Backfill")
                }

                if !syncManager.syncHistory.isEmpty {
                    Section {
                        ForEach(syncManager.syncHistory) { record in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(record.date)
                                        .font(.subheadline.weight(.medium))
                                    Text("\(record.metricsCount) metrics")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Image(systemName: record.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                        .foregroundStyle(record.success ? .green : .red)
                                    Text(record.syncedAt, style: .relative)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Text("History")
                    }
                }
            }
            .navigationTitle("Sync")
        }
    }

    private var syncButton: some View {
        Button {
            Task { await syncManager.syncToday() }
        } label: {
            HStack {
                Spacer()
                if syncManager.isSyncing {
                    ProgressView()
                        .padding(.trailing, 8)
                    Text("Syncing...")
                } else {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text("Sync Today")
                }
                Spacer()
            }
            .font(.headline)
            .padding(.vertical, 4)
        }
        .disabled(syncManager.isSyncing || !syncManager.isConfigured)
    }

    @ViewBuilder
    private var statusRow: some View {
        if let error = syncManager.lastError {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(.red)
        }
        if let lastSync = syncManager.lastSyncDate {
            Label("Last sync: \(lastSync, style: .relative) ago", systemImage: "clock")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
