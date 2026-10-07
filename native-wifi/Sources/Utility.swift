import AppKit
import CoreLocation
import CoreWLAN

/// A separate, short-lived app instance. No window and no permission prompts.
@MainActor
final class UtilityDelegate: NSObject, NSApplicationDelegate, @preconcurrency CLLocationManagerDelegate {
    private var manager: CLLocationManager?
    private var finished = false
    private var requested = false
    private var deadline: Timer?
    private var authorizationRetry: Timer?
    private var locationDeadline: Timer?
    private var locationAttempt: LocationAttempt?

    func applicationDidFinishLaunching(_ notification: Notification) {
        deadline = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.finish(error: "location_timeout")
            }
        }
        let manager = CLLocationManager()
        self.manager = manager
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.delegate = self
        // Core Location registers this process asynchronously. Reading the
        // initial value here can report notDetermined and terminate the process
        // before locationd has even verified its signing requirement.
        // Wait for the delegate callback instead.
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationRetry?.invalidate()
        if manager.authorizationStatus == .notDetermined {
            // Allow registration to settle, without prompting in utility mode.
            authorizationRetry = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self, let manager = self.manager else { return }
                    self.checkAuthorization(manager)
                }
            }
            return
        }
        checkAuthorization(manager)
    }

    private func checkAuthorization(_ manager: CLLocationManager) {
        guard !finished else { return }
        guard CLLocationManager.locationServicesEnabled() else {
            finish(error: "location_services_disabled")
            return
        }
        guard manager.authorizationStatus == .authorizedAlways else {
            finish(error: "permission_required")
            return
        }
        guard !requested else { return }
        requested = true
        locationAttempt = LocationAttempt { [weak self] location, error in
            self?.finish(location: location, error: error)
        }
        locationDeadline = Timer.scheduledTimer(withTimeInterval: LocationAttempt.timeout, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.locationAttempt?.expire() }
        }
        // Keep listening during the short window even if the first response is
        // locationUnknown. Stop immediately on a valid fix or at the deadline.
        manager.startUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        locationAttempt?.receive(locations)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        locationAttempt?.fail(error)
    }

    private func finish(location: CLLocation? = nil, error: String? = nil) {
        guard !finished else { return }
        finished = true
        deadline?.invalidate()
        authorizationRetry?.invalidate()
        locationDeadline?.invalidate()
        manager?.stopUpdatingLocation()
        let authorized = CLLocationManager.locationServicesEnabled() && manager?.authorizationStatus == .authorizedAlways
        let ssid = authorized ? CWWiFiClient.shared().interfaces()?.compactMap { $0.powerOn() ? $0.ssid() : nil }.first : nil
        let validLocation = authorized ? location : nil
        var errors: [String] = []
        if let error { errors.append(error) }
        if ssid == nil { errors.append("ssid_unavailable") }
        let position: Any = validLocation.map { value -> [String: Any] in
            ["latitude": value.coordinate.latitude,
             "longitude": value.coordinate.longitude,
             "accuracyMeters": value.horizontalAccuracy,
             "timestamp": ISO8601DateFormatter().string(from: value.timestamp)]
        } ?? NSNull()
        let result: [String: Any] = [
            "ok": errors.isEmpty,
            "ssid": ssid as Any? ?? NSNull(),
            "location": position,
            "errors": errors,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]
        do {
            var data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            data.append(0x0a)
            try FileHandle.standardOutput.write(contentsOf: data)
            let status = errors.isEmpty ? 0 : 1
            if let index = CommandLine.arguments.firstIndex(of: "--status-file"),
               CommandLine.arguments.indices.contains(index + 1) {
                try String(status).write(toFile: CommandLine.arguments[index + 1], atomically: true, encoding: .utf8)
            }
            exit(Int32(status))
        } catch {
            exit(2)
        }
    }
}

@main
enum EntryPoint {
    @MainActor static func main() {
        if CommandLine.arguments.contains("--json") {
            let application = NSApplication.shared
            application.setActivationPolicy(.prohibited)
            let delegate = UtilityDelegate()
            application.delegate = delegate
            withExtendedLifetime(delegate) { application.run() }
        } else {
            WiFiNowApp.main()
        }
    }
}
