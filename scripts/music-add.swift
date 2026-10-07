// Local, explicit catalog-to-library action. No keyboard shortcuts or coordinates.
import AppKit
import ApplicationServices

struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
func fail(_ message: String) throws -> Never { throw Failure(message: message) }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func string(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}
func find(_ root: AXUIElement, where accept: (AXUIElement) -> Bool) -> [AXUIElement] {
    var pending = [root], found: [AXUIElement] = [], index = 0
    while index < pending.count && index < 3000 {
        let element = pending[index]
        index += 1
        if accept(element) { found.append(element) }
        pending.append(contentsOf: attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    }
    return found
}
func isCatalogRow(_ id: String, catalogId: String) -> Bool {
    id.hasPrefix("Music.shelfItem.AlbumTrackLockup[") && id.contains("-\(catalogId),parentId=")
}
func songMenuIndex(_ titles: [[String]], name: String) -> Int? {
    guard !name.isEmpty else { return nil }
    let matches = titles.indices.filter { index in
        titles[index].contains("Spela " + name) || titles[index].contains("Play " + name)
    }
    return matches.count == 1 ? matches[0] : nil
}
func checkDialog(_ app: AXUIElement) throws {
    let dialogs = find(app) {
        string($0, kAXRoleAttribute) == kAXSheetRole ||
        string($0, kAXSubroleAttribute) == kAXDialogSubrole ||
        string($0, kAXSubroleAttribute) == kAXSystemDialogSubrole
    }
    if !dialogs.isEmpty {
        try fail("Musik väntar på en dialog. Besvara den i Musik på Macen och försök igen. Inget nytt tillägg skickades.")
    }
}
func run() throws {
    guard CommandLine.arguments.count == 2,
          let url = URL(string: CommandLine.arguments[1]),
          url.absoluteString.range(of: #"^https://music\.apple\.com/[a-z]{2}/song/[1-9][0-9]{0,19}$"#, options: .regularExpression) != nil
    else { try fail("Ogiltig låtlänk.") }
    guard AXIsProcessTrusted() else {
        try fail("Tillåt terminalen som kör quizet under Systeminställningar → Integritet och säkerhet → Hjälpmedel. Försök sedan igen.")
    }
    guard let music = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Music").first
    else { try fail("Öppna Musik-appen och logga in på Apple Music först.") }
    let app = AXUIElementCreateApplication(music.processIdentifier)
    AXUIElementSetMessagingTimeout(app, 1)
    try checkDialog(app)
    let open = Process()
    open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    open.arguments = ["-b", "com.apple.Music", url.absoluteString]
    try open.run()
    open.waitUntilExit()
    guard open.terminationStatus == 0 else { try fail("Kunde inte öppna låten i Musik.") }
    // Launch Services returns before navigation. In particular, reopening the
    // same song can briefly expose its old row while the new page loads.
    Thread.sleep(forTimeInterval: 2)
    music.activate(options: [.activateIgnoringOtherApps])

    let catalogId = url.lastPathComponent
    let deadline = Date().addingTimeInterval(20)
    var selected: AXUIElement?
    repeat {
        try checkDialog(app)
        let rows = find(app) { element in
            let id = string(element, kAXIdentifierAttribute)
            return isCatalogRow(id, catalogId: catalogId)
        }
        if rows.count > 1 { try fail("Musik visar flera rader för låten. Inget lades till.") }
        if let row = rows.first { selected = row; break }
        Thread.sleep(forTimeInterval: 0.3)
    } while Date() < deadline
    guard let row = selected else {
        try fail("Kunde inte hitta exakt vald låt i Musik. Kontrollera att katalogsidan har laddats. Inget lades till.")
    }
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == music.processIdentifier else {
        try fail("Musik fick inte fokus. Öppna Musik på Macen och försök igen.")
    }
    let buttons = find(row) { element in
        string(element, kAXRoleAttribute) == kAXButtonRole &&
        ["Mer", "More"].contains(string(element, kAXTitleAttribute).isEmpty
            ? string(element, kAXDescriptionAttribute) : string(element, kAXTitleAttribute))
    }
    guard buttons.count == 1 else { try fail("Kunde inte hitta låtens meny i Musik. Inget lades till.") }
    // The row may become inaccessible while AppKit is tracking its modal menu.
    let name = string(row, kAXDescriptionAttribute)
    guard !name.isEmpty else { try fail("Kunde inte läsa den valda låtraden i Musik. Försök igen när sidan laddats färdigt.") }
    var shouldCancel = true
    defer {
        if shouldCancel {
            for menu in find(app, where: { string($0, kAXRoleAttribute) == kAXMenuRole }) {
                AXUIElementPerformAction(menu, kAXCancelAction as CFString)
            }
        }
    }
    // AppKit can report cannotComplete while its modal menu is already open.
    // Observe the resulting menu instead of retrying the press.
    let pressed = AXUIElementPerformAction(buttons[0], kAXPressAction as CFString)
    guard pressed == .success || pressed == .cannotComplete
    else { try fail("Kunde inte öppna låtens meny i Musik. Inget lades till.") }
    var sawSongMenu = false
    for _ in 0..<20 {
        try checkDialog(app)
        let menus = find(app) { string($0, kAXRoleAttribute) == kAXMenuRole }
        let menuItems = menus.map { attribute($0, kAXChildrenAttribute) as? [AXUIElement] ?? [] }
        let titles = menuItems.map { items in
            items.map { string($0, kAXTitleAttribute) }
        }
        guard let index = songMenuIndex(titles, name: name) else {
            Thread.sleep(forTimeInterval: 0.2)
            continue
        }
        sawSongMenu = true
        // Do not inspect unrelated menu-bar items: hidden menus may expose
        // Delete from Library even when this catalog song has never been added.
        let items = menuItems[index]
        // A successful previous request may still be syncing into the local library.
        if items.contains(where: { ["Radera från biblioteket", "Delete from Library"].contains(string($0, kAXTitleAttribute)) }) {
            print(#"{"ok":true,"alreadyPresent":true}"#)
            return
        }
        let add = items.filter { ["Lägg till i bibliotek", "Add to Library"].contains(string($0, kAXTitleAttribute)) }
        if add.count == 1, attribute(add[0], kAXEnabledAttribute) as? Bool == true {
            let added = AXUIElementPerformAction(add[0], kAXPressAction as CFString)
            guard added == .success || added == .cannotComplete
            else { try fail("Musik kunde inte lägga till låten. Försök igen.") }
            shouldCancel = false
            Thread.sleep(forTimeInterval: 0.5)
            print(#"{"ok":true}"#)
            return
        }
        Thread.sleep(forTimeInterval: 0.2)
    }
    if !sawSongMenu {
        try fail("Kunde inte läsa menyn för ”\(name)” i Musik. Låt Musik vara öppet och försök igen. Inget tillägg skickades.")
    }
    try fail("Musik visar inget aktivt ”Lägg till i bibliotek” för ”\(name)”. Kontrollera låtens meny i Musik. Inget tillägg skickades.")
}
#if MUSIC_MENU_TEST
// These checks exercise selection without accessing or changing Music.
let hidden = ["Radera från biblioteket", "Lägg till i bibliotek"]
let intended = ["Lägg till i bibliotek", "Spela Testlåt"]
precondition(songMenuIndex([hidden, intended], name: "Testlåt") == 1)
precondition(songMenuIndex([hidden], name: "Testlåt") == nil)
precondition(songMenuIndex([intended, intended], name: "Testlåt") == nil)
precondition(songMenuIndex([["Add to Library", "Play Song"]], name: "Song") == 0)
precondition(songMenuIndex([["Spela "]], name: "") == nil)
let row = "Music.shelfItem.AlbumTrackLockup[id=track-lockup-111-123,parentId=track-list-111]"
precondition(isCatalogRow(row, catalogId: "123"))
precondition(!isCatalogRow(row, catalogId: "23"))
precondition(!isCatalogRow(row, catalogId: "111"))
precondition(!isCatalogRow("Music.shelfItem.AlbumDetailHeaderLockup[id=album-detail-header-123,parentId=x]", catalogId: "123"))
print("Music menu checks passed")
#else
do { try run() } catch {
    FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
    exit(1)
}
#endif
