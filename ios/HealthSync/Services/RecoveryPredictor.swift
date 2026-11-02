import Foundation

/// Forecasts tomorrow morning's recovery score from your own history.
///
/// 1. Recomputes the backend's 5-pillar recovery score (src/trends.ts `computeRecovery`)
///    for every past day, so the target matches what the dashboard shows.
/// 2. Fits a small ridge regression: recovery(t+1) ~ recovery(t), strain(t),
///    7-day strain load, 7-day sleep average, and the sleep obtained on night t→t+1.
/// 3. Predicts using today's values and an assumed sleep for tonight, plus
///    "what if I sleep N hours" scenarios.
///
/// Pure Foundation so it runs anywhere (app, intents, background).
enum RecoveryPredictor {
    static let minimumTrainingDays = 21
    private static let ridgeLambda = 2.0
    private static let scenarioHours: [Double] = [6, 7, 8, 9]

    // MARK: - Public

    static func predict(days input: [DayRecord], age: Double?, sleepTarget: Double = 7.5) -> RecoveryPrediction? {
        let days = input.sorted { $0.date < $1.date }
        guard days.count >= 6 else { return nil }
        let recovery = recoveryHistory(days, sleepTarget: sleepTarget)
        let strain = days.map { $0.strain ?? StrainMath.dailyStrain(
            heartRateAvg: $0.heartRateAvg, restingHR: $0.restingHeartRate,
            exerciseMinutes: $0.exerciseMinutes, activeEnergy: $0.activeEnergy, age: age) }

        guard let today = recovery.indices.last(where: { recovery[$0] != nil }),
              let todayRecovery = recovery[today],
              let forDate = nextDay(days[today].date) else { return nil }

        let recentSleep = mean(days[max(0, today - 6)...today].compactMap(\.sleepHours))
        let assumedSleep = ((recentSleep ?? sleepTarget) * 4).rounded() / 4

        // Build training rows: features known on day t, label = recovery on day t+1.
        var rows: [[Double?]] = []
        var labels: [Double] = []
        for t in 0..<(days.count - 1) {
            guard let r = recovery[t], let next = recovery[t + 1],
                  let sleepNext = days[t + 1].sleepHours,
                  isConsecutive(days[t].date, days[t + 1].date) else { continue }
            rows.append(features(t: t, days: days, recovery: r, strain: strain, sleepNext: sleepNext))
            labels.append(next)
        }

        guard rows.count >= minimumTrainingDays,
              let model = RidgeModel.fit(rows: rows, labels: labels, lambda: ridgeLambda) else {
            return heuristic(todayRecovery: todayRecovery, recovery: recovery, strain: strain, today: today,
                             assumedSleep: assumedSleep, sleepTarget: sleepTarget, forDate: forDate,
                             trainingDays: rows.count)
        }

        // Honest error estimate: refit without the last 14 rows and score them.
        var backtest: Double?
        if rows.count >= minimumTrainingDays + 14,
           let holdout = RidgeModel.fit(rows: Array(rows.dropLast(14)), labels: Array(labels.dropLast(14)),
                                         lambda: ridgeLambda) {
            let errors = zip(rows.suffix(14), labels.suffix(14)).map { abs(holdout.predict($0) - $1) }
            backtest = errors.reduce(0, +) / Double(errors.count)
        }

        let todayRow = { (sleep: Double) in
            features(t: today, days: days, recovery: todayRecovery, strain: strain, sleepNext: sleep)
        }
        let score = clamp(model.predict(todayRow(assumedSleep)))
        let spread = max(5, (backtest ?? model.residualMAE).rounded())
        let scenarios = scenarioHours.map {
            RecoveryPrediction.Scenario(sleepHours: $0, score: Int(clamp(model.predict(todayRow($0))).rounded()))
        }

        let row = todayRow(assumedSleep)
        let labelsForDrivers = driverLabels(row: row, assumedSleep: assumedSleep)
        let drivers = model.contributions(row)
            .enumerated()
            .map { RecoveryPrediction.Driver(label: labelsForDrivers[$0.offset], impact: ($0.element * 10).rounded() / 10) }
            .filter { abs($0.impact) >= 0.5 }
            .sorted { abs($0.impact) > abs($1.impact) }
            .prefix(3)

        return RecoveryPrediction(
            forDate: forDate,
            score: Int(score.rounded()),
            low: Int(clamp(score - spread).rounded()),
            high: Int(clamp(score + spread).rounded()),
            assumedSleepHours: assumedSleep,
            scenarios: scenarios,
            drivers: Array(drivers),
            trainingDays: rows.count,
            isModelBased: true,
            backtestError: backtest.map { ($0 * 10).rounded() / 10 }
        )
    }

    /// Recovery score per day, matching the backend's `computeRecovery` (trailing 29-day baseline).
    static func recoveryHistory(_ days: [DayRecord], sleepTarget: Double = 7.5) -> [Double?] {
        days.indices.map { i in
            let baseline = Array(days[max(0, i - 29)..<i])
            guard baseline.count >= 5 else { return nil }
            return recoveryScore(today: days[i], baseline: baseline, sleepTarget: sleepTarget)
        }
    }

    // MARK: - Features

    private static func features(t: Int, days: [DayRecord], recovery: Double, strain: [Double?],
                                 sleepNext: Double) -> [Double?] {
        let week = max(0, t - 6)...t
        return [
            recovery,
            strain[t],
            mean(strain[week].compactMap { $0 }),
            mean(days[week].compactMap(\.sleepHours)),
            sleepNext,
        ]
    }

    private static func driverLabels(row: [Double?], assumedSleep: Double) -> [String] {
        func f(_ v: Double?, _ digits: Int = 1) -> String { v.map { String(format: "%.\(digits)f", $0) } ?? "—" }
        return [
            "Today's recovery (\(f(row[0], 0))%)",
            "Today's strain (\(f(row[1])))",
            "7-day training load (avg strain \(f(row[2])))",
            "7-day sleep average (\(f(row[3])) h)",
            "Tonight's sleep (assumed \(f(assumedSleep, 2)) h)",
        ]
    }

    // MARK: - Fallback

    /// Used until there are enough paired days to fit the regression: recovery partly
    /// reverts to your mean, high strain pulls it down, extra sleep pushes it up.
    private static func heuristic(todayRecovery: Double, recovery: [Double?], strain: [Double?], today: Int,
                                  assumedSleep: Double, sleepTarget: Double, forDate: String,
                                  trainingDays: Int) -> RecoveryPrediction {
        let meanRecovery = mean(recovery.compactMap { $0 }) ?? todayRecovery
        let meanStrain = mean(strain.compactMap { $0 }) ?? 0
        let strainEffect = -((strain[today] ?? meanStrain) - meanStrain) * 1.2
        func score(_ sleep: Double) -> Double {
            clamp(0.5 * todayRecovery + 0.5 * meanRecovery + strainEffect + (sleep - sleepTarget) * 4)
        }
        let base = score(assumedSleep)
        return RecoveryPrediction(
            forDate: forDate,
            score: Int(base.rounded()),
            low: Int(clamp(base - 15).rounded()),
            high: Int(clamp(base + 15).rounded()),
            assumedSleepHours: assumedSleep,
            scenarios: scenarioHours.map { .init(sleepHours: $0, score: Int(score($0).rounded())) },
            drivers: [],
            trainingDays: trainingDays,
            isModelBased: false,
            backtestError: nil
        )
    }

    // MARK: - Recovery score (port of src/trends.ts)

    private static func recoveryScore(today: DayRecord, baseline: [DayRecord], sleepTarget: Double) -> Double? {
        var score = 50.0
        var signals = 0

        func zScore(_ value: Double?, _ values: [Double], higherIsBetter: Bool, fallbackSD: Double = 1) -> Double? {
            guard let value, values.count >= 3, let m = mean(values) else { return nil }
            let sd = populationSD(values, mean: m)
            let z = (value - m) / (sd == 0 ? fallbackSD : sd)
            return higherIsBetter ? z : -z
        }

        if let z = zScore(today.hrv, baseline.compactMap(\.hrv), higherIsBetter: true) {
            score += max(-12.5, min(12.5, z * 6)); signals += 1
        }
        if let z = zScore(today.restingHeartRate, baseline.compactMap(\.restingHeartRate), higherIsBetter: false) {
            score += max(-12.5, min(12.5, z * 6)); signals += 1
        }
        if let z = zScore(today.respiratoryRate, baseline.compactMap(\.respiratoryRate), higherIsBetter: false) {
            score += max(-7.5, min(7.5, z * 4)); signals += 1
        }
        if let z = zScore(today.oxygenSaturation, baseline.compactMap(\.oxygenSaturation),
                          higherIsBetter: true, fallbackSD: 0.005) {
            score += max(-5, min(5, z * 3)); signals += 1
        }
        let tempKey = "AppleSleepingWristTemperature"
        let temps = baseline.compactMap { $0.extra?[tempKey] }
        if let temp = today.extra?[tempKey], temps.count >= 3, let m = mean(temps) {
            score -= min(5, max(0, abs(temp - m) - 0.3) * 10); signals += 1
        }
        if let hours = today.sleepHours {
            let hoursScore = min(1, hours / sleepTarget) * 40
            let effScore = today.sleepEfficiency.map { $0 * 30 } ?? 15
            var deepRemScore = 15.0
            if let deep = today.sleepDeepHours, let rem = today.sleepRemHours, hours > 0 {
                deepRemScore = min(1, (deep + rem) / (hours * 0.4)) * 30
            }
            let sleepScore = (hoursScore + effScore + deepRemScore).rounded()
            score += max(-7.5, min(7.5, (sleepScore / 100 - 0.5) * 15)); signals += 1
        }
        guard signals > 0 else { return nil }
        return clamp(score).rounded()
    }

    // MARK: - Math helpers

    private static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    private static func populationSD(_ values: [Double], mean m: Double) -> Double {
        guard values.count >= 2 else { return 0 }
        return (values.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(values.count)).squareRoot()
    }

    private static func clamp(_ v: Double) -> Double { max(0, min(100, v)) }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private static func nextDay(_ date: String) -> String? {
        guard let d = dayFormatter.date(from: date) else { return nil }
        return dayFormatter.string(from: d.addingTimeInterval(86400))
    }

    private static func isConsecutive(_ a: String, _ b: String) -> Bool { nextDay(a) == b }
}

/// Ridge regression on standardized features with mean imputation for missing values.
struct RidgeModel {
    let means: [Double]
    let sds: [Double]
    let intercept: Double
    let coefficients: [Double]
    let residualMAE: Double

    static func fit(rows: [[Double?]], labels: [Double], lambda: Double) -> RidgeModel? {
        guard let width = rows.first?.count, rows.count == labels.count, rows.count > width else { return nil }
        var means = [Double](repeating: 0, count: width)
        var sds = [Double](repeating: 1, count: width)
        for j in 0..<width {
            let column = rows.compactMap { $0[j] }
            guard !column.isEmpty else { continue }
            let m = column.reduce(0, +) / Double(column.count)
            let variance = column.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(column.count)
            means[j] = m
            sds[j] = variance > 1e-9 ? variance.squareRoot() : 1
        }
        let x = rows.map { row in (0..<width).map { j in ((row[j] ?? means[j]) - means[j]) / sds[j] } }
        let yMean = labels.reduce(0, +) / Double(labels.count)
        let y = labels.map { $0 - yMean }

        // Normal equations: (XᵀX + λI) β = Xᵀy
        var a = [[Double]](repeating: [Double](repeating: 0, count: width), count: width)
        var b = [Double](repeating: 0, count: width)
        for (row, target) in zip(x, y) {
            for i in 0..<width {
                b[i] += row[i] * target
                for j in 0..<width { a[i][j] += row[i] * row[j] }
            }
        }
        for i in 0..<width { a[i][i] += lambda }
        guard let beta = solve(a, b) else { return nil }

        var model = RidgeModel(means: means, sds: sds, intercept: yMean, coefficients: beta, residualMAE: 0)
        let errors = zip(rows, labels).map { abs(model.predict($0) - $1) }
        model = RidgeModel(means: means, sds: sds, intercept: yMean, coefficients: beta,
                           residualMAE: errors.reduce(0, +) / Double(errors.count))
        return model
    }

    func predict(_ row: [Double?]) -> Double {
        intercept + contributions(row).reduce(0, +)
    }

    /// Per-feature contribution in label units, relative to an average day.
    func contributions(_ row: [Double?]) -> [Double] {
        row.indices.map { j in coefficients[j] * (((row[j] ?? means[j]) - means[j]) / sds[j]) }
    }

    /// Gaussian elimination with partial pivoting.
    private static func solve(_ matrix: [[Double]], _ vector: [Double]) -> [Double]? {
        var a = matrix
        var b = vector
        let n = b.count
        for col in 0..<n {
            guard let pivot = (col..<n).max(by: { abs(a[$0][col]) < abs(a[$1][col]) }),
                  abs(a[pivot][col]) > 1e-12 else { return nil }
            a.swapAt(col, pivot)
            b.swapAt(col, pivot)
            for r in (col + 1)..<n {
                let factor = a[r][col] / a[col][col]
                for c in col..<n { a[r][c] -= factor * a[col][c] }
                b[r] -= factor * b[col]
            }
        }
        var x = [Double](repeating: 0, count: n)
        for r in stride(from: n - 1, through: 0, by: -1) {
            let sum = ((r + 1)..<n).reduce(0) { $0 + a[r][$1] * x[$1] }
            x[r] = (b[r] - sum) / a[r][r]
        }
        return x
    }
}
