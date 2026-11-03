import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var syncManager: SyncManager
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if !syncManager.isConfigured {
                        configBanner
                    }

                    TodaySummaryCard(snapshot: syncManager.snapshot)

                    BriefCard(brief: syncManager.brief, isLoading: syncManager.isGeneratingBrief) {
                        Task { await syncManager.loadBrief(regenerate: true) }
                    }

                    if let prediction = syncManager.prediction {
                        PredictionCard(prediction: prediction)
                    }

                    if let metrics = syncManager.todayMetrics {
                        metricsGrid(metrics)
                    } else {
                        emptyState
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            isLoading = true
                            await loadMetrics()
                            await syncManager.refreshInsights()
                            isLoading = false
                        }
                    } label: {
                        if isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(isLoading)
                }
            }
            .task { await loadMetrics() }
        }
    }

    private var configBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title3)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("Setup Required")
                    .font(.subheadline.weight(.semibold))
                Text("Configure server URL and token in Settings")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding()
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(.orange.opacity(0.2), lineWidth: 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 52))
                .foregroundStyle(.quaternary)
            Text("No metrics yet")
                .font(.title3.weight(.semibold))
            Text("Tap refresh to load today's HealthKit data")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private func loadMetrics() async {
        guard syncManager.healthKitAuthorized else { return }
        do {
            syncManager.todayMetrics = try await HealthKitManager.shared.queryMetrics(for: Date())
        } catch {
            syncManager.lastError = error.localizedDescription
        }
    }

    @ViewBuilder
    private func metricsGrid(_ m: HealthMetrics) -> some View {
        let sections: [(String, String, Color, [(String, String?)])] = [
            ("Heart & Recovery", "heart.fill", .pink, [
                ("Resting HR", fmt(m.restingHeartRate, unit: "bpm")),
                ("HRV", fmt(m.hrv, unit: "ms")),
                ("VO2 Max", fmt(m.vo2max, unit: "ml/kg/min")),
                ("Avg HR", fmt(m.heartRateAvg, unit: "bpm")),
                ("SpO2", pctFmt(m.oxygenSaturation)),
                ("Resp Rate", fmt(m.respiratoryRate, unit: "/min")),
            ]),
            ("Activity", "figure.run", .green, [
                ("Steps", intFmt(m.steps)),
                ("Active Energy", fmt(m.activeEnergy, unit: "kcal")),
                ("Exercise", fmt(m.exerciseMinutes, unit: "min")),
                ("Distance", fmt(m.distanceKm, unit: "km", decimals: 1)),
                ("Flights", intFmt(m.flightsClimbed)),
                ("Stand", fmt(m.standMinutes, unit: "min")),
            ]),
            ("Sleep", "bed.double.fill", .indigo, [
                ("Total Sleep", fmt(m.sleepHours, unit: "hr", decimals: 1)),
                ("Deep", fmt(m.sleepDeepHours, unit: "hr", decimals: 1)),
                ("REM", fmt(m.sleepRemHours, unit: "hr", decimals: 1)),
                ("Core", fmt(m.sleepCoreHours, unit: "hr", decimals: 1)),
                ("Awake", fmt(m.sleepAwakeHours, unit: "hr", decimals: 1)),
                ("In Bed", fmt(m.sleepInBedHours, unit: "hr", decimals: 1)),
            ]),
            ("Mobility", "figure.walk", .cyan, [
                ("Walk Speed", fmt(m.walkingSpeed, unit: "m/s", decimals: 2)),
                ("Step Length", fmt(m.walkingStepLength, unit: "cm")),
                ("Asymmetry", pctFmt(m.walkingAsymmetryPct)),
                ("Dbl Support", pctFmt(m.walkingDoubleSupportPct)),
            ]),
            ("Body", "scalemass.fill", .orange, [
                ("Weight", fmt(m.weightKg, unit: "kg", decimals: 1)),
                ("Body Fat", pctFmt(m.bodyFatPct)),
                ("BP Systolic", fmt(m.bloodPressureSystolic, unit: "mmHg")),
                ("BP Diastolic", fmt(m.bloodPressureDiastolic, unit: "mmHg")),
                ("Glucose", fmt(m.bloodGlucose, unit: "mg/dL")),
            ]),
        ]

        ForEach(sections, id: \.0) { title, icon, tint, items in
            let available = items.filter { $0.1 != nil }
            if !available.isEmpty {
                MetricSection(title: title, icon: icon, tint: tint, items: available)
            }
        }
    }

    private func fmt(_ value: Double?, unit: String, decimals: Int = 0) -> String? {
        guard let v = value else { return nil }
        return "\(String(format: "%.\(decimals)f", v)) \(unit)"
    }

    private func intFmt(_ value: Double?) -> String? {
        guard let v = value else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: v))
    }

    private func pctFmt(_ value: Double?) -> String? {
        guard let v = value else { return nil }
        let pct = v > 1 ? v : v * 100
        return "\(String(format: "%.1f", pct))%"
    }
}

struct MetricSection: View {
    let title: String
    let icon: String
    let tint: Color
    let items: [(String, String?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label {
                Text(title)
                    .font(.subheadline.weight(.bold))
            } icon: {
                Image(systemName: icon)
                    .foregroundStyle(tint)
            }
            .padding(.bottom, 2)

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 10),
                GridItem(.flexible(), spacing: 10),
            ], spacing: 10) {
                ForEach(items, id: \.0) { label, value in
                    if let value {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(label)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(value)
                                .font(.system(.body, design: .rounded, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}
