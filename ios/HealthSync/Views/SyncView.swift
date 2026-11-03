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
                    DisclosureGroup("Backfill Date Range", isExpanded: $showBackfill) {
                        DatePicker("From", selection: $backfillStart, displayedComponents: .date)
                        DatePicker("To", selection: $backfillEnd, displayedComponents: .date)
                        Button {
                            Task {
                                await syncManager.syncDateRange(from: backfillStart, to: backfillEnd)
                            }
                        } label: {
                            Label("Sync Range", systemImage: "calendar.badge.clock")
                                .frame(maxWidth: .infinity)
                                .font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(syncManager.isSyncing)
                    }
                    if let progress = syncManager.backfillProgress {
                        ProgressView(value: Double(progress.done), total: Double(max(progress.total, 1))) {
                            Text("Reading Health data… \(progress.done)/\(progress.total) days")
                                .font(.caption)
                        }
                        .tint(.green)
                    }
                } footer: {
                    Text("Uploads in 31-day batches. Re-run for the last 60 days once after updating.")
                }

                if !syncManager.syncHistory.isEmpty {
                    Section("History") {
                        ForEach(syncManager.syncHistory) { record in
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(record.date)
                                        .font(.subheadline.weight(.medium))
                                    Text(record.errorMessage ?? "\(record.metricsCount) metrics")
                                        .font(.caption)
                                        .foregroundStyle(record.success ? .secondary : .red)
                                        .lineLimit(2)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 3) {
                                    Image(systemName: record.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                        .foregroundStyle(record.success ? .green : .red)
                                        .font(.subheadline)
                                    Text(record.syncedAt, style: .relative)
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
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
                    Text("Syncing…")
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
            Label {
                Text(error)
                    .font(.subheadline)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        if let lastSync = syncManager.lastSyncDate {
            Label {
                Text("Last sync: \(lastSync, style: .relative) ago")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } icon: {
                Image(systemName: "clock")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
