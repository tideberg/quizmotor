import SwiftUI
import CoreWLAN
import CoreLocation
import AppKit

@MainActor
final class WiFiModel: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published var position: CLLocation?
    @Published var locationStatus = "Platsåtkomst behövs för att hämta position."
    @Published var locating = false
    @Published var ssid: String?
    @Published var title = "Läser wifi…"
    @Published var detail = ""
    @Published var needsPermission = false
    @Published var canRequestPermission = false

    private let location = CLLocationManager()
    private let client = CWWiFiClient.shared()

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyHundredMeters
        refresh()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        refresh()
        if manager.authorizationStatus == .authorizedAlways {
            requestPosition()
        } else {
            position = nil
            locating = false
            locationStatus = "Platsåtkomst behövs för att hämta position."
        }
    }

    func requestPosition() {
        guard location.authorizationStatus == .authorizedAlways,
              CLLocationManager.locationServicesEnabled(), !locating else { return }
        locating = true
        locationStatus = "Hämtar position…"
        location.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        locating = false
        guard let latest = locations.last, latest.horizontalAccuracy >= 0 else {
            locationStatus = "Ingen giltig position tillgänglig."
            return
        }
        position = latest
        locationStatus = "Noggrannhet ±\(Int(latest.horizontalAccuracy.rounded())) m"
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        locating = false
        locationStatus = "Kunde inte hämta position: \(error.localizedDescription)"
    }

    func requestPermission() {
        location.requestWhenInUseAuthorization()
    }

    func openSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices") else { return }
        NSWorkspace.shared.open(url)
    }

    func refresh() {
        // Clear the previous SSID before checking permissions or connection state.
        ssid = nil
        let servicesEnabled = CLLocationManager.locationServicesEnabled()
        let authorization = location.authorizationStatus
        needsPermission = !servicesEnabled || authorization != .authorizedAlways
        canRequestPermission = servicesEnabled && authorization == .notDetermined
        if needsPermission {
            position = nil
            locating = false
            locationStatus = "Platsåtkomst behövs för att hämta position."
        }
        let interfaces = client.interfaces() ?? []
        guard !interfaces.isEmpty else {
            title = "Ingen wifi-adapter"
            detail = "Datorn rapporterar inget trådlöst nätverkskort."
            return
        }
        let active = interfaces.filter { $0.powerOn() }
        guard !active.isEmpty else {
            title = "Wifi är avstängt"
            detail = "Slå på wifi i macOS för att se nätverket."
            return
        }
        guard !needsPermission else {
            title = "Tillåt nätverksnamn"
            detail = "macOS kräver Platstjänster för att läsa wifi-namnet. Samma behörighet används för att visa din position. Uppgifterna visas lokalt och returneras vid utility-anrop."
            return
        }
        if let connection = active.first(where: { $0.ssid() != nil }), let name = connection.ssid() {
            ssid = name
            title = name
            detail = "Ansluten via wifi · \(connection.interfaceName ?? "wifi")"
        } else {
            title = "Inget nätverksnamn"
            detail = "Wifi är på, men macOS lämnar inget nätverksnamn. Kontrollera anslutningen och åtkomsten till Platstjänster."
        }
    }

    func copyName() {
        refresh()
        guard let ssid else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(ssid, forType: .string)
    }
}

struct ContentView: View {
    @StateObject private var model = WiFiModel()
    @Environment(\.scenePhase) private var scenePhase
    private let timer = Timer.publish(every: 3, on: .main, in: .common).autoconnect()
    private var utilityCommand: String {
        let path = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/wifi-now").path
        return "'" + path.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    var body: some View {
        ScrollView {
        VStack(spacing: 20) {
            Image(systemName: model.ssid == nil ? "wifi.exclamationmark" : "wifi")
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(model.ssid == nil ? Color.secondary : Color.accentColor)
                .accessibilityHidden(true)
            VStack(spacing: 10) {
                Text("DITT WIFI JUST NU")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(model.title)
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .textSelection(.enabled)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text(model.detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                if model.needsPermission {
                    Button(model.canRequestPermission ? "Tillåt åtkomst…" : "Öppna Platstjänster…") {
                        if model.canRequestPermission { model.requestPermission() }
                        else { model.openSettings() }
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Kopiera nätverksnamn", systemImage: "doc.on.doc") { model.copyName() }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.ssid == nil)
                }
                Button("Uppdatera", systemImage: "arrow.clockwise") { model.refresh() }
                    .keyboardShortcut("r", modifiers: .command)
            }
            Divider()
            VStack(spacing: 8) {
                Label("Din plats", systemImage: "location")
                    .font(.headline)
                if let position = model.position {
                    Text(String(format: "%.6f, %.6f", position.coordinate.latitude, position.coordinate.longitude))
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                    Text("Mätt \(position.timestamp.formatted(date: .abbreviated, time: .standard))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(model.locationStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button(model.locating ? "Hämtar position…" : "Uppdatera plats") {
                    model.requestPosition()
                }
                .disabled(model.needsPermission || model.locating)
            }
            Text("Wifi uppdateras automatiskt var tredje sekund")
                .font(.caption)
                .foregroundStyle(.tertiary)
            Divider()
            VStack(alignment: .leading, spacing: 8) {
                Label("Anropa från frågesporten", systemImage: "terminal")
                    .font(.headline)
                Text("Godkänn platsåtkomst här en gång. Kör sedan kommandot nedan från den lokala servern eller Terminal.")
                Text(utilityCommand)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Kopiera kommando") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(utilityCommand, forType: .string)
                }
                Text("Startar en egen instans utan fönster, returnerar en JSON-rad med ssid och location (latitud, longitud, noggrannhet och tidpunkt) och avslutar direkt efter svaret. Väntar upp till 0,5 sekunder på en giltig plats efter behörighetskontrollen. Uppstart och behörighetskontroll har en separat säkerhetsgräns på 15 sekunder.")
                Text("Exitkod 0 = komplett svar, 1 = delvis svar eller saknad behörighet, 2 = anropsfel. Saknade värden är null; errors beskriver felet. Vid location: null och location_timeout kan Platstjänster behöva starta upp. Kör då kommandot igen om du behöver platsen. SSID kan användas direkt även utan plats. Ett öppet appfönster påverkas inte.")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(32)
        }
        .frame(width: 500, height: 720)
        .onReceive(timer) { _ in
            if scenePhase == .active { model.refresh() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { model.refresh() }
        }
    }
}

struct WiFiNowApp: App {
    var body: some Scene {
        Window("Wifi nu", id: "main") {
            ContentView()
        }
        .windowResizability(.contentSize)
        .defaultPosition(.center)
    }
}
