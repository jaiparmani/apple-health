import WidgetKit
import SwiftUI

/// Decodes the snapshot the app writes into the App Group. Keep in sync with
/// `HealthSnapshot` / `RecoveryPrediction` in the app target (only fields the widget needs).
struct WidgetSnapshot: Decodable {
    struct Prediction: Decodable {
        let score: Int
        let low: Int
        let high: Int
        let assumedSleepHours: Double
    }

    var updatedAt: Date
    var date: String
    var recoveryScore: Int?
    var strain: Double?
    var sleepHours: Double?
    var hrv: Double?
    var prediction: Prediction?
    var briefHeadline: String?

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: "group.com.jaiparmani.HealthSync")?.data(forKey: "snapshot") else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }

    static let placeholder = WidgetSnapshot(
        updatedAt: .now, date: "", recoveryScore: 72, strain: 11.4, sleepHours: 7.6, hrv: 64,
        prediction: Prediction(score: 68, low: 61, high: 75, assumedSleepHours: 7.5),
        briefHeadline: "Green day — you're primed to push."
    )
}

struct HealthEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> HealthEntry {
        HealthEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (HealthEntry) -> Void) {
        completion(HealthEntry(date: .now, snapshot: context.isPreview ? .placeholder : WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HealthEntry>) -> Void) {
        // The app reloads timelines after every sync; this is only a fallback refresh.
        let entry = HealthEntry(date: .now, snapshot: WidgetSnapshot.load())
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(3600))))
    }
}

private func recoveryColor(_ score: Int?) -> Color {
    guard let score else { return .gray }
    switch score {
    case 67...: return .green
    case 34..<67: return .yellow
    default: return .red
    }
}

private struct Ring: View {
    let score: Int?
    let lineWidth: CGFloat

    var body: some View {
        ZStack {
            Circle().stroke(.secondary.opacity(0.25), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: CGFloat(score ?? 0) / 100)
                .stroke(recoveryColor(score), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(score.map { "\($0)" } ?? "—")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .minimumScaleFactor(0.5)
        }
    }
}

struct HealthSyncWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HealthEntry

    private var s: WidgetSnapshot? { entry.snapshot }

    /// A snapshot from a previous day would show yesterday's recovery as today's.
    private var isStale: Bool {
        guard let s else { return true }
        return !Calendar.current.isDateInToday(s.updatedAt)
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(s?.recoveryScore ?? 0), in: 0...100) {
                Image(systemName: "heart.fill")
            } currentValueLabel: {
                Text(s?.recoveryScore.map(String.init) ?? "—")
            }
            .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("Recovery \(s?.recoveryScore.map { "\($0)%" } ?? "—")").font(.headline)
                if let strain = s?.strain {
                    Text(String(format: "Strain %.1f", strain))
                }
                if let p = s?.prediction {
                    Text("Tomorrow ~\(p.score)%")
                }
            }
        case .systemMedium:
            HStack(spacing: 16) {
                Ring(score: s?.recoveryScore, lineWidth: 9).frame(width: 84, height: 84)
                VStack(alignment: .leading, spacing: 6) {
                    if let headline = s?.briefHeadline {
                        Text(headline).font(.subheadline.weight(.semibold)).lineLimit(2)
                    }
                    HStack(spacing: 12) {
                        metric("flame.fill", s?.strain.map { String(format: "%.1f", $0) }, .orange)
                        metric("bed.double.fill", s?.sleepHours.map { String(format: "%.1fh", $0) }, .indigo)
                        metric("waveform.path.ecg", s?.hrv.map { String(format: "%.0f", $0) }, .pink)
                    }
                    if let p = s?.prediction {
                        Text("Tomorrow \(p.score)% (\(p.low)–\(p.high))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
        default:
            VStack(spacing: 6) {
                Ring(score: s?.recoveryScore, lineWidth: 8).frame(width: 70, height: 70)
                HStack(spacing: 8) {
                    metric("flame.fill", s?.strain.map { String(format: "%.1f", $0) }, .orange)
                    metric("bed.double.fill", s?.sleepHours.map { String(format: "%.1fh", $0) }, .indigo)
                }
                if isStale {
                    Text("Open to sync").font(.caption2).foregroundStyle(.secondary)
                } else if let p = s?.prediction {
                    Text("Tmrw ~\(p.score)%").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func metric(_ icon: String, _ value: String?, _ tint: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(value ?? "—").font(.system(.caption, design: .rounded, weight: .semibold))
        }
        .font(.caption)
    }
}

struct HealthSyncWidget: Widget {
    let kind = "HealthSyncWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            HealthSyncWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Recovery")
        .description("Today's recovery, strain, sleep and tomorrow's forecast.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

#Preview(as: .systemMedium) {
    HealthSyncWidget()
} timeline: {
    HealthEntry(date: .now, snapshot: .placeholder)
}
