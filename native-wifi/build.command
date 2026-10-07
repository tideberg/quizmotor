#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
app="$PWD/build/Wifi nu.app"
# Never replace the signed binary while an old copy is still running: the user
# could grant permission to that old process while querying the new binary.
if /usr/bin/pgrep -f "^$app/Contents/MacOS/WiFiNow( |$)" >/dev/null; then
    echo "Stäng Wifi nu före ombyggnad. Ett öppet fönster kör annars den gamla signaturen." >&2
    exit 1
fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
xcrun swiftc -parse-as-library -O -target "$(uname -m)-apple-macos13.0" \
    Sources/*.swift -o "$app/Contents/MacOS/WiFiNow" \
    -framework SwiftUI -framework CoreWLAN -framework CoreLocation -framework AppKit
cp Info.plist "$app/Contents/Info.plist"
cp wifi-now "$app/Contents/Resources/wifi-now"
chmod +x "$app/Contents/Resources/wifi-now"
codesign --force --sign - "$app"
echo "Byggd: $app"
