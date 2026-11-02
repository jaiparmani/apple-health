import SwiftUI

/// WHOOP-style recovery colour bands: green 67+, yellow 34-66, red below 34.
func recoveryColor(_ score: Int?) -> Color {
    guard let score else { return .gray }
    switch score {
    case 67...: return .green
    case 34..<67: return .yellow
    default: return .red
    }
}

struct RecoveryRing: View {
    let score: Int?
    var lineWidth: CGFloat = 10

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: CGFloat(score ?? 0) / 100)
                .stroke(recoveryColor(score), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(score.map { "\($0)%" } ?? "—")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .minimumScaleFactor(0.5)
                Text("Recovery")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(lineWidth)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(score.map { "Recovery \($0) percent" } ?? "Recovery unavailable")
    }
}

struct TodaySummaryCard: View {
    let snapshot: HealthSnapshot?

    var body: some View {
        HStack(spacing: 20) {
            RecoveryRing(score: snapshot?.recoveryScore)
                .frame(width: 96, height: 96)
            VStack(alignment: .leading, spacing: 8) {
                stat("Strain", value: snapshot?.strain.map { String(format: "%.1f", $0) }, icon: "flame.fill", tint: .orange)
                stat("Sleep", value: snapshot?.sleepHours.map { String(format: "%.1f h", $0) }, icon: "bed.double.fill", tint: .indigo)
                stat("HRV", value: snapshot?.hrv.map { String(format: "%.0f ms", $0) }, icon: "waveform.path.ecg", tint: .pink)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }

    private func stat(_ label: String, value: String?, icon: String, tint: Color) -> some View {
        HStack {
            Image(systemName: icon).foregroundStyle(tint).frame(width: 20)
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value ?? "—").font(.system(.body, design: .rounded, weight: .semibold))
        }
        .font(.subheadline)
    }
}

struct PredictionCard: View {
    let prediction: RecoveryPrediction
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Tomorrow's Recovery", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.headline)
                Spacer()
                Text("\(prediction.score)%")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .foregroundStyle(recoveryColor(prediction.score))
            }
            Text("Likely \(prediction.low)–\(prediction.high)% with \(hours(prediction.assumedSleepHours)) of sleep")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // "What if" sleep scenarios
            HStack(spacing: 8) {
                ForEach(prediction.scenarios, id: \.self) { scenario in
                    VStack(spacing: 2) {
                        Text("\(scenario.score)%")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(recoveryColor(scenario.score))
                        Text(hours(scenario.sleepHours))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                }
            }

            if !compact {
                ForEach(prediction.drivers, id: \.self) { driver in
                    HStack {
                        Image(systemName: driver.impact >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .foregroundStyle(driver.impact >= 0 ? .green : .red)
                        Text(driver.label)
                        Spacer()
                        Text(String(format: "%+.1f", driver.impact))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                }
                Text(footnote)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }

    private var footnote: String {
        guard prediction.isModelBased else {
            return "Early estimate — the model unlocks after \(RecoveryPredictor.minimumTrainingDays) days with sleep and recovery data (\(prediction.trainingDays) so far)."
        }
        var text = "Learned from \(prediction.trainingDays) of your days. Impacts are vs. your typical day."
        if let error = prediction.backtestError {
            text += String(format: " Recent accuracy ±%.0f points.", error)
        }
        return text
    }

    private func hours(_ value: Double) -> String { String(format: "%gh", value) }
}

struct BriefCard: View {
    let brief: BriefContent?
    let isLoading: Bool
    let regenerate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Daily Brief", systemImage: brief?.generatedOnDevice == true ? "apple.intelligence" : "text.bubble")
                    .font(.headline)
                Spacer()
                if isLoading {
                    ProgressView()
                } else {
                    Button("Regenerate", systemImage: "arrow.clockwise", action: regenerate)
                        .labelStyle(.iconOnly)
                }
            }
            if let brief {
                Text(brief.headline).font(.title3.weight(.semibold))
                Text(brief.summary).font(.subheadline)
                ForEach(brief.focus, id: \.self) { item in
                    Label(item, systemImage: "checkmark.circle").font(.subheadline)
                }
                if !brief.watchOut.isEmpty {
                    Label(brief.watchOut, systemImage: "exclamationmark.triangle")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                }
                Text(brief.generatedOnDevice ? "Written on-device by Apple Intelligence" : "Rule-based (Apple Intelligence unavailable)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else if !isLoading {
                Text("Your brief appears after the first sync of the day.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }
}
