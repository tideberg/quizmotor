import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { integer, text, fail } from './model.mjs';
import { parseMusicUrl } from './music-catalog.mjs';
import { createMusicAdder } from './music-add.mjs';
const exec = promisify(execFile),
  script = fileURLToPath(
    new URL('../scripts/music-control.js', import.meta.url),
  );
export function createMusicBridge({
  platform = process.platform,
  execute = exec,
} = {}) {
  let queue = Promise.resolve();
  const add = createMusicAdder({ execute });
  function call(action, p = {}) {
    if (platform !== 'darwin')
      return Promise.reject(
        new Error('Apple Music-kontrollen kräver Musik-appen på en Mac.'),
      );
    const task = async () => {
      if (action === 'add') return add(p.url);
      try {
        const { stdout } = await execute(
          '/usr/bin/osascript',
          ['-l', 'JavaScript', script, action, JSON.stringify(p)],
          {
            timeout: ['play', 'preview', 'check'].includes(action)
              ? 35000
              : 12000,
            maxBuffer: 512 * 1024,
          },
        );
        return JSON.parse(stdout.trim());
      } catch (e) {
        if (e.killed || e.code === 'ETIMEDOUT')
          throw new Error(
            'Musik svarade inte. Kontrollera om macOS visar en fråga om Automatisering och tillåt quizets terminal att styra Musik. Försök sedan igen.',
          );
        const message = String(e.stderr || e.message);
        if (
          /not allowed assistive|assistive access|hjälpmedel|-25211/i.test(
            message,
          )
        )
          throw new Error(
            'Tillåt terminalen som kör quizet under Systeminställningar → Integritet och säkerhet → Hjälpmedel. Försök sedan igen.',
          );
        if (/-1743|not authorized|inte behörig/i.test(message))
          throw new Error(
            'Tillåt att quizets terminal styr Musik under Systeminställningar → Integritet och säkerhet → Automatisering.',
          );
        throw new Error(
          message
            .replace(/^.*execution error: /s, '')
            .replace(/^(Error: )+/, '')
            .replace(/ \(-?\d+\)\s*$/, '')
            .slice(0, 500),
        );
      }
    };
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  return {
    status: () => call('status'),
    check: (ids) => {
      if (
        !Array.isArray(ids) ||
        ids.length > 200 ||
        ids.some((id) => !/^[A-F0-9]{16}$/.test(id))
      )
        fail('Ogiltiga biblioteksspår.');
      return call('check', { ids });
    },
    selection: () => call('selection'),
    add: (url) => call('add', parseMusicUrl(url)),
    openCatalog: (url) => {
      if (platform !== 'darwin') fail('Öppna länken på Macen som kör quizet.');
      const parsed = parseMusicUrl(url);
      return execute('/usr/bin/open', ['-a', 'Music', parsed.url], {
        timeout: 5000,
      }).then(() => ({ ok: true }));
    },
    search: (query) => call('search', { query: text(query, 100, 'Sökningen') }),
    volume: (volume) =>
      call('volume', { volume: integer(volume, 0, 100, 'Volymen') }),
    pause: (persistentId) => call('pause', { persistentId }),
    play: ({ persistentId, position, volume, preview = false }) => {
      if (!/^[A-F0-9]{16}$/.test(persistentId))
        fail('Ogiltigt Apple Music-spår.');
      if (
        typeof position !== 'number' ||
        !Number.isFinite(position) ||
        position < 0 ||
        position > 7200
      )
        fail('Ogiltig ljudposition.');
      return call(preview ? 'preview' : 'play', {
        persistentId,
        position,
        volume: integer(volume, 0, 100, 'Volymen'),
      });
    },
  };
}
