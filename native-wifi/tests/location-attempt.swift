import Foundation
import CoreLocation

@main
struct LocationAttemptTests {
    @MainActor static func main() {
        let now = Date()
        func fix(age: Double = 0, accuracy: Double = 10) -> CLLocation {
            CLLocation(coordinate: CLLocationCoordinate2D(latitude: 59, longitude: 18), altitude: 0,
                       horizontalAccuracy: accuracy, verticalAccuracy: -1,
                       timestamp: now.addingTimeInterval(-age))
        }
        var results: [(CLLocation?, String?)] = []
        let attempt = LocationAttempt(now: { now }) { results.append(($0, $1)) }
        attempt.fail(CLError(.locationUnknown))
        attempt.receive([fix(age: 61)])
        attempt.receive([fix(accuracy: -1)])
        precondition(results.isEmpty, "Transient error or stale fix ended the window early")
        attempt.receive([fix()])
        attempt.expire()
        attempt.receive([fix()])
        precondition(results.count == 1 && results[0].0 != nil && results[0].1 == nil)

        results = []
        let timeout = LocationAttempt { results.append(($0, $1)) }
        timeout.fail(CLError(.locationUnknown))
        timeout.expire()
        timeout.receive([fix()])
        precondition(results.count == 1 && results[0].0 == nil && results[0].1 == "location_timeout")

        results = []
        let denied = LocationAttempt { results.append(($0, $1)) }
        denied.fail(CLError(.denied))
        denied.expire()
        precondition(results.count == 1 && results[0].1 == "permission_required")
        print("Passed: transient failure then fix; stale/invalid fix; timeout; denied; exactly one response.")
    }
}
