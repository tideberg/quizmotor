import { randomInt, randomUUID } from 'node:crypto';

export class QuizError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const fail = (message, status) => {
  throw new QuizError(message, status);
};
export const text = (v, max, label) =>
  typeof v === 'string' && v.trim().length && v.trim().length <= max
    ? v.trim()
    : fail(`${label} måste innehålla 1–${max} tecken.`);
export const optionalText = (v, max, label) =>
  v == null
    ? ''
    : typeof v === 'string' && v.length <= max
      ? v.trim()
      : fail(`${label} får vara högst ${max} tecken.`);
export const integer = (v, min, max, label) =>
  Number.isInteger(v) && v >= min && v <= max
    ? v
    : fail(`${label} måste vara ett heltal mellan ${min} och ${max}.`);
const adjective =
  'varm kall glad sur ful fin stor liten vild lugn snabb seg mjuk stark svag frisk pigg trind rak rund bred smal djup grund ljus matt blank klar ren torr blid busig modig klok snall stolt lat flink tapper vaken yster'.split(
    ' ',
  );
const noun =
  'dans jord kalas katt hund fisk haj val ko mus ost soppa kaka bulle glass saft deg bro sten grus berg dal skog gren blad blomma sol moln regn vind sno boll hatt sko rock bok penna stol bord kopp fat båt'
    .replace('båt', 'bat')
    .split(' ');
export function recoveryCode(used = []) {
  const unavailable = new Set(used.map(normalizeCode));
  const capacity = adjective.length * noun.length;
  const start = randomInt(capacity);
  for (let i = 0; i < capacity; i++) {
    const n = (start + i) % capacity;
    const code = `${adjective[Math.floor(n / noun.length)]}-${noun[n % noun.length]}`;
    if (!unavailable.has(normalizeCode(code))) return code;
  }
  fail('Alla lagkoder är upptagna.');
}
export function normalizeCode(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
const extensions = {
  audio: 'wav|mp3|m4a|ogg|flac|aac',
  image: 'png|jpg|webp',
  video: 'mp4|webm|mov',
};
export function asset(v, kind) {
  return v == null || v === ''
    ? null
    : typeof v === 'string' &&
        new RegExp(`^/media/[a-f0-9-]+\\.(${extensions[kind]})$`).test(v)
      ? v
      : fail(`Ogiltig ${kind}-fil.`);
}
export function normalizeQuestion(p, { keepExample = false } = {}) {
  if (!['music', 'bonus', 'wager'].includes(p.kind)) fail('Ogiltig frågetyp.');
  const duration = integer(p.duration, 10, 600, 'Tiden');
  const cues = p.cues ?? [];
  if (!Array.isArray(cues) || cues.length > 30)
    fail('Högst 30 ledtrådar per fråga.');
  const normalized = cues
    .map((c) => {
      if (!c || typeof c !== 'object') fail('Ogiltig ledtråd.');
      const cue = {
        id:
          typeof c.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(c.id)
            ? c.id
            : randomUUID(),
        at: integer(c.at, 0, duration - 1, 'Ledtrådens tid'),
        text: optionalText(c.text, 1000, 'Ledtråden'),
        image: asset(c.image, 'image'),
        video: asset(c.video, 'video'),
      };
      if (!cue.text && !cue.image && !cue.video)
        fail('En ledtråd behöver text, bild eller video.');
      return cue;
    })
    .sort((a, b) => a.at - b.at);
  if (new Set(normalized.map((c) => c.id)).size !== normalized.length)
    fail('Ledtrådarnas id måste vara unika.');
  let appleMusic = null;
  if (p.audioSource === 'appleMusic') {
    appleMusic = normalizeAppleTrack(p.appleMusic);
  }
  return {
    id: p.id || randomUUID(),
    title: text(p.title, 100, 'Rubriken'),
    prompt: optionalText(p.prompt, 1000, 'Frågan'),
    answer: text(p.answer, 1000, 'Facit'),
    explanation: optionalText(p.explanation, 2000, 'Förklaringen'),
    hint: optionalText(p.hint, 1000, 'Ledtråden'),
    kind: p.kind,
    duration,
    maxPoints: integer(p.maxPoints, 1, 10000, 'Poängen'),
    offset: integer(p.offset || 0, 0, 7200, 'Startpunkten'),
    audio: asset(p.audio, 'audio'),
    image: asset(p.image, 'image'),
    picture: asset(p.picture, 'image'),
    video: asset(p.video, 'video'),
    audioSource: appleMusic ? 'appleMusic' : 'local',
    appleMusic,
    cues: normalized,
    example: keepExample && !!p.example,
  };
}
export const defaultShow = () => ({
  musicVolume: 80,
  talkVolume: 22,
  talking: false,
  bedVolume: 30,
  effectVolume: 65,
  bedAudio: null,
  bedTracks: [],
  closingAudio: null,
  bedEnabled: true,
});
export function normalizeShow(p) {
  const d = { ...defaultShow(), ...p };
  const rawTracks = p?.bedTracks ?? (d.bedAudio ? [d.bedAudio] : []);
  if (!Array.isArray(rawTracks) || rawTracks.length > 30)
    fail('Välj högst 30 bakgrundsspår.');
  const bedTracks = [
    ...new Set(
      rawTracks.map((url) => {
        if (typeof url !== 'string' || !url) fail('Ogiltigt bakgrundsspår.');
        return asset(url, 'audio');
      }),
    ),
  ];
  return {
    musicVolume: integer(d.musicVolume, 0, 100, 'Musiknivån'),
    talkVolume: integer(d.talkVolume, 0, 100, 'Pratnivån'),
    talking: !!d.talking,
    bedVolume: integer(d.bedVolume, 0, 100, 'Bakgrundsnivån'),
    effectVolume: integer(d.effectVolume, 0, 100, 'Effektnivån'),
    bedAudio: bedTracks[0] || null,
    bedTracks,
    closingAudio: asset(d.closingAudio, 'audio'),
    bedEnabled: !!d.bedEnabled,
  };
}
export function roundLimit(r) {
  return r.limitMs ?? r.question.duration * 1000;
}
export function pointsAt(r, elapsed) {
  if (r.question.kind === 'bonus') return r.question.maxPoints;
  if (r.countdownStartMs != null)
    return Math.max(
      0,
      Math.ceil(
        (r.countdownFromPoints * (roundLimit(r) - elapsed)) /
          (roundLimit(r) - r.countdownStartMs),
      ),
    );
  return Math.max(
    0,
    Math.ceil(
      r.question.maxPoints * (1 - elapsed / (r.question.duration * 1000)),
    ),
  );
}
export function revealedCues(r, elapsed) {
  return (r.question.cues || [])
    .filter(
      (c) => c.at * 1000 <= elapsed || (r.manualCueIds || []).includes(c.id),
    )
    .map((c) => ({
      ...c,
      shownAt: Math.min(c.at, r.manualCueTimes?.[c.id] ?? c.at),
    }));
}

export function normalizeAppleTrack(track) {
  const hasLibraryId =
    track &&
    typeof track.persistentId === 'string' &&
    /^[A-Fa-f0-9]{16}$/.test(track.persistentId);
  const hasCatalog =
    track &&
    typeof track.catalogId === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(track.catalogId) &&
    typeof track.url === 'string' &&
    new RegExp(
      '^https://music\\.apple\\.com/[a-z]{2}/song/' + track.catalogId + '$',
    ).test(track.url);
  if (
    !track ||
    (!hasLibraryId && !hasCatalog) ||
    (track.persistentId && !hasLibraryId)
  )
    fail('Välj en låt från sökningen eller Musik-biblioteket.');
  return {
    persistentId: hasLibraryId ? track.persistentId.toUpperCase() : '',
    ...(hasCatalog ? { catalogId: track.catalogId, url: track.url } : {}),
    ...(track.album
      ? { album: optionalText(track.album, 300, 'Albumet') }
      : {}),
    name: text(track.name, 300, 'Låtnamnet'),
    artist: optionalText(track.artist, 300, 'Artisten'),
    duration:
      typeof track.duration === 'number' &&
      Number.isFinite(track.duration) &&
      track.duration > 0
        ? track.duration
        : 0,
  };
}
