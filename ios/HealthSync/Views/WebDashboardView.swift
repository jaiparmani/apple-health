import SwiftUI
import WebKit

/// The Cloudflare-hosted dashboard, embedded with the ingest token pre-filled.
struct WebDashboardView: View {
    @EnvironmentObject var syncManager: SyncManager
    @State private var page: WebPage?
    @State private var loadedKey = ""

    var body: some View {
        NavigationStack {
            Group {
                if let page {
                    WebView(page)
                        .webViewBackForwardNavigationGestures(.enabled)
                        .webViewLinkPreviews(.enabled)
                        .ignoresSafeArea(edges: .bottom)
                        .overlay(alignment: .top) {
                            if page.isLoading {
                                ProgressView(value: page.estimatedProgress)
                                    .progressViewStyle(.linear)
                                    .tint(.green)
                            }
                        }
                } else {
                    ContentUnavailableView(
                        "Dashboard not configured",
                        systemImage: "safari",
                        description: Text("Add your server URL and token in Settings.")
                    )
                }
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reload", systemImage: "arrow.clockwise") { page?.reload() }
                        .disabled(page == nil)
                }
            }
            .task(id: "\(syncManager.serverURL)|\(syncManager.ingestToken)") { configurePage() }
        }
    }

    private func configurePage() {
        let key = "\(syncManager.serverURL)|\(syncManager.ingestToken)"
        guard key != loadedKey || page == nil else { return }
        loadedKey = key
        guard syncManager.isConfigured, let url = syncManager.dashboardURL,
              let origin = Self.origin(of: url) else {
            page = nil
            return
        }

        let configuration = WebPage.Configuration()
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.tokenScript(token: syncManager.ingestToken, origin: origin),
                         injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let newPage = WebPage(configuration: configuration)
        newPage.isInspectable = true
        newPage.load(URLRequest(url: url))
        page = newPage
    }

    private static func tokenScript(token: String, origin: String) -> String {
        let encode = { (value: String) -> String in
            let data = (try? JSONEncoder().encode(value)) ?? Data("\"\"".utf8)
            return String(decoding: data, as: UTF8.self)
        }
        return """
        (function () {
          if (location.origin !== \(encode(origin))) return;
          try { localStorage.setItem('healthToken', \(encode(token))); } catch (e) {}
        })();
        """
    }

    private static func origin(of url: URL) -> String? {
        guard let scheme = url.scheme, let host = url.host() else { return nil }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }
}
