#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null; then
  print 'Node.js 22.16 eller senare behövs för att köra quizet.'
  read '?Tryck retur för att stänga.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
npm run build || exit 1
export QUIZ_OPEN_BROWSER=1
print 'Quizet öppnas automatiskt i webbläsaren. Låt det här fönstret vara öppet.'
if command -v caffeinate >/dev/null; then
  caffeinate -di node server/server.mjs
else
  node server/server.mjs
fi
read '?Quizet har stängts. Tryck retur för att avsluta.'
