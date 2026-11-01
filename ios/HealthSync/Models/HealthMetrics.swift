import Foundation

struct HealthMetrics: Codable {
    var date: String
    // Heart & recovery
    var restingHeartRate: Double?
    var heartRateAvg: Double?
    var heartRateMin: Double?
    var heartRateMax: Double?
    var walkingHeartRateAvg: Double?
    var hrv: Double?
    var respiratoryRate: Double?
    var oxygenSaturation: Double?
    var bodyTemperature: Double?
    var vo2max: Double?
    // Activity
    var steps: Double?
    var activeEnergy: Double?
    var basalEnergy: Double?
    var exerciseMinutes: Double?
    var standMinutes: Double?
    var flightsClimbed: Double?
    var distanceKm: Double?
    var distanceCyclingKm: Double?
    var daylightMinutes: Double?
    var mindfulMinutes: Double?
    // Mobility
    var walkingSpeed: Double?
    var walkingStepLength: Double?
    var walkingAsymmetryPct: Double?
    var walkingDoubleSupportPct: Double?
    // Sleep
    var sleepHours: Double?
    var sleepCoreHours: Double?
    var sleepDeepHours: Double?
    var sleepRemHours: Double?
    var sleepAwakeHours: Double?
    var sleepInBedHours: Double?
    // Body
    var weightKg: Double?
    var bodyFatPct: Double?
    var bloodPressureSystolic: Double?
    var bloodPressureDiastolic: Double?
    var bloodGlucose: Double?

    var nonNilCount: Int {
        let mirror = Mirror(reflecting: self)
        return mirror.children.filter { label, value in
            guard label != "date" else { return false }
            if let opt = value as? Double?, opt != nil { return true }
            return false
        }.count
    }
}

struct SyncRecord: Codable, Identifiable {
    let id: UUID
    let date: String
    let syncedAt: Date
    let metricsCount: Int
    let success: Bool
    let errorMessage: String?
}

struct IngestResponse: Codable {
    let ok: Bool?
    let error: String?
    let date: String?
}
