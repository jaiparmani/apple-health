import Foundation

final class SyncService: Sendable {
    static let shared = SyncService()

    func sync(metrics: HealthMetrics, serverURL: String, token: String) async throws -> IngestResponse {
        let request = try makeRequest(path: "/ingest?source=ios-app", method: "POST",
                                      serverURL: serverURL, token: token, body: try Self.encode(metrics))
        let data = try await send(request)
        return try JSONDecoder().decode(IngestResponse.self, from: data)
    }

    /// Sends many days in one request (one git commit server-side) via `/import-bulk`.
    func syncBulk(days: [HealthMetrics], serverURL: String, token: String) async throws {
        struct Body: Encodable { let days: [HealthMetrics] }
        let encoder = JSONEncoder()
        var request = try makeRequest(path: "/import-bulk", method: "POST",
                                      serverURL: serverURL, token: token, body: try encoder.encode(Body(days: days)))
        request.timeoutInterval = 120
        _ = try await send(request)
    }

    /// Authenticated GET against the worker's JSON API (e.g. `/api/trends`).
    func get<T: Decodable>(_ type: T.Type, path: String, serverURL: String, token: String) async throws -> T {
        let request = try makeRequest(path: path, method: "GET", serverURL: serverURL, token: token, body: nil)
        let data = try await send(request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Stable JSON for a payload, so identical re-syncs can be detected and skipped.
    static func encode(_ metrics: HealthMetrics) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(metrics)
    }

    private func makeRequest(path: String, method: String, serverURL: String, token: String,
                             body: Data?) throws -> URLRequest {
        guard let url = URL(string: serverURL + path) else { throw SyncError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        return request
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw SyncError.unauthorized
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw SyncError.serverError(statusCode: httpResponse.statusCode, message: String(body.prefix(200)))
        }
        return data
    }
}

enum SyncError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(statusCode: Int, message: String)
    case noConfiguration

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .invalidResponse: return "Invalid response from server"
        case .unauthorized: return "Invalid token — check Settings"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        case .noConfiguration: return "Set server URL and token in Settings"
        }
    }
}
