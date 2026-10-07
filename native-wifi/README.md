# Wifi nu

En liten native-app för macOS 13 eller senare, skriven i SwiftUI med CoreWLAN.
Visar aktuellt SSID, uppdaterar var tredje sekund när appen är aktiv och kan
kopiera namnet till urklipp. Visar också latitud, longitud, noggrannhet och tidpunkt
från Core Location. Position hämtas efter beviljad behörighet och med Uppdatera plats. Wifi-anslutning innebär inte nödvändigtvis internetåtkomst.

## Bygg och kör

Kräver Apples Command Line Tools (`xcode-select --install`). Kör:

```sh
./build.command
open 'build/Wifi nu.app'
```

Bygget skapar en app för datorns processorarkitektur. Appen är lokalt ad hoc-signerad,
inte notariserad för distribution. Du kan flytta den till Program och öppna därifrån.

Klicka på **Tillåt åtkomst…** första gången och godkänn macOS-dialogen.
macOS kräver Platstjänster för åtkomst till nätverksnamn. Vid nekad åtkomst:
Systeminställningar → Integritet och säkerhet → Platstjänster → Wifi nu.
Appen lagrar inga uppgifter permanent och gör inga egna nätverksanrop. macOS Platstjänster
kan använda nätverket för att bestämma positionen. Vid misslyckad uppdatering
behålls den senaste positionen med sin ursprungliga tidpunkt och ett felmeddelande.

Om macOS inte lämnar ett SSID visas detta uttryckligen; appen gissar inte nätverksnamnet.
En Ethernet-anslutning rapporteras inte som wifi.

## Utility-anrop: starta → JSON → avsluta

Öppna appen normalt och godkänn platsåtkomst först. Kör sedan följande från
denna mapp (samma kommando med absolut sökväg finns att kopiera i appens UI):

```sh
'build/Wifi nu.app/Contents/Resources/wifi-now'
```

Startskriptet startar en separat appinstans via macOS Launch Services med `--json`,
utan fönster eller behörighetsdialog. Appen läser SSID, begär en position och
avslutar så snart svaret är klart. Efter godkänd behörighetskontroll väntar appen högst **0,5 sekunder** på en
giltig position. Tillfälliga `locationUnknown`-fel och ogiltiga/äldre positioner
avslutar inte försöket i förtid. Hela appkörningen har dessutom en säkerhetsgräns
på 15 sekunder, utöver macOS starttid. Ett redan öppet appfönster påverkas inte. Varje anrop har en egen
tillfällig katalog som raderas efter svaret. Den kan tillfälligt innehålla platsdata.

Stdout innehåller exakt en JSON-rad, till exempel:

```json
{"ok":true,"ssid":"Mitt wifi","location":{"latitude":59.33,"longitude":18.06,"accuracyMeters":65,"timestamp":"2026-09-09T06:00:00Z"},"errors":[],"timestamp":"2026-09-09T06:00:01Z"}
```

`location.timestamp` är mättidpunkten; den yttersta `timestamp` är svarstidpunkten.
Positioner äldre än 60 sekunder accepteras inte. `accuracyMeters` är horisontell
noggrannhet enligt Core Location. SSID läses vid svarstidpunkten.

- Exitkod **0**: både SSID och position tillgängliga.
- Exitkod **1**: delvis svar eller saknad behörighet; läs även JSON vid felkod.
- Exitkod **2**: start- eller kommunikationsfel.

Saknade värden är `null`. `errors` kan innehålla `permission_required`,
`location_services_disabled`, `location_timeout`, `location_unavailable`,
`ssid_unavailable`, `launch_failed` eller `invalid_response`.
Ett platsfel hindrar inte att ett tillgängligt SSID returneras, och omvänt.

**Om `location` är `null` och `errors` innehåller `location_timeout`:** macOS kan
behöva längre tid för att få fram en position vid första anropet. Kör kommandot
igen om du behöver platsen. Det är ingen garanti att en plats kan erhållas;
hantera alltid ett delvis svar. Quizet behöver bara SSID och använder det direkt.

Från frågesportens lokala Node-server:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
// Exemplet utgår från en modul i projektets server/-mapp.
const utility = fileURLToPath(new URL(
  '../native-wifi/build/Wifi nu.app/Contents/Resources/wifi-now', import.meta.url,
));

async function readWifiAndLocation() {
  try {
    const { stdout } = await run(utility, [], { timeout: 25000 });
    return JSON.parse(stdout);
  } catch (error) {
    // Exitkod 1/2 kan fortfarande innehålla ett användbart JSON-svar.
    if (error.stdout?.trim()) return JSON.parse(error.stdout);
    throw error;
  }
}
```

Anropa startskriptet via `execFile` utan shell. Att köra själva Mach-O-binären
direkt från Node kan ge annan behörighetsattribution i macOS. Wrappern använder
`open -n -g -W` så att varje anrop startar och väntar på sin egen appinstans.
Ny ad hoc-signering vid ombyggnad kan kräva att platsåtkomst godkänns igen.
Byggskriptet vägrar bygga medan Wifi nu körs: stäng appen, bygg, öppna den nya
versionen och godkänn åtkomst där. Att godkänna i ett gammalt, redan öppet fönster
ger inte den nya binären behörighet.

Utility-läget väntar på Core Locations behörighetscallback innan statusen
utvärderas; en nyskapad managers initialvärde är inte ett färdigt behörighetsbesked.

Verifiera hela flödet med riktiga värden efter att ha godkänt åtkomst:

```sh
WIFI_REQUIRE_SUCCESS=1 node --test tests/utility.test.mjs
```

Testet kräver både SSID och position och provar samtidiga och efterföljande
anrop. Utan miljövariabeln testas även giltiga felsvar, vilket i sig inte bevisar
att åtkomst till SSID och plats fungerar.

Apples förklaring av behörigheten:
https://developer.apple.com/forums/thread/759044
