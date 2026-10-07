# Visa tillgängliga kommandon.
default:
    @just --list

# Installera projektets låsta beroenden.
install:
    npm ci

# Starta utvecklingsserver och gränssnitt med automatisk omladdning.
dev:
    npm run dev

# Bygg gränssnittet för quizkvällen.
build:
    npm run build

# Starta byggd app på port 4318 och håll Macen vaken.
start:
    #!/usr/bin/env sh
    set -eu
    export QUIZ_OPEN_BROWSER=1
    if command -v caffeinate >/dev/null 2>&1; then
        exec caffeinate -di npm start
    else
        exec npm start
    fi

# Bygg och starta quizet. Avsluta med Ctrl-C.
quiz: build start

# Kör testerna, inklusive poängräkning och kraschåterställning.
test:
    npm test

# Kontrollera TypeScript.
typecheck:
    npm run typecheck

# Kontrollera kodstil.
lint:
    npm run lint

# Formatera projektet.
format:
    npm run format

# Kör kontroller och bygg före HTTP-testerna som använder produktionsfiler.
check: typecheck lint build test
