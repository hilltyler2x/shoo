import Capacitor
import UIKit
import CoreLocation
import Foundation
import UserNotifications

// Shoo's native side on iPhone.
//
// iOS won't let the app run on a timer, so instead:
//  - every nag is handed to iOS ahead of time as a local notification
//  - a geofence around where you are tells iOS to wake Shoo when you leave,
//    and Shoo cancels the rest of that shift's nags
//  - a geofence around work fires the "made it" notification
//  - each nag has an "I've left" button that cancels the rest
//
// TripMonitor starts from AppDelegate so geofence events are handled even when
// iOS relaunches Shoo in the background with no web view.

private enum Keys {
    static let trip = "shoo.trip"
    static let events = "shoo.events"
    static let originRegion = "shoo.origin"
    static let jobRegion = "shoo.job"
    static let category = "SHOO_NAG"
    static let leftAction = "SHOO_LEFT"
}

struct TripConfig: Codable {
    let shiftId: String
    /// Epoch ms.
    let shiftStart: Double
    /// Ignore leaving before this (epoch ms), e.g. a late-night snack run.
    let watchFrom: Double
    let celebrateTitle: String
    let onTimeBody: String
    let lateBody: String
    var leftAt: Double?
    var arrivedAt: Double?
}

final class TripMonitor: NSObject, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    static let shared = TripMonitor()
    static let eventNotification = Notification.Name("ShooTripEvent")

    let manager = CLLocationManager()
    private var authWaiters: [(CLAuthorizationStatus) -> Void] = []
    private let defaults = UserDefaults.standard

    func start() {
        manager.delegate = self
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let left = UNNotificationAction(identifier: Keys.leftAction, title: "I've left 🚪", options: [])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Keys.category, actions: [left], intentIdentifiers: [], options: [])
        ])
    }

    // MARK: Trip state

    var trip: TripConfig? {
        get { defaults.data(forKey: Keys.trip).flatMap { try? JSONDecoder().decode(TripConfig.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Keys.trip) }
    }

    func watch(_ config: TripConfig, origin: CLLocationCoordinate2D, job: CLLocationCoordinate2D, radius: Double) {
        if let current = trip, current.shiftId == config.shiftId, current.leftAt != nil || current.arrivedAt != nil {
            return // already on the way; don't reset
        }
        trip = config
        stopRegions()
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let r = min(max(radius, 100), manager.maximumRegionMonitoringDistance)
        let home = CLCircularRegion(center: origin, radius: r, identifier: Keys.originRegion)
        home.notifyOnEntry = false
        home.notifyOnExit = true
        let work = CLCircularRegion(center: job, radius: r, identifier: Keys.jobRegion)
        work.notifyOnEntry = true
        work.notifyOnExit = false
        manager.startMonitoring(for: home)
        manager.startMonitoring(for: work)
    }

    func clear() {
        stopRegions()
        trip = nil
    }

    private func stopRegions() {
        for region in manager.monitoredRegions where region.identifier.hasPrefix("shoo.") {
            manager.stopMonitoring(for: region)
        }
    }

    // MARK: Events

    func markLeft(source: String) {
        guard var t = trip, t.leftAt == nil else { return }
        let now = Date().timeIntervalSince1970 * 1000
        if source == "geofence" && now < t.watchFrom { return }
        t.leftAt = now
        trip = t
        cancelNags(for: t.shiftId)
        if let home = manager.monitoredRegions.first(where: { $0.identifier == Keys.originRegion }) {
            manager.stopMonitoring(for: home)
        }
        record(["type": "left", "shiftId": t.shiftId, "at": now, "source": source])
    }

    func markArrived() {
        guard var t = trip, t.arrivedAt == nil else { return }
        let now = Date().timeIntervalSince1970 * 1000
        if now < t.watchFrom { return }
        t.arrivedAt = now
        if t.leftAt == nil { t.leftAt = now }
        trip = t
        cancelNags(for: t.shiftId)
        stopRegions()
        let onTime = now <= t.shiftStart
        NagScheduler.show(id: "\(t.shiftId):arrived", title: t.celebrateTitle, body: onTime ? t.onTimeBody : t.lateBody)
        record(["type": "arrived", "shiftId": t.shiftId, "at": now, "onTime": onTime])
    }

    private func cancelNags(for shiftId: String) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests.map(\.identifier).filter { $0.hasPrefix(shiftId + ":") }
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    private func record(_ event: [String: Any]) {
        var events = defaults.array(forKey: Keys.events) as? [[String: Any]] ?? []
        events.append(event)
        defaults.set(Array(events.suffix(20)), forKey: Keys.events)
        NotificationCenter.default.post(name: TripMonitor.eventNotification, object: nil, userInfo: event)
    }

    func takeEvents() -> [[String: Any]] {
        let events = defaults.array(forKey: Keys.events) as? [[String: Any]] ?? []
        defaults.removeObject(forKey: Keys.events)
        return events
    }

    // MARK: Location permission

    func requestAlways(_ done: @escaping (CLAuthorizationStatus) -> Void) {
        let status = manager.authorizationStatus
        if status == .authorizedAlways || status == .denied || status == .restricted {
            done(status)
            return
        }
        authWaiters.append(done)
        manager.requestAlwaysAuthorization()
        // iOS only shows the "Always" upgrade once; if it doesn't, answer anyway.
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.flushWaiters() }
    }

    private func flushWaiters() {
        let waiters = authWaiters
        authWaiters.removeAll()
        waiters.forEach { $0(manager.authorizationStatus) }
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .notDetermined { flushWaiters() }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        if region.identifier == Keys.originRegion { markLeft(source: "geofence") }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        if region.identifier == Keys.jobRegion { markArrived() }
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        NSLog("Shoo geofence failed: \(error.localizedDescription)")
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.actionIdentifier == Keys.leftAction { markLeft(source: "button") }
        completionHandler()
    }
}

enum NagScheduler {
    static func schedule(_ nags: [JSObject], completion: @escaping (Error?) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        let now = Date().timeIntervalSince1970
        let group = DispatchGroup()
        var firstError: Error?
        for nag in nags {
            guard let id = nag["id"] as? String,
                  let at = (nag["at"] as? NSNumber)?.doubleValue,
                  let title = nag["title"] as? String,
                  let body = nag["body"] as? String else { continue }
            let delay = at / 1000 - now
            if delay < 1 { continue }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.categoryIdentifier = Keys.category
            content.threadIdentifier = "shoo"
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
            group.enter()
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
                if let error = error, firstError == nil { firstError = error }
                group.leave()
            }
        }
        group.notify(queue: .main) { completion(firstError) }
    }

    static func show(id: String, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}

@objc(ShooNativePlugin)
public class ShooNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShooNativePlugin"
    public let jsName = "ShooNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "permissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackgroundLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleNags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAllNags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markLeft", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeTripEvents", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(onTripEvent(_:)), name: TripMonitor.eventNotification, object: nil)
    }

    @objc private func onTripEvent(_ note: Notification) {
        notifyListeners("trip", data: note.userInfo as? [String: Any] ?? [:])
    }

    @objc func permissionStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let notifications: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: notifications = "granted"
            case .denied: notifications = "denied"
            default: notifications = "prompt"
            }
            call.resolve(["notifications": notifications, "backgroundLocation": Self.locationState()])
        }
    }

    @objc func requestNotifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["notifications": granted ? "granted" : "denied"])
        }
    }

    @objc func requestBackgroundLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripMonitor.shared.requestAlways { _ in
                call.resolve(["backgroundLocation": Self.locationState()])
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    private static func locationState() -> String {
        switch TripMonitor.shared.manager.authorizationStatus {
        case .authorizedAlways: return "granted"
        case .authorizedWhenInUse: return "when-in-use"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    @objc func scheduleNags(_ call: CAPPluginCall) {
        let nags = call.getArray("nags", JSObject.self) ?? []
        NagScheduler.schedule(nags) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func cancelAllNags(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        call.resolve()
    }

    @objc func showNow(_ call: CAPPluginCall) {
        NagScheduler.show(id: "now-\(Date().timeIntervalSince1970)", title: call.getString("title") ?? "Shoo", body: call.getString("body") ?? "")
        call.resolve()
    }

    @objc func watchTrip(_ call: CAPPluginCall) {
        guard let shiftId = call.getString("shiftId"),
              let shiftStart = call.getDouble("shiftStart"),
              let origin = call.getObject("origin"), let oLat = origin["lat"] as? Double, let oLng = origin["lng"] as? Double,
              let job = call.getObject("job"), let jLat = job["lat"] as? Double, let jLng = job["lng"] as? Double else {
            call.reject("watchTrip needs shiftId, shiftStart, origin and job")
            return
        }
        let config = TripConfig(
            shiftId: shiftId,
            shiftStart: shiftStart,
            watchFrom: call.getDouble("watchFrom") ?? 0,
            celebrateTitle: call.getString("celebrateTitle") ?? "Made it",
            onTimeBody: call.getString("onTimeBody") ?? "",
            lateBody: call.getString("lateBody") ?? "",
            leftAt: nil,
            arrivedAt: nil
        )
        DispatchQueue.main.async {
            TripMonitor.shared.watch(
                config,
                origin: CLLocationCoordinate2D(latitude: oLat, longitude: oLng),
                job: CLLocationCoordinate2D(latitude: jLat, longitude: jLng),
                radius: call.getDouble("radius") ?? 150
            )
            call.resolve()
        }
    }

    @objc func clearTrip(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripMonitor.shared.clear()
            call.resolve()
        }
    }

    @objc func markLeft(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripMonitor.shared.markLeft(source: "app")
            call.resolve()
        }
    }

    @objc func takeTripEvents(_ call: CAPPluginCall) {
        call.resolve(["events": TripMonitor.shared.takeEvents()])
    }
}

/// Swaps in for Capacitor's view controller so the app's own plugin gets registered.
class ShooViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShooNativePlugin())
    }
}
