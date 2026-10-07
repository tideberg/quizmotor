import CoreLocation

/// Keeps listening through transient failures, but never extends the deadline.
@MainActor
final class LocationAttempt {
    static let timeout: TimeInterval = 0.5
    private var finished = false
    private let complete: (CLLocation?, String?) -> Void
    private let now: () -> Date

    init(now: @escaping () -> Date = Date.init, complete: @escaping (CLLocation?, String?) -> Void) {
        self.now = now
        self.complete = complete
    }

    func receive(_ locations: [CLLocation]) {
        guard let location = locations.last(where: {
            $0.horizontalAccuracy >= 0 && abs($0.timestamp.timeIntervalSince(now())) <= 60
        }) else { return }
        finish(location, nil)
    }

    func fail(_ error: Error) {
        if let error = error as? CLError, error.code == .locationUnknown {
            return // Core Location may deliver a fix in the remaining 0.5 s.
        }
        let denied = (error as? CLError)?.code == .denied
        finish(nil, denied ? "permission_required" : "location_unavailable")
    }

    func expire() { finish(nil, "location_timeout") }

    private func finish(_ location: CLLocation?, _ error: String?) {
        guard !finished else { return }
        finished = true
        complete(location, error)
    }
}
