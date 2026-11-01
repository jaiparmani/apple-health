import HealthKit
import Foundation

final class HealthKitManager {
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

    private let quantityQueries: [MetricQuery] = [
        // Heart & recovery
        .init(identifier: .restingHeartRate, key: "restingHeartRate",
              unit: HKUnit.count().unitDivided(by: .minute()), style: .discreteAvg),
        .init(identifier: .heartRate, key: "heartRate",
              unit: HKUnit.count().unitDivided(by: .minute()), style: .discreteMinMaxAvg),
        .init(identifier: .walkingHeartRateAverage, key: "walkingHeartRateAvg",
              unit: HKUnit.count().unitDivided(by: .minute()), style: .discreteAvg),
        .init(identifier: .heartRateVariabilitySDNN, key: "hrv",
              unit: HKUnit.secondUnit(with: .milli), style: .discreteAvg),
        .init(identifier: .respiratoryRate, key: "respiratoryRate",
              unit: HKUnit.count().unitDivided(by: .minute()), style: .discreteAvg),
        .init(identifier: .oxygenSaturation, key: "oxygenSaturation",
              unit: .percent(), style: .discreteAvg),
        .init(identifier: .bodyTemperature, key: "bodyTemperature",
              unit: .degreeCelsius(), style: .discreteAvg),
        .init(identifier: .vo2Max, key: "vo2max",
              unit: HKUnit(from: "ml/kg*min"), style: .discreteAvg),
        // Activity
        .init(identifier: .stepCount, key: "steps",
              unit: .count(), style: .cumulativeSum),
        .init(identifier: .activeEnergyBurned, key: "activeEnergy",
              unit: .kilocalorie(), style: .cumulativeSum),
        .init(identifier: .basalEnergyBurned, key: "basalEnergy",
              unit: .kilocalorie(), style: .cumulativeSum),
        .init(identifier: .appleExerciseTime, key: "exerciseMinutes",
              unit: .minute(), style: .cumulativeSum),
        .init(identifier: .appleStandTime, key: "standMinutes",
              unit: .minute(), style: .cumulativeSum),
        .init(identifier: .flightsClimbed, key: "flightsClimbed",
              unit: .count(), style: .cumulativeSum),
        .init(identifier: .distanceWalkingRunning, key: "distanceKm",
              unit: .meterUnit(with: .kilo), style: .cumulativeSum),
        .init(identifier: .distanceCycling, key: "distanceCyclingKm",
              unit: .meterUnit(with: .kilo), style: .cumulativeSum),
        .init(identifier: .timeInDaylight, key: "daylightMinutes",
              unit: .minute(), style: .cumulativeSum),
        // Mobility
        .init(identifier: .walkingSpeed, key: "walkingSpeed",
              unit: HKUnit.meter().unitDivided(by: .second()), style: .discreteAvg),
        .init(identifier: .walkingStepLength, key: "walkingStepLength",
              unit: .meterUnit(with: .centi), style: .discreteAvg),
        .init(identifier: .walkingAsymmetryPercentage, key: "walkingAsymmetryPct",
              unit: .percent(), style: .discreteAvg),
        .init(identifier: .walkingDoubleSupportPercentage, key: "walkingDoubleSupportPct",
              unit: .percent(), style: .discreteAvg),
        // Body
        .init(identifier: .bodyMass, key: "weightKg",
              unit: .gramUnit(with: .kilo), style: .mostRecent),
        .init(identifier: .bodyFatPercentage, key: "bodyFatPct",
              unit: .percent(), style: .mostRecent),
        .init(identifier: .bloodPressureSystolic, key: "bloodPressureSystolic",
              unit: .millimeterOfMercury(), style: .mostRecent),
        .init(identifier: .bloodPressureDiastolic, key: "bloodPressureDiastolic",
              unit: .millimeterOfMercury(), style: .mostRecent),
        .init(identifier: .bloodGlucose, key: "bloodGlucose",
              unit: HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)),
              style: .mostRecent),
    ]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async throws {
        guard isAvailable else { throw HealthError.notAvailable }

        var readTypes = Set<HKObjectType>()
        for q in quantityQueries {
            if let type = HKQuantityType.quantityType(forIdentifier: q.identifier) {
                readTypes.insert(type)
            }
        }
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            readTypes.insert(sleepType)
        }
        if let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
            readTypes.insert(mindfulType)
        }

        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func queryMetrics(for date: Date) async throws -> HealthMetrics {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            throw HealthError.invalidDate
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay, end: endOfDay, options: .strictStartDate
        )
        let dateString = Self.dateFormatter.string(from: date)

        var metrics = HealthMetrics(date: dateString)
        var results: [String: Double] = [:]

        await withTaskGroup(of: (String, Double?).self) { group in
            for q in quantityQueries {
                guard let sampleType = HKQuantityType.quantityType(forIdentifier: q.identifier) else {
                    continue
                }
                let key = q.key
                let unit = q.unit
                let style = q.style

                switch style {
                case .cumulativeSum:
                    group.addTask { [store] in
                        let value = try? await self.statisticsValue(
                            store: store, type: sampleType, predicate: predicate,
                            unit: unit, option: .cumulativeSum, extraction: \.sumQuantity
                        )
                        return (key, value)
                    }
                case .discreteAvg:
                    group.addTask { [store] in
                        let value = try? await self.statisticsValue(
                            store: store, type: sampleType, predicate: predicate,
                            unit: unit, option: .discreteAverage, extraction: \.averageQuantity
                        )
                        return (key, value)
                    }
                case .discreteMinMaxAvg:
                    for (suffix, option, extraction) in [
                        ("Avg", HKStatisticsOptions.discreteAverage,
                         \HKStatistics.averageQuantity as KeyPath<HKStatistics, HKQuantity?>),
                        ("Min", HKStatisticsOptions.discreteMin,
                         \HKStatistics.minimumQuantity as KeyPath<HKStatistics, HKQuantity?>),
                        ("Max", HKStatisticsOptions.discreteMax,
                         \HKStatistics.maximumQuantity as KeyPath<HKStatistics, HKQuantity?>),
                    ] {
                        let resultKey = key + suffix
                        group.addTask { [store] in
                            let value = try? await self.statisticsValue(
                                store: store, type: sampleType, predicate: predicate,
                                unit: unit, option: option, extraction: extraction
                            )
                            return (resultKey, value)
                        }
                    }
                case .mostRecent:
                    group.addTask { [store] in
                        let value = try? await self.mostRecentValue(
                            store: store, type: sampleType, predicate: predicate, unit: unit
                        )
                        return (key, value)
                    }
                }
            }

            // Sleep
            group.addTask {
                let sleep = try? await self.querySleep(predicate: predicate)
                return ("_sleep", sleep != nil ? 1 : nil)
            }

            // Mindful minutes
            group.addTask {
                let mins = try? await self.queryMindfulMinutes(predicate: predicate)
                return ("mindfulMinutes", mins)
            }

            for await (key, value) in group {
                if let value { results[key] = value }
            }
        }

        // Sleep is handled separately via querySleep which sets multiple fields
        let sleep = try? await querySleep(predicate: predicate)
        if let sleep {
            metrics.sleepHours = sleep.totalHours
            metrics.sleepCoreHours = sleep.coreHours
            metrics.sleepDeepHours = sleep.deepHours
            metrics.sleepRemHours = sleep.remHours
            metrics.sleepAwakeHours = sleep.awakeHours
            metrics.sleepInBedHours = sleep.inBedHours
        }

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

        return metrics
    }

    // MARK: - Private Helpers

    private func statisticsValue(
        store: HKHealthStore,
        type: HKQuantityType,
        predicate: NSPredicate,
        unit: HKUnit,
        option: HKStatisticsOptions,
        extraction: KeyPath<HKStatistics, HKQuantity?>
    ) async throws -> Double? {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: predicate,
                options: option
            ) { _, stats, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let value = stats?[keyPath: extraction]?.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    private func mostRecentValue(
        store: HKHealthStore,
        type: HKQuantityType,
        predicate: NSPredicate,
        unit: HKUnit
    ) async throws -> Double? {
        try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate,
                limit: 1, sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let value = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    private struct SleepResult {
        var totalHours: Double = 0
        var coreHours: Double = 0
        var deepHours: Double = 0
        var remHours: Double = 0
        var awakeHours: Double = 0
        var inBedHours: Double = 0
    }

    private func querySleep(predicate: NSPredicate) async throws -> SleepResult? {
        try await withCheckedThrowingContinuation { continuation in
            guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
                continuation.resume(returning: nil)
                return
            }
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(
                sampleType: sleepType, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }

                var result = SleepResult()
                for sample in samples {
                    let hours = sample.endDate.timeIntervalSince(sample.startDate) / 3600.0
                    let value = HKCategoryValueSleepAnalysis(rawValue: sample.value)
                    switch value {
                    case .inBed:
                        result.inBedHours += hours
                    case .asleepCore:
                        result.coreHours += hours
                        result.totalHours += hours
                    case .asleepDeep:
                        result.deepHours += hours
                        result.totalHours += hours
                    case .asleepREM:
                        result.remHours += hours
                        result.totalHours += hours
                    case .awake:
                        result.awakeHours += hours
                    case .asleepUnspecified:
                        result.totalHours += hours
                    @unknown default:
                        break
                    }
                }

                if result.inBedHours == 0 {
                    result.inBedHours = result.totalHours + result.awakeHours
                }

                continuation.resume(returning: result.totalHours > 0 ? result : nil)
            }
            store.execute(query)
        }
    }

    private func queryMindfulMinutes(predicate: NSPredicate) async throws -> Double? {
        try await withCheckedThrowingContinuation { continuation in
            guard let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
                continuation.resume(returning: nil)
                return
            }
            let query = HKSampleQuery(
                sampleType: mindfulType, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let totalMinutes = samples.reduce(0.0) { sum, sample in
                    sum + sample.endDate.timeIntervalSince(sample.startDate) / 60.0
                }
                continuation.resume(returning: totalMinutes > 0 ? totalMinutes : nil)
            }
            store.execute(query)
        }
    }

    static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f
    }()
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
