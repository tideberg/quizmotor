# Quizmotor

Kör ett eget quiz med programledare, storbild och en mobil per lag. Frågorna kan innehålla text, ledtrådar, bilder, film och musik. Programledaren rättar svaren och poängtavlan visar resultaten. Flera quiz kan sparas som separata projekt med egna frågor och eget utseende.

Ett litet demoquiz med tre frågor är redo första gången du startar. Det visar tidsberoende poäng, bonusfrågor och en final med satsning, utan att du behöver ordna ljudfiler eller externa konton.

## Kom igång

Du behöver **Node.js 22.16 eller senare**, npm och en modern webbläsare. Internet behövs för att installera beroendena. Datorn och lagens mobiler behöver sedan ett gemensamt lokalt nätverk där enheterna kan nå varandra.

```sh
git clone https://github.com/tideberg/quizmotor.git
cd quizmotor
npm ci
npm run build
npm start
```

Öppna **[http://localhost:4318/](http://localhost:4318/)** på datorn som kör servern. Låt terminalen vara öppen medan ni spelar. Avsluta servern med Ctrl-C.

På **Mac** kan du efter kloning i stället dubbelklicka på **STARTA-QUIZ.command**. Det installerar beroenden om de saknas, bygger appen, öppnar webbläsaren och håller datorn vaken. Node.js måste redan vara installerat.

Kärnan använder Node.js och webbläsaren. Apple Music och automatisk avläsning av wifi-namn är valfria funktioner för macOS. ZIP-exporten använder `/usr/bin/zip`. Andra operativsystem är inte fullständigt verifierade; demot kräver ingen av Mac-integrationerna.

## Spela demot

1. Öppna programledarvyn på **localhost:4318** och klicka **Öppna storbild**. Lägg storbildsfönstret på en projektor eller extern skärm med utökat skrivbord; programledarvyn innehåller facit.
2. Anslut en mobil till samma nätverk som datorn. Skanna quizets QR-kod på storbilden, eller öppna adressen som visas under **Regi → Samla lagen**. Välj ett lagnamn. Varje lag använder en mobil.
3. Förbered den första frågan och starta den. Låt laget låsa ett svar. Programledaren bedömer svaret med **Rätt** eller **Fel**; svaren rättas inte automatiskt.
4. Gå vidare till facit och poängvisning, avsluta frågan och fortsätt till nästa. I finalen satsar laget en del av sina poäng innan frågan startar.

Du kan också prova ensam med **Genrep med testlag** under **Regi → Samla lagen**. Se [handboken](docs/handbok.md#genrep-med-testlag) för hur du städar undan testlagen efteråt.

Ljud spelas från programledarens dator. Storbilden och mobilerna spelar inte upp ljudet en gång till. Lokala frågor och mediefiler fungerar utan internet efter installation och bygge.

## Gör ett eget quiz

1. Under **Quizprojekt** anger du ett namn och väljer **Spara nytt projekt**. När projektet är sparat kan du använda **Spara som kopia** för att göra fler quiz. Har du redan spelat demot, välj **Rensa resultat och börja om** i kopian innan du redigerar de spelade frågorna.
2. Under **Frågorna** ändrar du, lägger till och ordnar frågor. **Prova frågan** låter dig testa även osparade ändringar utan att påverka lagens poäng.
3. Under **Quizprojekt → Quizets identitet** väljer du tema och egna texter. Klicka **Använd identiteten**.
4. Välj **Spara projekt** när frågor, utseende och media är klara. **Byt quiz** öppnar projektbiblioteket; varje projekts omgång behålls när du växlar mellan dem.

[examples/demo/quiz.json](examples/demo/quiz.json) är samma demo som appen utgår från vid första start och fungerar som en komplett mall för egna quiz. [Guiden Skapa quiz](docs/skapa-quiz.md) beskriver fälten, filformatet och hur du kopierar eller delar ett projekt.

## Spara och dela

Den pågående omgången, lagens svar och resultat sparas automatiskt lokalt i **`data/`**. **Spara projekt** sparar själva quizets innehåll; **Hämta ZIP** exporterar det senast sparade projektet med frågor och lokala mediefiler. Lag, poäng och lagkoder följer inte med i projektets ZIP.

`data/` skapas vid körning och är undantagen från Git. Dina egna quiz, uppladdningar, resultat och wifi-inställningar publiceras alltså inte när du checkar in kod med normal Git-hantering. Säkerhetskopiera hela mappen med servern stoppad. [Handboken](docs/handbok.md#sparning-och-återställning) beskriver backup och återställning.

## Nätverk och felsökning

Programledaråtkomst ges lokalt via `localhost` på quizdatorn. Lagen använder datorns nätverksadress och spelkoden, som visas i appen. `localhost` på en telefon syftar på telefonen själv och fungerar därför inte som lagadress.

Servern lyssnar på port **4318** på datorns nätverksgränssnitt och använder vanlig HTTP. Quizmotor är avsedd för ett **betrott lokalt nätverk** och är inte konfigurerad för direkt exponering på internet. Kontrollera brandväggen och prova en riktig mobil före spel; många gästnät blockerar trafik mellan enheter. Se [nätverksguiden](docs/handbok.md#nätverk-och-qr-koder).

## Utveckling

```sh
npm run dev        # utvecklingsläge; öppna http://localhost:5173/
npm run typecheck
npm run lint
npm run build
npm test
```

`npm start` kör det färdiga bygget på port 4318. Om du använder [just](https://github.com/casey/just) finns även `just quiz` för bygge och start samt `just check` för typkontroll, lint, bygge och tester.

Frågeformatets version är **3** och beskrivs i [JSON-schemat](schemas/quiz-project.schema.json). Applikationsversionen och frågeformatets version är separata.

Läs [handboken](docs/handbok.md) för ledtrådar, mediefiler, Apple Music, poängsättning och återställning.
