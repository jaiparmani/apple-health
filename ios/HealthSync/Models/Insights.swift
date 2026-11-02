import Foundation

/// What the widget, App Intents and Today screen show. Written by the app into the
/// shared App Group; the widget decodes the same JSON (see `WidgetSnapshot`).
struct HealthSnapshot: Codable, Sendable {
    var updatedAt: Date
    var date: String
    var recoveryScore: Int?
    var strain: Double?
    var sleepHours: Double?
    var sleepScore: Int?
    var hrv: Double?
    var restingHeartRate: Double?
    var steps: Double?
    var prediction: RecoveryPrediction?
    var briefHeadline: String?
}

/// Tomorrow-morning recovery forecast from the on-device model (`RecoveryPredictor`).
struct RecoveryPrediction: Codable, Sendable, Hashable {
    struct Scenario: Codable, Sendable, Hashable {
        let sleepHours: Double
        let score: Int
    }

    struct Driver: Codable, Sendable, Hashable {
        let label: String
        /// Recovery points this factor adds (+) or removes (−) versus an average day.
        let impact: Double
    }

    let forDate: String
    let score: Int
    let low: Int
    let high: Int
    let assumedSleepHours: Double
    let scenarios: [Scenario]
    let drivers: [Driver]
    let trainingDays: Int
    /// False when there isn't enough history and a simple persistence heuristic was used.
    let isModelBased: Bool
    /// Mean absolute error on the most recent held-out days, if measurable.
    let backtestError: Double?
}

/// A daily coaching brief, generated on-device with Foundation Models (or rules as fallback).
struct BriefContent: Codable, Sendable, Hashable {
    let date: String
    let headline: String
    let summary: String
    let focus: [String]
    let watchOut: String
    let generatedOnDevice: Bool
}

// MARK: - Server payloads

/// The subset of `/api/trends` the app uses.
struct TrendsResponse: Decodable, Sendable {
    struct Recovery: Decodable, Sendable {
        let date: String?
        let score: Double?
        let sleepScore: Double?
    }
    let recovery: Recovery?
    let readinessScore: Double?
    let todayStrain: Double?
}

/// One day from `/api/series` (mirrors the backend's `DailyMetrics`, subset used for prediction).
struct DayRecord: Decodable, Sendable {
    let date: String
    var hrv: Double?
    var restingHeartRate: Double?
    var respiratoryRate: Double?
    var oxygenSaturation: Double?
    var heartRateAvg: Double?
    var sleepHours: Double?
    var sleepEfficiency: Double?
    var sleepDeepHours: Double?
    var sleepRemHours: Double?
    var exerciseMinutes: Double?
    var activeEnergy: Double?
    var steps: Double?
    var daylightMinutes: Double?
    var mindfulMinutes: Double?
    var strain: Double?
    var extra: [String: Double]?
}

struct SeriesResponse: Decodable, Sendable {
    let days: [DayRecord]
}

// MARK: - Shared storage

/// App Group-backed storage shared by the app, its background work and the widget.
enum SharedStore {
    static let appGroup = "group.com.jaiparmani.HealthSync"
    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    private enum Key {
        static let snapshot = "snapshot"
        static let brief = "brief"
        static let pendingDates = "pendingDates"
        static let sentHashes = "sentHashes"
        static let lastFinalizedDate = "lastFinalizedDate"
        static let lastSuccessfulSync = "lastSuccessfulSync"
        static let lastSeriesFetch = "lastSeriesFetch"
        static let prediction = "prediction"
    }

    private static func load<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(T.self, from: data)
    }

    private static func save<T: Encodable>(_ value: T?, _ key: String) {
        guard let value else { defaults.removeObject(forKey: key); return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(value) { defaults.set(data, forKey: key) }
    }

    static var snapshot: HealthSnapshot? {
        get { load(HealthSnapshot.self, Key.snapshot) }
        set { save(newValue, Key.snapshot) }
    }

    static var brief: BriefContent? {
        get { load(BriefContent.self, Key.brief) }
        set { save(newValue, Key.brief) }
    }

    static var prediction: RecoveryPrediction? {
        get { load(RecoveryPrediction.self, Key.prediction) }
        set { save(newValue, Key.prediction) }
    }

    /// Days whose last sync attempt failed; retried on every sync run.
    static var pendingDates: Set<String> {
        get { Set(defaults.stringArray(forKey: Key.pendingDates) ?? []) }
        set { defaults.set(Array(newValue).sorted(), forKey: Key.pendingDates) }
    }

    /// SHA-256 of the last payload successfully sent per day, to skip no-op re-syncs.
    static var sentHashes: [String: String] {
        get { defaults.dictionary(forKey: Key.sentHashes) as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: Key.sentHashes) }
    }

    /// The most recent past day that has been re-synced after it ended.
    static var lastFinalizedDate: String? {
        get { defaults.string(forKey: Key.lastFinalizedDate) }
        set { defaults.set(newValue, forKey: Key.lastFinalizedDate) }
    }

    static var lastSuccessfulSync: Date? {
        get { defaults.object(forKey: Key.lastSuccessfulSync) as? Date }
        set { defaults.set(newValue, forKey: Key.lastSuccessfulSync) }
    }

    static var lastSeriesFetch: Date? {
        get { defaults.object(forKey: Key.lastSeriesFetch) as? Date }
        set { defaults.set(newValue, forKey: Key.lastSeriesFetch) }
    }
}
