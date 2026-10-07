# Handbok för Quizmotor

[← Till startsidan](../README.md) · [Skapa och dela quiz](skapa-quiz.md)

Den här guiden beskriver det som kan vara bra att kunna inför en quizkväll: anslutning, media, regi, poäng och återställning. För installation och första provomgången, börja i [README](../README.md).

## Nätverk och QR-koder

Programledaren öppnar `http://localhost:4318/` på datorn som kör servern. Storbilden öppnas med **Öppna storbild**. Under **Regi → Samla lagen** visas lagens adress, spelkoden och en QR-kod. Quizkoden innehåller den lokala adressen och spelkoden, så att deltagarna bara behöver fylla i lagnamnet.

Datorn och lagens mobiler måste vara på ett nät som tillåter trafik mellan dem. Internetåtkomst i sig räcker inte: ett gästnät kan isolera varje enhet. Prova en faktisk mobil före spel. Om den inte når sidan, kontrollera servern, nätverksadressen och datorns brandvägg. Vid isolerade klienter behövs ett annat nät som tillåter kommunikationen.

Under **Wifi och QR-koder** kan du ange nätverkets namn och hur deltagarna ansluter:

- **Manuell anslutning** används för nät med inloggningssida eller personliga uppgifter. Deltagarna ansluter till wifi innan de skannar quizkoden.
- **Öppet nät** ger en wifi-QR utan lösenord.
- **Gemensamt lösenord** ger en wifi-QR som delar den angivna wifi-inloggningen med deltagarna.

Om datorn har flera nätverkskort kan du välja adressen som QR-koden ska använda. Försvinner den valda adressen används en aktuell adress, och Regi ber dig prova länken igen. Utan LAN-adress visas ingen missvisande localhost-kod till deltagarna. QR-koderna skapas lokalt.

Nätverksinställningarna sparas i `data/connection.json`, separat från quizprojekten. Ett sparat wifi-lösenord följer med om du kopierar hela `data/`, men inte vid projektets ZIP-export.

Servern lyssnar som standard på `0.0.0.0:4318` och använder HTTP. Programledaråtkomst ges via localhost med en separat HttpOnly-cookie; styrning, projekt, uppladdningar och Musik kräver den behörigheten. Lag och storbild får publicerat innehåll. HTTP-trafiken är inte krypterad. Använd ett betrott lokalt nät; appen är inte konfigurerad för direkt internetexponering.

### Aktuellt wifi på Mac

Automatisk avläsning av nätverksnamnet är valfri. Bygg hjälpen med `native-wifi/build.command`, öppna `native-wifi/build/Wifi nu.app` och godkänn platsåtkomst. Läs [Wifi nu-guiden](../native-wifi/README.md) för krav och behörigheter.

När funktionen är aktiverad läser quizservern nätverksnamnet var 30:e sekund medan anslutningsskärmen är synlig. Quizet använder bara SSID; positionsuppgifterna sparas inte av quizet och skickas inte till deltagarna. **Hämta aktuellt wifi** gör en direkt avläsning. Stäng av **Använd quizdatorns aktuella wifi** för att skriva namnet manuellt.

Om avläsningen misslyckas visas inget gammalt nätverksnamn. En wifi-QR med sparat lösenord visas bara när nätverksnamnet matchar datorns aktuella wifi. Funktionen ansluter inte datorn till nätverket.

## Frågor och ledtrådar

En fråga kan innehålla kategori, frågetext, facit, förklaring, tid och poäng. Lägg till valfri bild, film eller musik samt upp till 30 tidsstyrda ledtrådar. En extra text- eller bildledtråd kan visas manuellt. Skriv inte facit i kategorin: den kan visas redan före starten och före finalens satsningar.

Ledtrådarnas tidpunkter mäts från frågans start. Till exempel kan text visas efter 20 sekunder, en bild efter 40 och en film efter 60. Tidslinjen fryser under paus. Ljudets startpunkt, exempelvis 45 sekunder in i en låt, ändrar inte ledtrådarnas tider.

Textledtrådar läggs till efter hand, medan senaste bilden eller filmen ersätter den föregående. **Nästa ledtråd** visar nästa ledtråd tidigare. Den förblir synlig även efter paus och återupptagning. Framtida ledtrådar skickas inte till lag eller storbild innan de ska visas.

Filmer på storbilden följer frågans tidslinje och visas ljudlöst. Om frågan har en startfilm och saknar annat musikspår spelas filmens ljud från programledarvyn. Ledtrådsfilmer är alltid ljudlösa. Video tar bildens plats om båda har valts.

### Prova medan du redigerar

Öppna en fråga och välj **Prova frågan**. Provläget använder även osparade ändringar utan att påverka tävlingens svar eller poäng. Starta, pausa, börja om, dra tidsreglaget eller hoppa till nästa ledtråd. Extra ledtråd och facit kan också provas.

Hopp i tidslinjen pausar uppspelningen; välj **Fortsätt** för att spela vidare. **Tillbaka till editorn** behåller ändringarna, som sparas med **Spara fråga**. Kom ihåg **Spara projekt** när det redigerade quizet ska kunna exporteras.

Lokal musik och videoljud följer ljudets startpunkt. Apple Music styr Musik-appen på quizdatorn. Frågans klocka börjar när musiken kommit igång. Vid hopp söker **Fortsätt** till motsvarande position i låten. Musiken stannar när provläget stängs och inom cirka 15 sekunder vid förlorad kontakt. Avsluta en pågående tävlingsfråga innan du provspelar Apple Music.

## Media inför spel

Ladda upp en fil eller välj **Hämta från länk → Kopiera in fil**. Länkimport kräver en publik HTTPS-direktlänk till en mediefil. Webbsidor och strömningstjänsternas vanliga delningslänkar fungerar inte som filimport. Efter import används den lokala kopian; efter projektsparning ligger den även i projektets `assets/`.

| Media | Format | Storleksgräns |
| --- | --- | --- |
| Ljud | WAV, MP3, M4A, OGG, AAC, FLAC | 250 MiB |
| Bild | PNG, JPG, WebP | 15 MiB |
| Film | MP4, WebM, MOV | 750 MiB |

Även filens codec måste stödjas av webbläsaren. Provspela de faktiska filerna i den webbläsare och med de högtalare som ska användas.

**Media inför spelkvällen** i projektvyn visar saknade eller tomma lokala filer, okopplade Musik-spår, saknade bibliotekslåtar, avvikande metadata och startpunkter efter låtens slut. Problem visas också i Regi. **Kontrollera media nu** gör en ny kontroll.

Lokala filer kontrolleras vid serverstart, efter ändrade referenser och högst en gång per minut under användning. Apple Music-kontrollen läser metadata från det lokala biblioteket. Resultat återanvänds i 15 minuter; nya spår och uttryckliga kontroller kan kontrolleras tidigare. Ingen bakgrundskontroll påbörjas medan en fråga spelas.

Mediekontrollen provar inte faktisk Apple Music-uppspelning eller offlineåtkomst. Använd **Provspela 3 sekunder** för varje sådan låt före spel.

## Utseende och identitet

Under **Quizprojekt → Quizets identitet** väljer du ett tema och egna texter. Temana är **Neon & scen**, **Oktober**, **Jul** och **Upptäcktsfärd**. Tema-knapparna ändrar färger, symbol, typografi och mönster; dina texter behålls.

**Texter genom hela quizet** innehåller hälsningar, förberedelser, poängtavla, avslutning och meddelandet vid tidsslut. **Använd identiteten** uppdaterar omgången och alla vyer. **Spara projekt** tar därefter med ändringarna i `quiz.json`. En förberedd eller pågående fråga måste avslutas innan identiteten ändras.

Du kan ladda upp en egen logotyp och bakgrund. En liggande bild med lugna ytor passar storbilden. Använd textfälten för rubriker som ska gå att ändra. PNG med transparens kan användas för logotypen. Bilderna följer med i projektets `assets/`.

## Ljud och show

**Musiknivå** och **Pratnivå** är två sparbara procentnivåer. **Jag pratar** växlar manuellt mellan dem. En snabbväxel finns nere till höger i programledarvyn. Ingen mikrofon avlyssnas; växlingen påverkar inte en extern mixer eller mikrofonens egen nivå. Lokala ljudspår och Apple Music följer de valda nivåerna.

Under **Showljud** kan du lägga in bakgrundsmusik och egen ljudeffekt. Bakgrundsmusiken spelas på poängtavlan med egen volym och sänks till högst pratnivån när du pratar. En kort standardeffekt följer med. Provlyssna och klicka **Aktivera showljud** om webbläsaren blockerar automatisk uppspelning.

Endast programledardatorn spelar ljud. Låt en programledarflik styra ljudet och använd storbildsvyn på projektorn.

## Apple Music på macOS

Den valfria integrationen styr Musik-appens lokala skriptgränssnitt. Den kräver inget Apple Developer-konto eller MusicKit-nycklar. Låtarna spelas med det konto och de behörigheter som finns i Musik; inga ljudströmmar kopieras till quizet. Demoquizet fungerar utan integrationen.

Öppna Musik och kontrollera att de önskade låtarna går att spela. Välj **Apple Music** som ljudkälla i frågeredigeraren. Du kan använda **Mitt bibliotek**, **Sök hos Apple**, klistra in en låtlänk eller välja **Använd markerad låt i Musik**. En albumlänk behöver innehålla låtens `?i=…`.

### Lägg till och koppla spår

För en okopplad kataloglåt finns **Lägg till och koppla**. Under Projekt finns **Lägg till och koppla alla låtar**. Funktionen söker först efter en matchande bibliotekslåt. Om ingen hittas öppnas kataloglåten i Musik, läggs till via låtens meny och kopplas när den dyker upp i biblioteket. Sökning, mediekontroll och provspelning ändrar inte biblioteket.

Låt Musik arbeta färdigt utan att byta app eller klicka i menyer. Du kan avbryta efter aktuell låt. Enskilda spårfel visas, medan problem som kräver behörighet, en dialog eller återanslutning stannar serien. Lyckade kopplingar sparas i omgången; välj **Spara projekt** för att uppdatera projektfilen.

Redan förberedda eller spelade frågor kan inte ändras. Avbryt förberedelsen för en ospelad fråga innan du kopplar ett spår. Tillägg kan inte startas under en pågående eller pausad tävlingsfråga.

Hjälpprogrammet för tillägg byggs med Apples Command Line Tools. Terminalen som kör quizet behöver **Automatisering → Musik** för styrning och bibliotekskontroll samt **Hjälpmedel** för menyåtgärder, under Systeminställningar → Integritet och säkerhet. Hjälpen stöder svenska och engelska menynamn. Ändras Musik-appens gränssnitt kan menyåtgärden behöva uppdateras. Byggfilerna ligger lokalt i `.music-helper-build/` och är undantagna från Git.

Den manuella vägen är **Öppna i Musik**, lägg till låten där och välj **Koppla från biblioteket**. Kopplingen använder titel, artist, album och längd. Vid flera matchningar väljer du själv i biblioteket.

### Provspelning och fel

**Provspela 3 sekunder** använder frågans startpunkt och musikvolym och stannar automatiskt. Låten laddas först med ljudet avstängt; första starten kan ta upp till 25 sekunder. Även quizstart kontrollerar att rätt låt går framåt och kan sökas i innan frågans klocka startar.

Om Musik oväntat pausas eller byter låt pausas quizet. Tar låten slut stängs svaren. Musik är en separat process: om quizservern avslutas oväntat kan ljudet fortsätta tills servern återkommer eller du stoppar det i Musik.

Om en låt inte fungerar, öppna den direkt i Musik och kontrollera appens felmeddelande, konto, auktorisering och tillgång till låten. Om en tilläggskö står på **Väntar…**, kontrollera dialoger i Musik och **Fönster → Aktivitet**. En omstart av Musik kan behövas.

Apple Music-filer ingår inte i projektets ZIP. Bibliotekets spår-id gäller den Mac där låten valdes; koppla låtarna igen på en annan Mac. Lokalfilsläget kan användas för portabla quiz med egna mediefiler. Spotify-integration finns inte.

## Regi, final och rättning

Använd **utökat skrivbord**: Regi på datorn och storbildsvyn på projektorn. Programledarvyn innehåller facit och lagkoder.

Förbered en fråga och starta när lagen är redo. Du kan pausa och visa extra ledtrådar. Förberedelsen kan avbrytas så länge frågan inte har startat och ingen finalsatsning har låsts.

**Gå till final** öppnar den första ospelade finalfrågan, även om vanliga frågor återstår. Under spel, paus eller rättning kan du välja **Final efter den här frågan** och avsluta den aktuella frågan först. **Fortsätt med frågorna** tar bort finalvalet. Efter avslutad final visas slutresultatet; resterande frågor får spelas i en ny omgång.

**Sista 10 sekunderna** kortar den återstående tiden till tio sekunder utan att hoppa fram i musik eller ledtrådar. Knappen förlänger aldrig en redan kortare nedräkning. Vid paus står nedräkningen still.

När tiden tar slut stängs svaren, effekten för tidsslut visas och facit kommer efter cirka 3,2 sekunder. Välj **Gå till rättning och poäng** när resultaten ska visas.

Programledaren kan rätta med **Rätt** och **Fel** redan när svaren kommer in. Bedömning och poäng hålls dolda för lagen tills poängvisningen börjar. Facit är ett stöd; appen jämför aldrig lagets text med facit. Stavfel och alternativa giltiga svar kan godkännas.

När svaren stängs låses visningsordningen efter ställningen före frågan. Lagen utanför topp fem uppdateras tillsammans när deras inkomna svar är rättade. Sedan visas topp fem individuellt från femte till första plats. Vid högst fem lag visas alla i turordning från sista plats. Domaren kan rätta snabbare än presentationen; resultaten köas.

När alla svar är rättade och poängen har räknats ihop blir **Avsluta frågan** tillgänglig. Omrättning räknar skillnaden utan dubbla poäng. Tidigare bedömningar kan ändras under **Poäng & säkerhet**, där du även kan lägga till eller dra av poäng med en motivering.

## Poäng och återanslutning

Frågetypen **Tidsfråga** har tidsberoende poäng, även om frågan saknar ljudfil:

```text
poäng = ceil(maxpoäng × tid kvar / totaltid)
```

100 maxpoäng över 120 sekunder ger 50 poäng efter en minut. Serverns mottagningstid avgör. Efter manuell slutnedräkning sjunker det då kvarvarande värdet till noll under de sista tio sekunderna; redan låsta svar behåller sitt poängvärde. **Bonus** har fasta poäng under hela svarstiden.

I **Final** satsar laget mellan noll och sin positiva poängsumma före frågan. Rätt svar ger satsningen i plus; fel eller uteblivet svar ger den i minus. Utan satsning får laget noll vid start. Låsta satsningar och svar kan inte ändras. Upprepade inlämningar ger samma sparade kvitto och aldrig dubbla poäng.

Telefonerna återansluter automatiskt efter tillfälliga avbrott. Lagets återställningskod består av två ord, till exempel **varm-jord**. Koden kombineras med aktuell spelkod. Programledaren kan läsa lagets kod under **Poäng & säkerhet** om laget behöver ansluta från en annan webbläsare. Dela rätt kod med rätt lag.

## Genrep med testlag

Under **Regi → Samla lagen → Genrep med testlag** väljer du **Starta 5 testlag** eller **Starta 6 testlag** innan första frågan förbereds. Lagen svarar vid olika tidpunkter, med både rätt och fel svar samt varierande finalsatsningar. Programledaren rättar själv och kan öva på hela poängvisningen.

Testlagen följer paus och slutnedräkning. **Stoppa testsvaren** stoppar automatiken; **Återuppta testsvaren** fortsätter. Redan låsta svar och satsningar ligger kvar. Inställningen överlever serveromstart och en riktig mobil kan ansluta samtidigt.

Efter genrepet: stoppa testsvaren, ta bort testlagen med papperskorgen under **Regi → Samla lagen** och välj **Rensa resultat och börja om**. Rensningen behåller kvarvarande lag och spelkod. Att byta projekt och tillbaka återställer den sparade omgången, så det rensar inte ett genrep.

Simulerade lag ersätter inte ett test av mobilgränssnitt, nätverk, ljud och projektor.

## Sparning och återställning

Svar skrivs till SQLite före kvittot till laget. En tidscheckpunkt sparas varje sekund. Efter krasch återkommer en aktiv fråga pausad vid senaste checkpunkt; upp till en sekund kan behöva spelas om. Vid förlorad programledarkontakt pausas frågan efter cirka tio sekunder.

| Plats | Innehåll |
| --- | --- |
| `data/quiz.sqlite` och eventuella `-wal`/`-shm`-filer | Pågående omgångar och arkiv. |
| `data/media/` | Uppladdade och importerade mediefiler. |
| `data/projects/` | Sparade quizprojekt med `quiz.json`, schema och lokala filer. |
| `data/projects/<id>/history/` | Tidigare sparade JSON-versioner. |
| `data/backups/` | Databasögonblicksbilder. |
| `data/connection.json` | Nätverksinställningar, inklusive eventuellt wifi-lösenord. |

Hela `data/` är undantagen från Git. **Spara projekt** behövs när redigerade frågor, media, identitet eller ljudnivåer ska ingå i en projektfil och dess export. Automatisk sparning av omgången ersätter inte det steget.

**Hämta databasbackup** ger en SQLite-backup. Den innehåller inte mediefiler eller projektmappar. Resultat-exporten är JSON utan laghemligheter och är inte en fullständig backup.

För en komplett säkerhetskopia: stoppa servern och kopiera hela **`data/`**. Kopiera inte bara en aktiv SQLite-fil; senaste ändringarna kan ligga i WAL-filen.

För att återställa en databasbackup:

1. Stoppa servern och flytta nuvarande `data/` till en säker plats.
2. Skapa en ny `data/` och kopiera vald backup till `data/quiz.sqlite`.
3. Kopiera tillbaka `media/` och `projects/` från säkerhetskopian. Kopiera även `connection.json` om du vill behålla nätverksinställningarna.
4. Starta servern och kontrollera omgången och media.

Ersätt aldrig databasen medan servern kör. Ändra inte gamla databasfiler för att flytta ett quiz; använd i stället [projektets ZIP-export](skapa-quiz.md#dela-eller-flytta-ett-quiz).

## Startalternativ och utveckling

`npm start` serverar bygget från `dist/client/`. Kör `npm run build` efter ändringar i gränssnittet. `npm run dev` startar server och gränssnitt med omladdning; programledarvyn öppnas då på `http://localhost:5173/`.

Servern har dessa miljövariabler:

| Variabel | Standard | Användning |
| --- | --- | --- |
| `PORT` | `4318` | Serverns port. |
| `QUIZ_DATA_DIR` | `data/` i repot | Alternativ lokal mapp för databas, media och projekt. |
| `QUIZ_OPEN_BROWSER` | av | Värdet `1` öppnar programledarvyn vid start. |

Exempel i zsh/bash: `PORT=4319 npm start`. Öppna då `http://localhost:4319/`. Med en alternativ datamapp behöver du själv se till att den säkerhetskopieras och inte checkas in.

Kontrollerna är `npm run typecheck`, `npm run lint`, `npm run build` och `npm test`. Tester täcker bland annat poäng, återanslutning, projekthantering, sparning och media. Faktisk Apple Music-uppspelning, codecs, nätverk, projektor och webbläsarens ljudbehörighet behöver dessutom provas i rätt miljö.

Om `just` är installerat visar `just` tillgängliga kommandon. `just install` installerar beroenden, `just quiz` bygger och startar, och `just check` kör typkontroll, lint, bygge och tester.
