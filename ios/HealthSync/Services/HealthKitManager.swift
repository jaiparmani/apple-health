import HealthKit
import Foundation

// All stored state is immutable or lock-protected, so sharing across concurrent tasks is safe.
final class HealthKitManager: @unchecked Sendable {
    static let shared = HealthKitManager()
    private let store = HKHealthStore()

    private enum QueryStyle {
        case cumulativeSum
        case discreteAvg
        case discreteMinMaxAvg
        case mostRecent
    }

    private struct MetricQuery {
        let identifier: HKQuantityTypeIdentifier
        let key: String
        let unit: HKUnit
        let style: QueryStyle
    }

    private static let bpm = HKUnit.count().unitDivided(by: .minute())

    private let quantityQueries: [MetricQuery] = [
        // Heart & recovery
        .init(identifier: .restingHeartRate, key: "restingHeartRate", unit: bpm, style: .discreteAvg),
        .init(identifier: .heartRate, key: "heartRate", unit: bpm, style: .discreteMinMaxAvg),
        .init(identifier: .walkingHeartRateAverage, key: "walkingHeartRateAvg", unit: bpm, style: .discreteAvg),
        .init(identifier: .heartRateVariabilitySDNN, key: "hrv",
              unit: HKUnit.secondUnit(with: .milli), style: .discreteAvg),
        .init(identifier: .respiratoryRate, key: "respiratoryRate", unit: bpm, style: .discreteAvg),
        .init(identifier: .oxygenSaturation, key: "oxygenSaturation", unit: .percent(), style: .discreteAvg),
        .init(identifier: .bodyTemperature, key: "bodyTemperature", unit: .degreeCelsius(), style: .discreteAvg),
        .init(identifier: .vo2Max, key: "vo2max", unit: HKUnit(from: "ml/kg*min"), style: .discreteAvg),
        // Activity
        .init(identifier: .stepCount, key: "steps", unit: .count(), style: .cumulativeSum),
        .init(identifier: .activeEnergyBurned, key: "activeEnergy", unit: .kilocalorie(), style: .cumulativeSum),
        .init(identifier: .basalEnergyBurned, key: "basalEnergy", unit: .kilocalorie(), style: .cumulativeSum),
        .init(identifier: .appleExerciseTime, key: "exerciseMinutes", unit: .minute(), style: .cumulativeSum),
        .init(identifier: .appleStandTime, key: "standMinutes", unit: .minute(), style: .cumulativeSum),
        .init(identifier: .flightsClimbed, key: "flightsClimbed", unit: .count(), style: .cumulativeSum),
        .init(identifier: .distanceWalkingRunning, key: "distanceKm",
              unit: .meterUnit(with: .kilo), style: .cumulativeSum),
        .init(identifier: .distanceCycling, key: "distanceCyclingKm",
              unit: .meterUnit(with: .kilo), style: .cumulativeSum),
        .init(identifier: .timeInDaylight, key: "daylightMinutes", unit: .minute(), style: .cumulativeSum),
        // Mobility
        .init(identifier: .walkingSpeed, key: "walkingSpeed",
              unit: HKUnit.meter().unitDivided(by: .second()), style: .discreteAvg),
        .init(identifier: .walkingStepLength, key: "walkingStepLength",
              unit: .meterUnit(with: .centi), style: .discreteAvg),
        .init(identifier: .walkingAsymmetryPercentage, key: "walkingAsymmetryPct", unit: .percent(), style: .discreteAvg),
        .init(identifier: .walkingDoubleSupportPercentage, key: "walkingDoubleSupportPct",
              unit: .percent(), style: .discreteAvg),
        // Body
        .init(identifier: .bodyMass, key: "weightKg", unit: .gramUnit(with: .kilo), style: .mostRecent),
        .init(identifier: .bodyFatPercentage, key: "bodyFatPct", unit: .percent(), style: .mostRecent),
        .init(identifier: .bloodPressureSystolic, key: "bloodPressureSystolic",
              unit: .millimeterOfMercury(), style: .mostRecent),
        .init(identifier: .bloodPressureDiastolic, key: "bloodPressureDiastolic",
              unit: .millimeterOfMercury(), style: .mostRecent),
        .init(identifier: .bloodGlucose, key: "bloodGlucose",
              unit: HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)), style: .mostRecent),
    ]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        for q in quantityQueries {
            types.insert(HKQuantityType(q.identifier))
        }
        types.insert(HKQuantityType(.appleSleepingWristTemperature))
        types.insert(HKCategoryType(.sleepAnalysis))
        types.insert(HKCategoryType(.mindfulSession))
        types.insert(HKObjectType.workoutType())
        types.insert(HKObjectType.activitySummaryType())
        types.insert(HKCharacteristicType(.dateOfBirth))
        return types
    }

    func requestAuthorization() async throws {
        guard isAvailable else { throw HealthError.notAvailable }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    // MARK: - Background delivery

    private let observerLock = NSLock()
    private var observersStarted = false

    /// Types whose new samples should wake the app. Sleep, HRV and workouts are what
    /// move recovery/strain; steps and energy keep the day's totals fresh.
    private var observedTypes: [(HKSampleType, HKUpdateFrequency)] {
        [
            (HKCategoryType(.sleepAnalysis), .immediate),
            (HKQuantityType(.heartRateVariabilitySDNN), .immediate),
            (HKQuantityType(.restingHeartRate), .immediate),
            (HKObjectType.workoutType(), .immediate),
            (HKQuantityType(.stepCount), .hourly),
            (HKQuantityType(.activeEnergyBurned), .hourly),
        ]
    }

    /// Registers observer queries and enables background delivery. Must run on every
    /// launch (HealthKit relaunches the app in the background and expects the observers
    /// to be re-registered). Observers register once per process; background delivery is
    /// re-enabled on every call because it fails until the user has granted read access.
    func startBackgroundDelivery(onChange: @escaping @Sendable () async -> Void) async {
        guard isAvailable else { return }
        let shouldRegister: Bool = observerLock.withLock {
            guard !observersStarted else { return false }
            observersStarted = true
            return true
        }

        for (type, frequency) in observedTypes {
            if shouldRegister {
                let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
                    // HealthKit stops waking the app if the completion handler isn't called.
                    nonisolated(unsafe) let done = completionHandler
                    guard error == nil else { done(); return }
                    Task {
                        await onChange()
                        done()
                    }
                }
                store.execute(query)
            }
            try? await store.enableBackgroundDelivery(for: type, frequency: frequency)
        }
    }

    // MARK: - Daily metrics

    func queryMetrics(for date: Date) async throws -> HealthMetrics {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            throw HealthError.invalidDate
        }
        var metrics = HealthMetrics(date: Self.dateFormatter.string(from: date))

        let results = await dayQuantityResults(start: startOfDay, end: endOfDay)
        metrics.restingHeartRate = results["restingHeartRate"]
        metrics.heartRateAvg = results["heartRateAvg"]
        metrics.heartRateMin = results["heartRateMin"]
        metrics.heartRateMax = results["heartRateMax"]
        metrics.walkingHeartRateAvg = results["walkingHeartRateAvg"]
        metrics.hrv = results["hrv"]
        metrics.respiratoryRate = results["respiratoryRate"]
        metrics.oxygenSaturation = results["oxygenSaturation"]
        metrics.bodyTemperature = results["bodyTemperature"]
        metrics.vo2max = results["vo2max"]
        metrics.steps = results["steps"]
        metrics.activeEnergy = results["activeEnergy"]
        metrics.basalEnergy = results["basalEnergy"]
        metrics.exerciseMinutes = results["exerciseMinutes"]
        metrics.standMinutes = results["standMinutes"]
        metrics.flightsClimbed = results["flightsClimbed"]
        metrics.distanceKm = results["distanceKm"]
        metrics.distanceCyclingKm = results["distanceCyclingKm"]
        metrics.daylightMinutes = results["daylightMinutes"]
        metrics.mindfulMinutes = results["mindfulMinutes"]
        metrics.walkingSpeed = results["walkingSpeed"]
        metrics.walkingStepLength = results["walkingStepLength"]
        metrics.walkingAsymmetryPct = results["walkingAsymmetryPct"]
        metrics.walkingDoubleSupportPct = results["walkingDoubleSupportPct"]
        metrics.weightKg = results["weightKg"]
        metrics.bodyFatPct = results["bodyFatPct"]
        metrics.bloodPressureSystolic = results["bloodPressureSystolic"]
        metrics.bloodPressureDiastolic = results["bloodPressureDiastolic"]
        metrics.bloodGlucose = results["bloodGlucose"]

        var extra: [String: Double] = [:]
        let age = self.age()

        // Sleep: the night that ENDS on this day (window 18:00 the evening before → 18:00 today).
        if let night = try? await sleepNight(wakingOn: startOfDay) {
            metrics.sleepHours = night.asleepHours
            metrics.sleepCoreHours = night.coreHours
            metrics.sleepDeepHours = night.deepHours
            metrics.sleepRemHours = night.remHours
            metrics.sleepAwakeHours = night.awakeHours
            metrics.sleepInBedHours = night.inBedHours
            metrics.sleepEfficiency = night.efficiency
            extra["sleepStartMin"] = night.start.timeIntervalSince(startOfDay) / 60
            extra["sleepEndMin"] = night.end.timeIntervalSince(startOfDay) / 60

            // Recovery is driven by overnight physiology, not the daytime average:
            // replace `hrv` with the sleep-window mean and keep the all-day value in `extra`.
            let vitals = await sleepVitals(start: night.start, end: night.end)
            if let sleepHRV = vitals.hrv {
                if let dayHRV = metrics.hrv { extra["hrvAllDay"] = dayHRV }
                extra["hrvSleep"] = sleepHRV
                metrics.hrv = sleepHRV
            }
            if let v = vitals.hrMin { extra["sleepHeartRateMin"] = v }
            if let v = vitals.hrAvg { extra["sleepHeartRateAvg"] = v }
            if let v = vitals.respiratoryRate { extra["sleepRespiratoryRate"] = v }
        }

        // Wrist temperature is written once per night; key matches the backend's export parser.
        let tempStart = calendar.date(byAdding: .hour, value: -6, to: startOfDay) ?? startOfDay
        let tempEnd = calendar.date(byAdding: .hour, value: 18, to: startOfDay) ?? endOfDay
        if let temp = try? await mostRecentValue(type: HKQuantityType(.appleSleepingWristTemperature),
                                                 start: tempStart, end: tempEnd, unit: .degreeCelsius()) {
            extra["AppleSleepingWristTemperature"] = temp
        }

        if let summary = try? await workoutSummary(start: startOfDay, end: endOfDay,
                                                  restingHR: metrics.restingHeartRate, age: age) {
            metrics.workoutCount = Double(summary.count)
            metrics.workoutMinutes = summary.minutes
            metrics.workoutEnergy = summary.energy > 0 ? summary.energy : nil
            metrics.workoutDistanceKm = summary.distanceKm > 0 ? summary.distanceKm : nil
            metrics.workoutType = summary.types.joined(separator: ",")
            metrics.workoutStrains = summary.strains.isEmpty ? nil : summary.strains
        }

        if let zones = try? await hrZoneMinutes(start: startOfDay, end: endOfDay,
                                                maxHR: StrainMath.maxHeartRate(age: age)) {
            metrics.hrZone1Min = zones[0]
            metrics.hrZone2Min = zones[1]
            metrics.hrZone3Min = zones[2]
            metrics.hrZone4Min = zones[3]
            metrics.hrZone5Min = zones[4]
        }

        if let rings = try? await activityRings(for: startOfDay) {
            metrics.activeEnergyGoal = rings.energyGoal
            metrics.exerciseMinutesGoal = rings.exerciseGoal
            metrics.standHours = rings.standHours
            metrics.standHoursGoal = rings.standGoal
        }

        metrics.extra = extra.isEmpty ? nil : extra
        return metrics
    }

    /// Age in years from the HealthKit date of birth, used for max-HR estimation.
    func age() -> Double? {
        guard let dob = try? store.dateOfBirthComponents(),
              let birth = Calendar.current.date(from: dob) else { return nil }
        return Date().timeIntervalSince(birth) / (365.25 * 86400)
    }

    // MARK: - Private Helpers

    private func dayQuantityResults(start: Date, end: Date) async -> [String: Double] {
        await withTaskGroup(of: (String, Double?).self) { group in
            for q in quantityQueries {
                let sampleType = HKQuantityType(q.identifier)
                let key = q.key
                let unit = q.unit

                switch q.style {
                case .cumulativeSum, .discreteAvg:
                    let option: HKStatisticsOptions = q.style == .cumulativeSum ? .cumulativeSum : .discreteAverage
                    group.addTask {
                        let value = try? await self.statisticsValue(type: sampleType, start: start, end: end,
                                                                    unit: unit, option: option)
                        return (key, value)
                    }
                case .discreteMinMaxAvg:
                    let variants: [(String, HKStatisticsOptions)] = [
                        ("Avg", .discreteAverage), ("Min", .discreteMin), ("Max", .discreteMax),
                    ]
                    for (suffix, option) in variants {
                        group.addTask {
                            let value = try? await self.statisticsValue(type: sampleType, start: start, end: end,
                                                                        unit: unit, option: option)
                            return (key + suffix, value)
                        }
                    }
                case .mostRecent:
                    group.addTask {
                        let value = try? await self.mostRecentValue(type: sampleType, start: start, end: end, unit: unit)
                        return (key, value)
                    }
                }
            }

            group.addTask {
                let mins = try? await self.queryMindfulMinutes(start: start, end: end)
                return ("mindfulMinutes", mins)
            }

            var collected: [String: Double] = [:]
            for await (key, value) in group {
                if let value { collected[key] = value }
            }
            return collected
        }
    }

    private static func dayPredicate(start: Date, end: Date) -> NSPredicate {
        HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    }

    private func statisticsValue(
        type: HKQuantityType,
        start: Date,
        end: Date,
        unit: HKUnit,
        option: HKStatisticsOptions
    ) async throws -> Double? {
        let predicate = Self.dayPredicate(start: start, end: end)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: predicate,
                options: option
            ) { _, stats, error in
                if let error {
                    // "No data" is reported as an error; treat it as a missing value.
                    if (error as? HKError)?.code == .errorNoData {
                        continuation.resume(returning: nil)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                // Pick the quantity matching the requested statistics option.
                let quantity: HKQuantity?
                switch option {
                case .cumulativeSum: quantity = stats?.sumQuantity()
                case .discreteMin: quantity = stats?.minimumQuantity()
                case .discreteMax: quantity = stats?.maximumQuantity()
                default: quantity = stats?.averageQuantity()
                }
                continuation.resume(returning: quantity?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func mostRecentValue(type: HKQuantityType, start: Date, end: Date, unit: HKUnit) async throws -> Double? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: type, predicate: Self.dayPredicate(start: start, end: end))],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)],
            limit: 1
        )
        return try await descriptor.result(for: store).first?.quantity.doubleValue(for: unit)
    }

    private func queryMindfulMinutes(start: Date, end: Date) async throws -> Double? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.mindfulSession),
                                         predicate: Self.dayPredicate(start: start, end: end))],
            sortDescriptors: []
        )
        let samples = try await descriptor.result(for: store)
        let minutes = samples.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
        return minutes > 0 ? minutes : nil
    }

    // MARK: Sleep

    private func sleepNight(wakingOn dayStart: Date) async throws -> SleepAnalyzer.Night? {
        let calendar = Calendar.current
        guard let windowStart = calendar.date(byAdding: .hour, value: -6, to: dayStart),
              let windowEnd = calendar.date(byAdding: .hour, value: 18, to: dayStart) else { return nil }
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis),
                                         predicate: Self.dayPredicate(start: windowStart, end: windowEnd))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        let segments = samples.compactMap { sample -> SleepAnalyzer.Segment? in
            guard let stage = Self.stage(for: sample.value) else { return nil }
            let source = sample.sourceRevision
            return SleepAnalyzer.Segment(
                start: sample.startDate,
                end: sample.endDate,
                stage: stage,
                sourceID: source.source.bundleIdentifier,
                isWatch: source.productType?.hasPrefix("Watch") ?? false
            )
        }
        return SleepAnalyzer.analyze(segments)
    }

    private static func stage(for rawValue: Int) -> SleepAnalyzer.Stage? {
        switch HKCategoryValueSleepAnalysis(rawValue: rawValue) {
        case .inBed: return .inBed
        case .awake: return .awake
        case .asleepUnspecified: return .unspecified
        case .asleepCore: return .core
        case .asleepDeep: return .deep
        case .asleepREM: return .rem
        default: return nil
        }
    }

    private struct SleepVitals {
        var hrv: Double?
        var hrMin: Double?
        var hrAvg: Double?
        var respiratoryRate: Double?
    }

    private func sleepVitals(start: Date, end: Date) async -> SleepVitals {
        async let hrv = try? statisticsValue(type: HKQuantityType(.heartRateVariabilitySDNN), start: start, end: end,
                                             unit: .secondUnit(with: .milli), option: .discreteAverage)
        async let hrMin = try? statisticsValue(type: HKQuantityType(.heartRate), start: start, end: end,
                                               unit: Self.bpm, option: .discreteMin)
        async let hrAvg = try? statisticsValue(type: HKQuantityType(.heartRate), start: start, end: end,
                                               unit: Self.bpm, option: .discreteAverage)
        async let resp = try? statisticsValue(type: HKQuantityType(.respiratoryRate), start: start, end: end,
                                              unit: Self.bpm, option: .discreteAverage)
        return await SleepVitals(hrv: hrv ?? nil, hrMin: hrMin ?? nil, hrAvg: hrAvg ?? nil, respiratoryRate: resp ?? nil)
    }

    // MARK: Workouts

    private struct WorkoutSummary {
        var count = 0
        var minutes = 0.0
        var energy = 0.0
        var distanceKm = 0.0
        var types: [String] = []
        var strains: [WorkoutStrain] = []
    }

    private func workoutSummary(start: Date, end: Date, restingHR: Double?, age: Double?) async throws -> WorkoutSummary? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(Self.dayPredicate(start: start, end: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let workouts = try await descriptor.result(for: store)
        guard !workouts.isEmpty else { return nil }

        let distanceTypes: [HKQuantityTypeIdentifier] = [
            .distanceWalkingRunning, .distanceCycling, .distanceSwimming, .distanceDownhillSnowSports,
        ]
        var summary = WorkoutSummary()
        var minutesByType: [String: Double] = [:]
        for workout in workouts {
            let minutes = workout.duration / 60
            let type = workout.workoutActivityType.backendName
            summary.count += 1
            summary.minutes += minutes
            summary.energy += workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
                .sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            for id in distanceTypes {
                summary.distanceKm += workout.statistics(for: HKQuantityType(id))?
                    .sumQuantity()?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0
            }
            minutesByType[type, default: 0] += minutes

            if let avgHR = workout.statistics(for: HKQuantityType(.heartRate))?
                .averageQuantity()?.doubleValue(for: Self.bpm) {
                let strain = StrainMath.workoutStrain(avgHR: avgHR, restingHR: restingHR ?? 60,
                                                      minutes: minutes, age: age)
                summary.strains.append(WorkoutStrain(type: type, strain: strain,
                                                     minutes: (minutes * 10).rounded() / 10,
                                                     avgHR: avgHR.rounded()))
            }
        }
        summary.types = minutesByType.sorted { $0.value > $1.value }.map(\.key)
        return summary
    }

    // MARK: HR zones

    /// Minutes in each of the backend's five zones (<60, 60-70, 70-80, 80-90, >90% of max HR).
    /// Each sample stands in for the time until the next one, capped so that sparse
    /// passive readings don't get credited with hours of time.
    private func hrZoneMinutes(start: Date, end: Date, maxHR: Double) async throws -> [Double]? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.heartRate),
                                         predicate: Self.dayPredicate(start: start, end: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        guard !samples.isEmpty else { return nil }

        let maxGap: TimeInterval = 10 * 60
        var zones = [Double](repeating: 0, count: 5)
        for (index, sample) in samples.enumerated() {
            let next = index + 1 < samples.count ? samples[index + 1].startDate : sample.startDate.addingTimeInterval(60)
            let seconds = min(maxGap, max(0, next.timeIntervalSince(sample.startDate)))
            let pct = sample.quantity.doubleValue(for: Self.bpm) / maxHR
            let zone = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4
            zones[zone] += seconds / 60
        }
        return zones.map { ($0 * 10).rounded() / 10 }
    }

    // MARK: Activity rings

    private struct Rings {
        var energyGoal: Double?
        var exerciseGoal: Double?
        var standHours: Double?
        var standGoal: Double?
    }

    private func activityRings(for dayStart: Date) async throws -> Rings? {
        let calendar = Calendar.current
        var components = calendar.dateComponents([.era, .year, .month, .day], from: dayStart)
        components.calendar = calendar
        let descriptor = HKActivitySummaryQueryDescriptor(
            predicate: HKQuery.predicate(forActivitySummariesBetweenStart: components, end: components)
        )
        guard let summary = try await descriptor.result(for: store).first else { return nil }
        func positive(_ value: Double?) -> Double? { value.flatMap { $0 > 0 ? $0 : nil } }
        return Rings(
            energyGoal: positive(summary.activeEnergyBurnedGoal.doubleValue(for: .kilocalorie())),
            exerciseGoal: positive(summary.exerciseTimeGoal?.doubleValue(for: .minute())),
            standHours: summary.appleStandHours.doubleValue(for: .count()),
            standGoal: positive(summary.standHoursGoal?.doubleValue(for: .count()))
        )
    }

    static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        return f
    }()
}

extension HKWorkoutActivityType {
    /// Names matching Apple Health export's `HKWorkoutActivityType*` suffixes, which the
    /// backend's `workoutLabel()` and unlogged-workout matching expect.
    var backendName: String {
        switch self {
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .hiking: return "Hiking"
        case .swimming: return "Swimming"
        case .rowing: return "Rowing"
        case .elliptical: return "Elliptical"
        case .stairClimbing: return "StairClimbing"
        case .stairs: return "Stairs"
        case .traditionalStrengthTraining: return "TraditionalStrengthTraining"
        case .functionalStrengthTraining: return "FunctionalStrengthTraining"
        case .highIntensityIntervalTraining: return "HighIntensityIntervalTraining"
        case .coreTraining: return "CoreTraining"
        case .crossTraining: return "CrossTraining"
        case .mixedCardio: return "MixedCardio"
        case .jumpRope: return "JumpRope"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .flexibility: return "Flexibility"
        case .cooldown: return "Cooldown"
        case .mindAndBody: return "MindAndBody"
        case .cardioDance: return "CardioDance"
        case .socialDance: return "SocialDance"
        case .boxing: return "Boxing"
        case .kickboxing: return "Kickboxing"
        case .martialArts: return "MartialArts"
        case .climbing: return "Climbing"
        case .tennis: return "Tennis"
        case .badminton: return "Badminton"
        case .tableTennis: return "TableTennis"
        case .squash: return "Squash"
        case .cricket: return "Cricket"
        case .soccer: return "Soccer"
        case .basketball: return "Basketball"
        case .volleyball: return "Volleyball"
        case .golf: return "Golf"
        case .snowSports: return "SnowSports"
        case .surfingSports: return "SurfingSports"
        case .paddleSports: return "PaddleSports"
        default: return "Other"
        }
    }
}

enum HealthError: LocalizedError {
    case notAvailable
    case invalidDate
    case authorizationDenied

    var errorDescription: String? {
        switch self {
        case .notAvailable: return "HealthKit is not available on this device"
        case .invalidDate: return "Invalid date"
        case .authorizationDenied: return "HealthKit authorization denied"
        }
    }
}
