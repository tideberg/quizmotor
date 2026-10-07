# Skapa, spara och dela quiz

[← Till startsidan](../README.md)

## Börja med demot

Vid första start öppnas demoquizet från [examples/demo/quiz.json](../examples/demo/quiz.json). Det innehåller tre frågor utan externa mediefiler: en gåta med poäng som minskar med tiden, en bonusfråga med fasta poäng och en final med satsning.

Du kan redigera direkt under **Frågorna**. Spara gärna först demot under **Quizprojekt → Spara nytt projekt**, ange därefter ett eget projektnamn och välj **Spara som kopia**. Då finns båda versionerna i projektbiblioteket. En kopia behåller den aktuella omgångens lag och resultat. Om du redan har spelat demot, välj **Rensa resultat och börja om** i kopian innan du redigerar de spelade frågorna.

Varje projekt har egna frågor, ledtrådar, ljudinställningar och identitet. Under **Quizets identitet** kan du byta tema, texter, logotyp och bakgrund. Projektnamnet i biblioteket är separat från de namn och hälsningar som deltagarna ser. **Använd identiteten** uppdaterar omgången; **Spara projekt** uppdaterar projektfilen.

## Projekt och omgång är olika saker

**Projektet** är det återanvändbara quizet. Det sparas uttryckligen med **Spara projekt** och innehåller frågor, media, utseende och ljudinställningar.

**Omgången** är det som händer när ni spelar: lag, svar, satsningar, poäng och pågående fråga. Den sparas automatiskt i databasen, även medan du redigerar. När du byter projekt sparas dess omgång och återkommer när du öppnar det igen. En pågående fråga pausas vid bytet.

**Rensa resultat och börja om** tar bort svar, satsningar och poäng för det öppna projektet. Lag, spelkod och frågor behålls. Att bara öppna samma projekt igen återställer inte resultaten.

## Läs och redigera quiz.json

Ett portabelt projekt har denna struktur:

```text
quiz.json                  # frågor, identitet och inställningar
quiz-project.schema.json   # hjälp och validering i JSON-editorn
assets/                    # projektets lokala ljud, bilder och filmer
```

`assets/` behövs bara när quizet refererar till mediefiler. Demoquizet innehåller alla obligatoriska fält; kopiera det som helhet när du vill skapa en fil manuellt. `$schema` pekar på schemafilen bredvid `quiz.json`. Servern validerar dessutom projektet när det öppnas och sparas.

| Fält | Innehåll |
| --- | --- |
| `format`, `version` | `"quiz-project"` och `3`. Behåll dessa värden. |
| `id` | Projektets UUID, till exempel ett nytt id från `crypto.randomUUID()`. Mappnamnet under `data/projects/` ska vara samma id. |
| `name` | Namnet som visas i projektbiblioteket. |
| `savedAt` | Tidpunkt i millisekunder sedan Unix-epoken, till exempel `Date.now()`. |
| `branding` | Quizets texter, tema och eventuella bildreferenser. |
| `questions` | Frågorna i körordning, högst 200. |
| `show` | Ljudnivåer och valfria showljud. |

Frågornas viktigaste fält:

| Fält | Innehåll |
| --- | --- |
| `id` | Unikt inom quizet; bokstäver, siffror och bindestreck, högst 80 tecken. |
| `title` | Kategori eller rubrik som får visas före frågan. Undvik att avslöja facit här. |
| `prompt` | Frågetexten som visas från start. |
| `answer`, `explanation` | Facit och valfri förklaring. Programledaren bedömer svaren manuellt. |
| `kind` | `"music"` för **Tidsfråga** med tidsberoende poäng, `"bonus"` för fasta poäng eller `"wager"` för final med satsning. Typen `music` fungerar även utan musik. |
| `duration`, `maxPoints` | Svarstid i sekunder (10–600) och maxpoäng (1–10 000). Finalens poäng avgörs av satsningen. |
| `hint`, `image` | Extra text- och bildledtråd som programledaren visar manuellt. |
| `picture`, `video` | Bild eller film som visas från start. |
| `cues` | Tidsstyrda ledtrådar; varje post har `id`, `at` i sekunder, `text`, `image` och `video`. |
| `audioSource`, `audio`, `appleMusic` | Ljudkälla och referens. För frågor utan ljud: `"local"`, `null`, `null`. |
| `offset` | Ljudets startpunkt i sekunder; påverkar inte ledtrådarnas tider. |
| `example` | Sätt `false` för egna frågor. |

Behåll även de tomma och `null`-värda fälten från mallen. Den fullständiga strukturen och alla gränser finns i [schemat](../schemas/quiz-project.schema.json). Ljudkällan `appleMusic` kräver en spårreferens och Musik-appen på quizdatorn; lokal media gör projekt lättare att flytta.

## Kopiera demot till ett nytt projekt på disk

Stoppa servern. Kör följande i repots rot för att kopiera demot, ge det ett nytt id och skriva det till ditt lokala projektbibliotek:

```sh
node --input-type=module <<'JS'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const project = JSON.parse(readFileSync('examples/demo/quiz.json', 'utf8'));
project.id = randomUUID();
project.name = 'Mitt quiz';
project.savedAt = Date.now();
for (const question of project.questions) question.example = false;
const folder = `data/projects/${project.id}`;
mkdirSync(folder, { recursive: true });
cpSync('examples/demo', folder, { recursive: true });
writeFileSync(`${folder}/quiz.json`, JSON.stringify(project, null, 2) + '\n');
console.log(`Redigera ${folder}/quiz.json och öppna sedan Mitt quiz i appen.`);
JS
```

Redigera filen, starta servern och välj **Byt quiz → Öppna quiz** för det nya projektet. Kommandot ovan är för ett skal som stöder heredoc, exempelvis zsh eller bash. Du kan också kopiera mappen och ändra fälten för hand.

Använd ett **nytt projekt-id** för varje separat quiz och för manuellt importerade omarbetningar. Ett redan öppnat projekts sparade omgång återanvänds när du byter tillbaka; en ändrad `quiz.json` med samma id ersätter inte den omgången. Gör fortsatta ändringar i appen eller importera filen under ett nytt id.

## Mediefiler

Enklast är att ladda upp media i editorn och välja **Spara projekt**. Då får filerna giltiga namn och kopieras till projektets `assets/`.

Vid manuell redigering ska en filreferens vara relativ, exempelvis `assets/01234567-89ab-cdef-0123-456789abcdef.png`. Filnamnets stam får bara innehålla små bokstäver `a`–`f`, siffror och bindestreck. Godkända ändelser finns i schemat. Använd inte absoluta sökvägar, webbadresser eller `../`. Filen måste finnas i projektmappen.

Alla lokala filer som frågorna, ledtrådarna, showljuden och identiteten använder följer med vid projektsparning. Apple Music-spår kopieras inte som ljudfiler. Kontrollera alltid media och provspela på datorn som ska användas.

## Dela eller flytta ett quiz

1. Välj **Spara projekt**, så att dina senaste ändringar finns i projektfilen.
2. Välj **Hämta ZIP** i projektbiblioteket. Exporten kräver `/usr/bin/zip` på serverdatorn.
3. På mottagardatorn: stoppa servern och packa upp innehållet i `data/projects/<id>/`, där `<id>` är värdet i `quiz.json`. Filen ska ligga direkt i den mappen, utan en extra mappnivå.
4. Starta servern och öppna quizet från projektbiblioteket.

Det finns ingen ZIP-importknapp. Undvik att skriva över ett befintligt projekt: ge kopian ett nytt `id` och samma nya mappnamn när det behövs. Apple Music-spår behöver kopplas mot biblioteket på mottagardatorn.

ZIP-filen innehåller quizet och media, men inga lag, resultat eller lagkoder. Dela bara de mediefiler du vill att mottagaren ska få. `data/` är undantagen från Git; lägg färdiga exempel i en separat avsedd mapp om du vill versionshantera dem.
