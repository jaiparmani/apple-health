import Foundation

final class SyncService {
    static let shared = SyncService()

    func sync(metrics: HealthMetrics, serverURL: String, token: String) async throws -> IngestResponse {
        guard let url = URL(string: "\(serverURL)/ingest?source=ios-app") else {
            throw SyncError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .useDefaultKeys
        request.httpBody = try encoder.encode(metrics)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SyncError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw SyncError.unauthorized
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw SyncError.serverError(statusCode: httpResponse.statusCode, message: body)
        }

        return try JSONDecoder().decode(IngestResponse.self, from: data)
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
