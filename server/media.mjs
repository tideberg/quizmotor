import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { createWriteStream, lstatSync, unlinkSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fail } from './model.mjs';
import { mapAssets } from './projects.mjs';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
])
  blocked.addSubnet(network, prefix);
export function publicAddress(address) {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  // IPv6 global unicast only. Exclude transition ranges that can encode IPv4.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^200[12]:/i.test(address)
  );
}
const extensions = {
  image: ['.png', '.jpg', '.webp'],
  audio: ['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac'],
  video: ['.mp4', '.webm', '.mov'],
};
async function download(input, signal, redirects = 0) {
  let url;
  try {
    url = new URL(input);
  } catch {
    fail('Ange en komplett HTTPS-länk till en fil.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    fail('Använd en HTTPS-länk utan inloggning eller egen port.');
  if (/(^|\.)music\.apple\.com$/i.test(url.hostname))
    fail('Apple Music ska kopplas som ljudkälla, inte hämtas som fil.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    fail('Länken måste gå till en publik filserver.');
  const target = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [target]);
          else callback(null, target.address, target.family);
        },
        headers: { 'User-Agent': 'Quiz-project-media-import/1.0' },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.resume();
    if (redirects >= 3 || !response.headers.location)
      fail('För många omdirigeringar i medielänken.');
    return download(
      new URL(response.headers.location, url).href,
      signal,
      redirects + 1,
    );
  }
  if (response.statusCode !== 200) {
    response.resume();
    fail(`Filen kunde inte hämtas (HTTP ${response.statusCode}).`);
  }
  return { response, url };
}
export async function importMedia(mediaDir, { url, kind }, open = download) {
  if (!extensions[kind]) fail('Välj bild, ljud eller video.');
  const { response, url: finalUrl } = await open(
    url,
    AbortSignal.timeout(120000),
  );
  const ext = extname(finalUrl.pathname).toLowerCase().replace('.jpeg', '.jpg');
  const mime = String(response.headers['content-type'] || '').split(';')[0];
  if (
    !extensions[kind].includes(ext) ||
    (!mime.startsWith(kind + '/') && mime !== 'application/octet-stream')
  ) {
    response.resume();
    fail(
      'Länken måste gå direkt till en bild-, ljud- eller videofil i ett format som stöds.',
    );
  }
  const limit =
    (kind === 'image' ? 15 : kind === 'audio' ? 250 : 750) * 1024 * 1024;
  if (Number(response.headers['content-length']) > limit) {
    response.destroy();
    fail('Filen är för stor.');
  }
  const name = randomUUID() + ext,
    path = join(mediaDir, name);
  let bytes = 0;
  try {
    await pipeline(
      response,
      new Transform({
        transform(chunk, _enc, cb) {
          bytes += chunk.length;
          cb(bytes > limit ? new Error('Filen är för stor.') : null, chunk);
        },
      }),
      createWriteStream(path, { flags: 'wx' }),
    );
    if (!bytes) fail('Filen är tom.');
    return { url: '/media/' + name, bytes };
  } catch (error) {
    try {
      unlinkSync(path);
    } catch {}
    throw error;
  }
}
export function checkLocalMedia(state, mediaDir) {
  const refs = new Set();
  mapAssets(state, (url) => {
    refs.add(url);
    return url;
  });
  const issues = [];
  for (const url of refs) {
    try {
      if (!/^\/media\/[a-f0-9-]+\.[a-z0-9]+$/.test(url)) throw new Error();
      const stat = lstatSync(join(mediaDir, url.slice(7)));
      if (!stat.isFile() || !stat.size) throw new Error();
    } catch {
      issues.push(`Saknad eller tom fil: ${url}`);
    }
  }
  return { checkedAt: Date.now(), localCount: refs.size, issues };
}
export function createMediaHealth(mediaDir, music, now = Date.now) {
  let fingerprint = '',
    report = {
      checkedAt: 0,
      localCount: 0,
      issues: [],
      checking: false,
      music: { checkedAt: null, issues: [], checked: 0 },
    },
    pending = null;
  function refresh(state, force = false) {
    const refs = new Set();
    mapAssets(state, (url) => {
      refs.add(url);
      return url;
    });
    const signature = JSON.stringify({
      refs: [...refs],
      tracks: state.questions
        .filter((q) => q.audioSource === 'appleMusic')
        .map((q) => ({
          title: q.title,
          track: q.appleMusic,
          offset: q.offset,
        })),
    });
    if (!force && signature === fingerprint && now() - report.checkedAt < 60000)
      return report;
    report = {
      ...report,
      ...checkLocalMedia(state, mediaDir),
      checkedAt: now(),
    };
    const changed = signature !== fingerprint;
    fingerprint = signature;
    if (changed) report.music = { checkedAt: null, issues: [], checked: 0 };
    if (
      pending ||
      state.rounds?.some(
        (r) => r.id === state.activeId && r.status === 'running',
      )
    )
      return report;
    if (
      !force &&
      !changed &&
      report.music.checkedAt &&
      now() - report.music.checkedAt < 15 * 60000
    )
      return report;
    const tracks = state.questions.filter(
      (q) => q.audioSource === 'appleMusic' && q.appleMusic,
    );
    const ids = [
      ...new Set(tracks.map((q) => q.appleMusic.persistentId).filter(Boolean)),
    ];
    report.music = { checkedAt: now(), issues: [], checked: 0 };
    if (!tracks.length) return report;
    const issues = tracks
      .filter((q) => !q.appleMusic.persistentId)
      .map((q) => `${q.title}: koppla låten till Musik-biblioteket.`);
    if (!ids.length) {
      report.music.issues = issues;
      return report;
    }
    report.checking = true;
    pending = music
      .check(ids)
      .then((result) => {
        if (fingerprint !== signature) return;
        for (const q of tracks.filter((q) => q.appleMusic.persistentId)) {
          const found = result.tracks.find(
            (t) => t.persistentId === q.appleMusic.persistentId,
          );
          if (!found)
            issues.push(
              `${q.title}: låten saknas i Musik-biblioteket på den här datorn.`,
            );
          else if (
            found.name !== q.appleMusic.name ||
            found.artist !== q.appleMusic.artist ||
            Math.abs(found.duration - q.appleMusic.duration) > 2
          )
            issues.push(
              `${q.title}: bibliotekslåten stämmer inte med projektets sparade titel, artist eller längd. Välj rätt version igen.`,
            );
          else if (q.offset >= found.duration)
            issues.push(`${q.title}: startpunkten ligger efter låtens slut.`);
        }
        report.music = {
          checkedAt: now(),
          issues,
          checked: result.tracks.length,
        };
      })
      .catch((error) => {
        if (fingerprint === signature)
          report.music = {
            checkedAt: now(),
            checked: 0,
            issues: [...issues, error.message],
          };
      })
      .finally(() => {
        pending = null;
        report.checking = false;
        if (fingerprint !== signature) fingerprint = '';
      });
    return report;
  }
  return {
    refresh,
    async check(state) {
      refresh(state, true);
      await pending;
      return report;
    },
  };
}
