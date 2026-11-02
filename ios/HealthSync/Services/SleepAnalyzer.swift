import Foundation

/// Turns raw, possibly overlapping sleep samples from several sources into one night.
///
/// Pure value logic (no HealthKit) so it can be reasoned about and tested in isolation.
enum SleepAnalyzer {
    enum Stage: Int, Sendable {
        // Raw values double as overlap priority: when two samples cover the same
        // instant, the higher stage wins (a deep-sleep sample beats "unspecified").
        case inBed = 0, awake = 1, unspecified = 2, core = 3, rem = 4, deep = 5

        var isAsleep: Bool { rawValue >= Stage.unspecified.rawValue }
    }

    struct Segment: Sendable {
        let start: Date
        let end: Date
        let stage: Stage
        let sourceID: String
        let isWatch: Bool
    }

    struct Night: Sendable, Equatable {
        var asleepHours = 0.0
        var coreHours = 0.0
        var deepHours = 0.0
        var remHours = 0.0
        var awakeHours = 0.0
        var inBedHours = 0.0
        var start: Date
        var end: Date

        var efficiency: Double? { inBedHours > 0 ? min(1, asleepHours / inBedHours) : nil }
    }

    /// Gaps up to this long still belong to the same sleep period; anything
    /// further apart (e.g. an afternoon nap) is a separate period.
    static let clusterGap: TimeInterval = 2 * 3600

    static func analyze(_ segments: [Segment]) -> Night? {
        let staged = segments.filter { $0.stage != .inBed && $0.end > $0.start }
        guard let sourceID = preferredSource(in: staged) else { return nil }
        let painted = paint(staged.filter { $0.sourceID == sourceID })

        // Main sleep period = the cluster of asleep time with the most sleep in it.
        let asleep = painted.filter { $0.stage.isAsleep }
        guard let main = clusters(of: asleep).max(by: { duration($0) < duration($1) }),
              let start = main.first?.start, let end = main.last?.end else { return nil }

        var night = Night(start: start, end: end)
        for piece in painted where piece.start >= start && piece.end <= end {
            let hours = piece.end.timeIntervalSince(piece.start) / 3600
            switch piece.stage {
            case .deep: night.deepHours += hours; night.asleepHours += hours
            case .rem: night.remHours += hours; night.asleepHours += hours
            case .core: night.coreHours += hours; night.asleepHours += hours
            case .unspecified: night.asleepHours += hours
            case .awake: night.awakeHours += hours
            case .inBed: break
            }
        }
        guard night.asleepHours > 0 else { return nil }

        // In-bed time: union of every source's in-bed samples near the main
        // period, plus the period itself (the Watch often writes no in-bed samples).
        let margin: TimeInterval = 3600
        var bedIntervals = segments
            .filter { $0.stage == .inBed && $0.end > start.addingTimeInterval(-margin) && $0.start < end.addingTimeInterval(margin) }
            .map { ($0.start, $0.end) }
        bedIntervals.append((start, end))
        night.inBedHours = unionLength(bedIntervals) / 3600
        return night
    }

    /// Prefer an Apple Watch source (it records stages); otherwise the source with the most sleep.
    private static func preferredSource(in segments: [Segment]) -> String? {
        var totals: [String: (asleep: TimeInterval, watch: Bool)] = [:]
        for s in segments where s.stage.isAsleep {
            let current = totals[s.sourceID] ?? (0, s.isWatch)
            totals[s.sourceID] = (current.asleep + s.end.timeIntervalSince(s.start), current.watch || s.isWatch)
        }
        return totals.max { a, b in
            if a.value.watch != b.value.watch { return !a.value.watch }
            return a.value.asleep < b.value.asleep
        }?.key
    }

    /// Splits time at every sample boundary and labels each slice with the
    /// highest-priority stage covering it, so overlapping samples count once.
    private static func paint(_ segments: [Segment]) -> [Segment] {
        let boundaries = Array(Set(segments.flatMap { [$0.start, $0.end] })).sorted()
        guard boundaries.count > 1 else { return [] }
        var result: [Segment] = []
        for (a, b) in zip(boundaries, boundaries.dropFirst()) {
            let mid = a.addingTimeInterval(b.timeIntervalSince(a) / 2)
            guard let top = segments
                .filter({ $0.start <= mid && $0.end > mid })
                .max(by: { $0.stage.rawValue < $1.stage.rawValue }) else { continue }
            // Merge with the previous slice when contiguous and same stage.
            if let last = result.last, last.end == a, last.stage == top.stage {
                result[result.count - 1] = Segment(start: last.start, end: b, stage: top.stage, sourceID: top.sourceID, isWatch: top.isWatch)
            } else {
                result.append(Segment(start: a, end: b, stage: top.stage, sourceID: top.sourceID, isWatch: top.isWatch))
            }
        }
        return result
    }

    private static func clusters(of segments: [Segment]) -> [[Segment]] {
        var groups: [[Segment]] = []
        for s in segments.sorted(by: { $0.start < $1.start }) {
            if let lastEnd = groups.last?.last?.end, s.start.timeIntervalSince(lastEnd) <= clusterGap {
                groups[groups.count - 1].append(s)
            } else {
                groups.append([s])
            }
        }
        return groups
    }

    private static func duration(_ segments: [Segment]) -> TimeInterval {
        segments.reduce(0) { $0 + $1.end.timeIntervalSince($1.start) }
    }

    private static func unionLength(_ intervals: [(Date, Date)]) -> TimeInterval {
        var total: TimeInterval = 0
        var current: (Date, Date)?
        for interval in intervals.sorted(by: { $0.0 < $1.0 }) {
            if let c = current, interval.0 <= c.1 {
                current = (c.0, max(c.1, interval.1))
            } else {
                if let c = current { total += c.1.timeIntervalSince(c.0) }
                current = interval
            }
        }
        if let c = current { total += c.1.timeIntervalSince(c.0) }
        return total
    }
}

/// Ports of the backend's strain math (src/analytics.ts) so on-device numbers match the server.
enum StrainMath {
    static func maxHeartRate(age: Double?) -> Double { 208 - 0.7 * (age ?? 35) }

    static func workoutStrain(avgHR: Double, restingHR: Double, minutes: Double, age: Double?) -> Double {
        let reserve = max(1, maxHeartRate(age: age) - restingHR)
        let intensity = max(0, min(1, (avgHR - restingHR) / reserve))
        let raw = intensity * minutes * 1.2
        return (21 * (1 - exp(-raw / 55)) * 10).rounded() / 10
    }

    static func dailyStrain(heartRateAvg: Double?, restingHR: Double?, exerciseMinutes: Double?,
                            activeEnergy: Double?, age: Double?) -> Double? {
        guard let avg = heartRateAvg, let rest = restingHR else { return nil }
        let reserve = max(1, maxHeartRate(age: age) - rest)
        let intensity = max(0, min(1, (avg - rest) / reserve))
        let raw = intensity * (exerciseMinutes ?? 0) * 1.2 + (activeEnergy ?? 0) / 12
        return (21 * (1 - exp(-raw / 55)) * 10).rounded() / 10
    }
}
