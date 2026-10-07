import http from 'node:http';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMediaHealth, importMedia } from './media.mjs';
import { createProjects } from './projects.mjs';
import { createQuestionPreview } from './question-preview.mjs';
import { createMusicBridge } from './music.mjs';
import { createMusicPreparation } from './music-preparation.mjs';
import { revealedCues, normalizeAppleTrack } from './model.mjs';
import { createMusicCatalog, matchingLibraryTracks } from './music-catalog.mjs';
import { createQuizStore, QuizError } from './engine.mjs';
import QRCode from 'qrcode';
import {
  createWifiBridge,
  effectiveConnection,
  isConnectionScreen,
} from './wifi.mjs';
import {
  connectionInfo,
  connectionUrls,
  createConnectionSettings,
  wifiPayload,
} from './connection.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = resolve(process.env.QUIZ_DATA_DIR || join(root, 'data'));
const port = Number(process.env.PORT || 4318);
const frontendPort = Number(process.env.QUIZ_FRONTEND_PORT || port);
const openBrowser = process.env.QUIZ_OPEN_BROWSER === '1';
const publicDir = join(root, 'dist/client');
const mediaDir = join(dataDir, 'media');
mkdirSync(mediaDir, { recursive: true });
const wallStart = Date.now(),
  monotonicStart = performance.now();
const store = createQuizStore(join(dataDir, 'quiz.sqlite'), () =>
  Math.floor(wallStart + performance.now() - monotonicStart),
);
const projects = createProjects(dataDir),
  connection = createConnectionSettings(dataDir),
  wifi = createWifiBridge(),
  music = createMusicBridge(),
  musicCatalog = createMusicCatalog(),
  exec = promisify(execFile);
const mediaHealth = createMediaHealth(mediaDir, music);
const musicPreparation = createMusicPreparation({
  music,
  catalog: musicCatalog,
});
mediaHealth.refresh(store.export());
let controller = null,
  fatal = false,
  musicFault = '',
  musicPolling = false,
  nativeTrack = null;
let hostQueue = Promise.resolve();
const enqueueHost = (fn) => {
  const task = hostQueue.then(fn);
  hostQueue = task.catch(() => {});
  return task;
};
async function resolveAppleTrack(input) {
  const track = normalizeAppleTrack(input);
  if (track.persistentId) return track;
  const catalog = await musicCatalog.lookup(track.url);
  const result = await music.search(catalog.name);
  const matches = matchingLibraryTracks(catalog, result.tracks);
  assert(
    matches.length === 1,
    matches.length
      ? 'Flera bibliotekslåtar matchar. Välj rätt version under Mitt bibliotek.'
      : 'Välj Lägg till och koppla i frågans ljudinställningar, eller koppla alla låtar under Projekt.',
    400,
  );
  return { ...catalog, persistentId: matches[0].persistentId };
}
const questionPreview = createQuestionPreview({
  music,
  resolveTrack: resolveAppleTrack,
  isLive: () => ['running', 'paused'].includes(store.active()?.status),
  volume: () => store.export().show.musicVolume,
});
async function pauseNative() {
  const id = nativeTrack || store.active()?.question.appleMusic?.persistentId;
  if (id)
    try {
      await music.pause(id);
      musicFault = '';
      nativeTrack = null;
    } catch (e) {
      musicFault = e.message;
    }
}
if (
  store.active()?.status === 'paused' &&
  store.active()?.question.audioSource === 'appleMusic'
)
  void pauseNative();
const same = (a, b) =>
  typeof a === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const host = (req) =>
  same(
    (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('quiz_host='))
      ?.slice(10),
    store.secret,
  );
const credential = (req) =>
  (req.headers.authorization || '').replace(/^Bearer /, '');
const controllerId = (req) => req.headers['x-quiz-controller'];
const isController = (req) => controller && controller.id === controllerId(req);
const json = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
const assert = (ok, message, status = 400) => {
  if (!ok) throw new QuizError(message, status);
};
async function body(req) {
  const parts = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    assert(length <= 1024 * 1024, 'För mycket data.', 413);
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString() || '{}');
  } catch {
    throw new QuizError('Ogiltig begäran.');
  }
}
const urls = () =>
  connectionUrls(
    networkInterfaces(),
    frontendPort || server.address()?.port || port,
    connection.get().preferredUrl,
  );
function state(req, wantHost) {
  const s = store.snapshot({
    host: wantHost && host(req),
    credential: credential(req),
  });
  s.joinUrls = urls();
  const savedConnection = connection.get();
  const detectedWifi = savedConnection.automatic ? wifi.get() : null;
  s.connection = connectionInfo(
    effectiveConnection(savedConnection, detectedWifi),
    s.joinUrls,
    s.code,
    s.host,
  );
  if (s.host) {
    s.connection.settings = savedConnection;
    s.connection.detection = detectedWifi;
  }
  if (s.host) {
    s.controller = !!isController(req);
    s.controllerBusy = !!controller && Date.now() - controller.at < 10000;
    s.controllerId = controller?.id;
    s.projects = projects.list();
    s.mediaHealth = mediaHealth.refresh(store.export());
    s.musicIntegration = {
      available: process.platform === 'darwin',
      fault: musicFault,
    };
  }
  return s;
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
function file(req, res, path, download) {
  const size = statSync(path).size;
  const headers = {
    'Content-Type': mime[extname(path)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ...(download
      ? { 'Content-Disposition': `attachment; filename="${download}"` }
      : {}),
  };
  let start = 0,
    end = size - 1,
    partial = false;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end =
      range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    partial = true;
  }
  res.writeHead(partial ? 206 : 200, {
    ...headers,
    'Content-Length': Math.max(0, end - start + 1),
    ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }
  const stream = createReadStream(path, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
const attempts = new Map();
function rateLimit(req) {
  const key = req.socket.remoteAddress;
  const now = Date.now();
  const a = attempts.get(key) || { at: now, n: 0 };
  if (now - a.at > 60000) {
    a.at = now;
    a.n = 0;
  }
  a.n++;
  attempts.set(key, a);
  assert(a.n <= 40, 'Vänta en minut och försök igen.', 429);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      // Browser mutations must be same-origin; reverse proxies must preserve Host.
      if (origin)
        assert(
          new URL(origin).host === req.headers.host,
          'Begäran kommer från en annan adress.',
          403,
        );
      assert(
        !fatal,
        'Sparningen har stoppat. Starta om servern och kontrollera disken.',
        503,
      );
    }
    if (p === '/api/health')
      return json(res, fatal ? 503 : 200, {
        ok: !fatal,
        serverNow: Date.now(),
      });
    if (p === '/api/session' && req.method === 'POST') {
      const addr = req.socket.remoteAddress;
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
      const hostname = (req.headers.host || '').split(':')[0];
      assert(
        local && ['localhost', '127.0.0.1'].includes(hostname),
        'Programledarvyn öppnas på datorn som kör quizet, via localhost.',
        403,
      );
      res.setHeader(
        'Set-Cookie',
        `quiz_host=${store.secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
      );
      return json(res, 200, { ok: true });
    }
    if (p === '/api/state' && req.method === 'GET') {
      if (url.searchParams.get('view') === 'host')
        assert(host(req), 'Öppna programledarvyn via localhost.', 401);
      return json(
        res,
        fatal ? 503 : 200,
        state(req, url.searchParams.get('view') === 'host'),
      );
    }
    if (p === '/api/connection/current' && req.method === 'GET') {
      if (connection.get().automatic && isConnectionScreen(store.snapshot()))
        await wifi.refreshIfNeeded();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/connection/detect' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren får hämta nätverket.', 401);
      return json(res, 200, await wifi.refresh());
    }
    if (p === '/api/connection' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren får ändra nätverket.', 401);
      const settings = await body(req);
      connection.save(settings, urls());
      return json(res, 200, { ok: true });
    }
    if (
      ['/api/qr/join.svg', '/api/qr/wifi.svg'].includes(p) &&
      req.method === 'GET'
    ) {
      const saved = connection.get();
      const settings = effectiveConnection(
        saved,
        saved.automatic ? wifi.get() : null,
      );
      const payload =
        p === '/api/qr/wifi.svg'
          ? wifiPayload(settings)
          : connectionInfo(settings, urls(), store.snapshot().code).joinUrl;
      assert(
        payload,
        'Ingen QR-kod tillgänglig. Kontrollera nätverksinställningarna i Regi.',
        404,
      );
      const svg = await QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 480,
        color: { dark: '#000000', light: '#ffffff' },
      });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      });
      res.end(svg);
      return;
    }
    if (p === '/api/control' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren får styra.', 401);
      const b = await body(req);
      const id = controllerId(req);
      assert(
        typeof id === 'string' && id.length >= 16 && id.length <= 100,
        'Ogiltig ljudkontroll.',
      );
      if (b.claim) {
        if (
          controller &&
          !isController(req) &&
          Date.now() - controller.at < 10000
        )
          assert(
            b.takeover,
            'Ljudet styrs från en annan flik. Ta över för att fortsätta.',
            409,
          );
        if (!isController(req)) {
          store.command('pause');
          void pauseNative();
        }
        controller = { id, at: Date.now() };
      }
      assert(isController(req), 'Den här fliken styr inte ljudet.', 409);
      controller.at = Date.now();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/host/command' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren får styra.', 401);
      const b = await body(req);
      assert(
        !['join', 'recoverTeam', 'answer', 'bet'].includes(b.action),
        'Ogiltigt programledarkommando.',
      );
      if (['start', 'resume'].includes(b.action))
        assert(
          isController(req) && Date.now() - controller.at < 10000,
          'Aktivera ljudkontrollen först.',
          409,
        );
      return await enqueueHost(async () => {
        if (['start', 'resume'].includes(b.action))
          await questionPreview.stop();
        const before = store.active(),
          external = before?.question.audioSource === 'appleMusic';
        if (['start', 'resume'].includes(b.action) && external) {
          assert(
            isController(req) && Date.now() - controller.at < 10000,
            'Aktivera ljudkontrollen igen.',
            409,
          );
          assert(
            before &&
              (b.action === 'start'
                ? ['ready', 'betting'].includes(before.status)
                : before.status === 'paused'),
            'Frågan kan inte startas i det här läget.',
            409,
          );
          const show = store.export().show;
          const resolvedTrack = await resolveAppleTrack(
            before.question.appleMusic,
          );
          nativeTrack = resolvedTrack.persistentId;
          try {
            await music.play({
              persistentId: nativeTrack,
              position:
                before.question.offset +
                (b.action === 'resume' ? before.elapsedMs / 1000 : 0),
              volume: show.talking ? show.talkVolume : show.musicVolume,
            });
            musicFault = '';
          } catch (e) {
            await pauseNative();
            throw new QuizError(e.message);
          }
          // Another tab can claim control while native playback is starting.
          if (!isController(req)) {
            await pauseNative();
            throw new QuizError(
              'Ljudkontrollen har flyttats till en annan flik.',
              409,
            );
          }
        }
        const result = store.command(b.action, b.payload);
        if (
          [
            'pause',
            'close',
            'resetResults',
            'reset',
            'unprepare',
            'loadProject',
          ].includes(b.action) &&
          external
        )
          await pauseNative();
        if (b.action === 'showSettings' && nativeTrack) {
          const show = store.export().show;
          try {
            await music.volume(
              show.talking ? show.talkVolume : show.musicVolume,
            );
            musicFault = '';
          } catch (e) {
            musicFault = e.message;
          }
        }
        if (
          b.action === 'reveal' ||
          b.action === 'reset' ||
          b.action === 'resetResults'
        )
          void store
            .backup()
            .catch((e) => console.error('Backup failed:', e.message));
        return json(res, 200, { ...result, state: state(req, true) });
      });
    }
    if (p === '/api/projects/save' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      const b = await body(req);
      return await enqueueHost(async () => {
        const result = projects.save(store.export(), {
          id: b.copy ? undefined : store.export().projectId,
          name: b.name,
        });
        store.command('projectSaved', result);
        return json(res, 200, { project: result, state: state(req, true) });
      });
    }
    if (p === '/api/projects/load' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      const b = await body(req);
      return await enqueueHost(async () => {
        const project = projects.load(b.id);
        if (!store.export().projectId) {
          const saved = projects.save(store.export());
          store.command('projectSaved', saved);
        }
        store.command('loadProject', project);
        await pauseNative();
        return json(res, 200, { state: state(req, true) });
      });
    }
    if (p === '/api/projects/export' && req.method === 'GET') {
      assert(host(req), 'Endast programledaren.', 401);
      const id = url.searchParams.get('id');
      projects.load(id);
      const folder = projects.directory(id);
      projects.writeSchema(id);
      const zip = join(dataDir, `project-export-${randomUUID()}.zip`);
      try {
        await exec(
          '/usr/bin/zip',
          ['-q', '-r', zip, 'quiz.json', 'quiz-project.schema.json', 'assets'],
          {
            cwd: folder,
            timeout: 120000,
          },
        );
        res.on('close', () => {
          try {
            unlinkSync(zip);
          } catch {}
        });
        return file(req, res, zip, 'quizprojekt.zip');
      } catch (e) {
        if (existsSync(zip)) unlinkSync(zip);
        throw e;
      }
    }
    if (p === '/api/question-preview' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      const b = await body(req);
      return await enqueueHost(async () => {
        try {
          return json(res, 200, await questionPreview.command(b));
        } catch (e) {
          throw new QuizError(e.message);
        }
      });
    }
    if (p === '/api/music' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      const b = await body(req);
      let result;
      try {
        if (b.action === 'status') result = await music.status();
        else if (b.action === 'selection') result = await music.selection();
        else if (b.action === 'search') {
          result =
            b.source === 'library'
              ? await music.search(b.query)
              : /^https?:/i.test(String(b.query).trim())
                ? {
                    tracks: [await musicCatalog.lookup(String(b.query).trim())],
                    limited: false,
                  }
                : await musicCatalog.search(b.query);
        } else if (b.action === 'openCatalog')
          result = await music.openCatalog(b.url);
        else if (b.action === 'prepare' || b.action === 'prepareQuestion')
          result = await enqueueHost(async () => {
            assert(
              !['running', 'paused'].includes(store.active()?.status),
              'Avsluta den pågående frågan innan du lägger till musik.',
              409,
            );
            await questionPreview.stop();
            return b.action === 'prepareQuestion'
              ? musicPreparation.prepareQuestion(store, b)
              : musicPreparation.prepare(b.track);
          });
        else if (b.action === 'resolve')
          result = await resolveAppleTrack(b.track);
        else if (b.action === 'preview')
          result = await enqueueHost(async () => {
            assert(
              !['running', 'paused'].includes(store.active()?.status),
              'Avsluta den pågående frågan innan du provspelar.',
              409,
            );
            await questionPreview.stop();
            const track = await resolveAppleTrack(
              b.track || {
                persistentId: b.persistentId,
                name: 'Provspelning',
                duration: 0,
              },
            );
            await music.play({
              persistentId: track.persistentId,
              position: b.position,
              volume: store.export().show.musicVolume,
              preview: true,
            });
            return { ok: true, track };
          });
        else throw new QuizError('Ogiltig musikkontroll.');
        musicFault = '';
        return json(res, 200, result);
      } catch (e) {
        musicFault = e.message;
        throw new QuizError(e.message);
      }
    }
    if (p === '/api/team/command' && req.method === 'POST') {
      const b = await body(req);
      assert(
        ['join', 'recoverTeam', 'answer', 'bet'].includes(b.action),
        'Ogiltigt lagkommando.',
      );
      if (['join', 'recoverTeam'].includes(b.action)) rateLimit(req);
      return json(
        res,
        200,
        store.command(b.action, b.payload, credential(req)),
      );
    }
    if (p === '/api/history' && req.method === 'GET') {
      assert(host(req), 'Endast programledaren.', 401);
      return json(res, 200, store.history());
    }
    if (p === '/api/export' && req.method === 'GET') {
      assert(host(req), 'Endast programledaren.', 401);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="quiz-resultat-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      // Portable results export intentionally excludes team credentials.
      const s = store.export();
      s.teams = s.teams.map(({ token, recovery, ...t }) => t);
      return json(res, 200, s);
    }
    if (p === '/api/backup' && req.method === 'GET') {
      assert(host(req), 'Endast programledaren.', 401);
      const path = await store.backup();
      return file(req, res, path, 'quiz-backup.sqlite');
    }
    if (p === '/api/media/check' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      assert(
        store.active()?.status !== 'running',
        'Pausa frågan före mediekontrollen.',
        409,
      );
      return json(res, 200, await mediaHealth.check(store.export()));
    }
    if (p === '/api/media/import' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren.', 401);
      return json(res, 200, await importMedia(mediaDir, await body(req)));
    }
    if (p === '/api/upload' && req.method === 'POST') {
      assert(host(req), 'Endast programledaren får lägga till filer.', 401);
      const ext = extname(url.searchParams.get('filename') || '')
        .toLowerCase()
        .replace('.jpeg', '.jpg');
      const kind = url.searchParams.get('kind');
      assert(
        ['audio', 'image', 'video'].includes(kind) &&
          (kind === 'audio'
            ? ['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac']
            : kind === 'video'
              ? ['.mp4', '.webm', '.mov']
              : ['.png', '.jpg', '.webp']
          ).includes(ext),
        'Välj en ljudfil (WAV, MP3, M4A, OGG, AAC, FLAC) bild (PNG, JPG, WebP) eller video (MP4, WebM, MOV).',
      );
      const name = randomUUID() + ext;
      const path = join(mediaDir, name);
      let bytes = 0;
      const limit =
        kind === 'video'
          ? 750 * 1024 * 1024
          : kind === 'audio'
            ? 250 * 1024 * 1024
            : 15 * 1024 * 1024;
      try {
        await pipeline(
          req,
          new Transform({
            transform(chunk, enc, cb) {
              bytes += chunk.length;
              cb(
                bytes > limit ? new QuizError('Filen är för stor.', 413) : null,
                chunk,
              );
            },
          }),
          createWriteStream(path, { flags: 'wx' }),
        );
        assert(bytes > 0, 'Filen är tom.');
        const fd = openSync(path, 'r');
        fsyncSync(fd);
        closeSync(fd);
      } catch (e) {
        if (existsSync(path)) unlinkSync(path);
        throw e;
      }
      return json(res, 200, { url: `/media/${name}`, bytes });
    }
    if (p.startsWith('/media/')) {
      assert(
        /^\/media\/[a-f0-9-]+\.(wav|mp3|m4a|ogg|flac|aac|png|jpg|webp|mp4|webm|mov)$/.test(
          p,
        ),
        'Filen finns inte.',
        404,
      );
      const audio = /\.(wav|mp3|m4a|ogg|flac|aac)$/.test(p);
      if (audio)
        assert(
          host(req),
          'Ljudet spelas bara från programledarens dator.',
          403,
        );
      else if (!host(req)) {
        const r = store.active();
        const visible = r && !['ready', 'betting'].includes(r.status);
        const allowed = visible
          ? [
              r.question.picture,
              r.question.video,
              ...(r.hintVisible ? [r.question.image] : []),
              ...revealedCues(r, store.elapsed(r)).flatMap((c) => [
                c.image,
                c.video,
              ]),
            ]
          : [];
        const branding = store.snapshot().branding;
        assert(
          allowed.includes(p) || [branding.logo, branding.backdrop].includes(p),
          'Mediet visas inte ännu.',
          404,
        );
      }
      const path = join(mediaDir, p.slice(7));
      assert(existsSync(path), 'Filen finns inte.', 404);
      return file(req, res, path);
    }
    if (p.startsWith('/api/')) throw new QuizError('Adressen finns inte.', 404);
    assert(['GET', 'HEAD'].includes(req.method), 'Metoden stöds inte.', 405);
    const decoded = decodeURIComponent(p);
    assert(!decoded.includes('\0'), 'Ogiltig adress.');
    let path = resolve(publicDir, '.' + decoded);
    assert(
      path.startsWith(publicDir + '/') || path === publicDir,
      'Adressen finns inte.',
      404,
    );
    if (existsSync(path) && statSync(path).isDirectory())
      path = join(path, 'index.html');
    if (!existsSync(path) && !extname(path)) {
      const flat = path.replace(/\/$/, '') + '.html';
      path = existsSync(flat) ? flat : join(path, 'index.html');
    }
    assert(
      existsSync(path) && statSync(path).isFile(),
      'Sidan finns inte. Bygg appen med npm run build.',
      404,
    );
    return file(req, res, path);
  } catch (e) {
    if (!(e instanceof QuizError)) {
      console.error('Request failed:', e.message);
      if (
        String(e.code || '').startsWith('SQLITE') ||
        String(e.code || '').startsWith('ERR_SQLITE')
      ) {
        fatal = true;
        controller = null;
        void pauseNative();
      }
    }
    if (!res.headersSent && !res.destroyed)
      json(res, e.status || 500, {
        error:
          e instanceof QuizError
            ? e.message
            : 'Något gick fel. Kontrollera anslutningen och försök igen.',
      });
  }
});
const ticker = setInterval(() => {
  try {
    if (fatal) return;
    void enqueueHost(() => questionPreview.expire()).catch((e) => {
      musicFault = e.message;
    });
    const wasRunning = store.active()?.status === 'running';
    if (
      store.active()?.status === 'running' &&
      (!controller || Date.now() - controller.at > 10000)
    ) {
      store.command('pause', { atCheckpoint: true });
      controller = null;
    } else store.tick();
    if (wasRunning && store.active()?.status !== 'running') void pauseNative();
    if (nativeTrack && store.active()?.status === 'running' && !musicPolling) {
      musicPolling = true;
      void music
        .status()
        .then((s) => {
          const active = store.active();
          if (active?.status !== 'running' || !nativeTrack) return;
          if (s.track?.persistentId !== nativeTrack || s.state === 'paused') {
            store.command('pause', { atCheckpoint: true });
            void pauseNative();
            musicFault = 'Uppspelningen ändrades i Musik. Quizet har pausats.';
          } else if (s.state === 'stopped') {
            store.command('close');
            void pauseNative();
          }
        })
        .catch((e) => {
          musicFault = e.message;
          try {
            if (store.active()?.status === 'running')
              store.command('pause', { atCheckpoint: true });
          } catch {
            fatal = true;
            controller = null;
          }
          void pauseNative();
        })
        .finally(() => {
          musicPolling = false;
        });
    }
  } catch (e) {
    fatal = true;
    controller = null;
    void pauseNative();
    console.error('Persistence failed; stopped accepting changes:', e.message);
  }
}, 1000);
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.at > 60000) attempts.delete(k);
}, 60000).unref();
function openLocalUi(url) {
  const command =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  execFile(command[0], command[1], (error) => {
    if (error)
      console.warn(`Kunde inte öppna webbläsaren automatiskt. Öppna ${url}`);
  });
}

server.listen(port, '0.0.0.0', () => {
  const localUrl = `http://localhost:${server.address().port}/`;
  console.log(`Quiz. Programledare: ${localUrl}`);
  for (const url of urls()) console.log(`Lag: ${url}`);
  console.log(`Svar och poäng sparas i ${dataDir}`);
  if (openBrowser) openLocalUi(localUrl);
  process.send?.({ type: 'ready', port: server.address().port });
});
server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} används redan, så quizet kunde inte starta.`);
    try {
      const { stdout } = await exec('lsof', [
        '-nP',
        `-iTCP:${port}`,
        '-sTCP:LISTEN',
      ]);
      if (stdout.trim())
        console.error(`\nProcessen som lyssnar:\n${stdout.trim()}`);
    } catch {}
    console.error(
      `\nOm det är en gammal quizserver, stoppa den med:\n  kill <PID>\n` +
        `(ersätt <PID> med numret i kolumnen PID ovan).\n\n` +
        `Eller starta quizet på en annan port:\n  PORT=4319 just quiz\n`,
    );
  } else console.error(e.message);
  process.exit(1);
});
function shutdown() {
  clearInterval(ticker);
  void enqueueHost(() => questionPreview.stop());
  void pauseNative();
  try {
    store.command('pause');
    store.close();
  } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
