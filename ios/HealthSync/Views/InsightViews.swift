import SwiftUI

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
                .animation(.easeOut(duration: 1.0), value: score)
            VStack(spacing: 0) {
                Text(score.map { "\($0)%" } ?? "—")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText())
                Text("Recovery")
                    .font(.caption2.weight(.medium))
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
            VStack(alignment: .leading, spacing: 10) {
                stat("Strain", value: snapshot?.strain.map { String(format: "%.1f", $0) }, icon: "flame.fill", tint: .orange)
                stat("Sleep", value: snapshot?.sleepHours.map { String(format: "%.1f h", $0) }, icon: "bed.double.fill", tint: .indigo)
                stat("HRV", value: snapshot?.hrv.map { String(format: "%.0f ms", $0) }, icon: "waveform.path.ecg", tint: .pink)
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }

    private func stat(_ label: String, value: String?, icon: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .frame(width: 20)
                .font(.subheadline)
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value ?? "—")
                .font(.system(.body, design: .rounded, weight: .semibold))
                .contentTransition(.numericText())
        }
        .font(.subheadline)
    }
}

struct PredictionCard: View {
    let prediction: RecoveryPrediction
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Tomorrow's Recovery", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text("\(prediction.score)%")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .foregroundStyle(recoveryColor(prediction.score))
                    .contentTransition(.numericText())
            }
            Text("Likely \(prediction.low)–\(prediction.high)% with \(hours(prediction.assumedSleepHours)) of sleep")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                ForEach(prediction.scenarios, id: \.self) { scenario in
                    VStack(spacing: 4) {
                        Text("\(scenario.score)%")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(recoveryColor(scenario.score))
                        Text(hours(scenario.sleepHours))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10))
                }
            }

            if !compact {
                ForEach(prediction.drivers, id: \.self) { driver in
                    HStack(spacing: 8) {
                        Image(systemName: driver.impact >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(driver.impact >= 0 ? .green : .red)
                            .frame(width: 16)
                        Text(driver.label)
                            .font(.caption)
                        Spacer()
                        Text(String(format: "%+.1f", driver.impact))
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                Text(footnote)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
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
                Label {
                    Text("Daily Brief")
                        .font(.subheadline.weight(.bold))
                } icon: {
                    Image(systemName: brief?.generatedOnDevice == true ? "apple.intelligence" : "text.bubble")
                }
                Spacer()
                if isLoading {
                    ProgressView()
                } else {
                    Button("Regenerate", systemImage: "arrow.clockwise", action: regenerate)
                        .labelStyle(.iconOnly)
                        .font(.subheadline)
                }
            }
            if let brief {
                Text(brief.headline)
                    .font(.title3.weight(.semibold))
                Text(brief.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                ForEach(brief.focus, id: \.self) { item in
                    Label {
                        Text(item).font(.subheadline)
                    } icon: {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .font(.caption)
                    }
                }
                if !brief.watchOut.isEmpty {
                    Label {
                        Text(brief.watchOut)
                            .font(.subheadline)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .font(.caption)
                    }
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
    }
}
