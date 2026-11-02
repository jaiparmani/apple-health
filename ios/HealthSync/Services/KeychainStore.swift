import Foundation
import Security

/// Minimal generic-password Keychain wrapper for the ingest token.
///
/// Items use `AfterFirstUnlock` so HealthKit background delivery and App Intents
/// can read the token while the phone is locked.
enum KeychainStore {
    private static let service = "com.jaiparmani.HealthSync"

    static func string(for account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func set(_ value: String, for account: String) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        guard !value.isEmpty else {
            return SecItemDelete(base as CFDictionary) == errSecSuccess
        }
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(base as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let add = base.merging(attributes) { $1 }
            return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
        }
        return status == errSecSuccess
    }
}

/// Server configuration readable from any context (UI, background delivery, intents).
enum AppConfig {
    static let defaultServerURL = "https://apple-health.brain-store.workers.dev"
    private static let tokenAccount = "ingestToken"

    static var serverURL: String {
        let stored = UserDefaults.standard.string(forKey: "serverURL") ?? defaultServerURL
        return stored.trimmingCharacters(in: CharacterSet(charactersIn: "/ ").union(.whitespacesAndNewlines))
    }

    static var token: String {
        get { KeychainStore.string(for: tokenAccount) ?? "" }
        set { KeychainStore.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), for: tokenAccount) }
    }

    static var autoSync: Bool {
        UserDefaults.standard.object(forKey: "autoSync") as? Bool ?? true
    }

    static var isConfigured: Bool { !serverURL.isEmpty && !token.isEmpty }

    /// One-time move of a token stored by older builds in UserDefaults into the Keychain.
    static func migrateLegacyToken() {
        let defaults = UserDefaults.standard
        guard let legacy = defaults.string(forKey: tokenAccount) else { return }
        if token.isEmpty, !legacy.isEmpty { token = legacy }
        defaults.removeObject(forKey: tokenAccount)
    }
}
