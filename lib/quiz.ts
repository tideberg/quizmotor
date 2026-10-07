export type Branding = {
  brandName: string;
  subtitle: string;
  welcomeTitle: string;
  welcomeText: string;
  joinTitle: string;
  joinText: string;
  teamPlaceholder: string;
  hostEyebrow: string;
  hostTitle: string;
  questionsText: string;
  readyTitle: string;
  leaderboardTitle: string;
  finalTitle: string;
  intermissionText: string;
  closingText: string;
  footer: string;
  teamFooter: string;
  timesUpLabel: string;
  timesUpTitle: string;
  logo: string | null;
  backdrop: string | null;
  theme: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
    board: string;
    alert: string;
    symbol: 'audio' | 'leaf' | 'snowflake' | 'compass' | 'star';
    typography: 'sans' | 'serif' | 'mono';
    pattern: 'diagonal' | 'dots' | 'stars' | 'grid' | 'none';
  };
};
export type Cue = {
  shownAt?: number;
  id: string;
  at: number;
  text: string;
  image: string | null;
  video: string | null;
};
export type AppleTrack = {
  persistentId: string;
  catalogId?: string;
  url?: string;
  album?: string;
  name: string;
  artist: string;
  duration: number;
};
export type ShowSettings = {
  musicVolume: number;
  talkVolume: number;
  talking: boolean;
  bedVolume: number;
  effectVolume: number;
  bedAudio: string | null;
  bedTracks: string[];
  closingAudio: string | null;
  bedEnabled: boolean;
};
export type Project = {
  id: string;
  name: string;
  savedAt: number;
  questionCount: number;
};
export type Question = {
  id: string;
  title: string;
  prompt: string;
  answer: string;
  explanation: string;
  hint: string;
  kind: 'music' | 'bonus' | 'wager';
  duration: number;
  maxPoints: number;
  offset: number;
  audio: string | null;
  image: string | null;
  example?: boolean;
  picture?: string | null;
  video?: string | null;
  audioSource?: 'local' | 'appleMusic';
  appleMusic?: AppleTrack | null;
  cues?: Cue[];
};
export type Answer = {
  teamId: string;
  text: string;
  points: number;
  elapsedMs: number;
  submittedAt: number;
  correct: boolean | null;
  automatic?: boolean;
};
export type Round = {
  id: string;
  number: number;
  status: 'ready' | 'betting' | 'running' | 'paused' | 'closed' | 'revealed';
  question: Question;
  elapsedMs: number;
  hintVisible: boolean;
  limitMs?: number;
  countdownStartMs?: number | null;
  countdownFromPoints?: number | null;
  closedAt?: number | null;
  scorePresentationEndsAt?: number | null;
  gradingOrder?: string[];
  visibleCues?: Cue[];
  answers?: Answer[];
  bets?: { teamId: string; amount: number }[];
};
export type Team = {
  id: string;
  name: string;
  score: number;
  answered: boolean;
  betLocked: boolean;
  recovery?: string;
  roundResult?: {
    text: string | null;
    correct: boolean | null;
    delta: number | null;
    active: boolean;
  };
};
export type QuizState = {
  rehearsal?: { enabled: boolean; count: number };
  id: string;
  revision: number;
  title: string;
  branding: Branding;
  mediaHealth?: MediaHealth;
  code: string;
  view: string;
  serverNow: number;
  host: boolean;
  publicTeams?: Team[];
  show: ShowSettings;
  projects?: Project[];
  projectId?: string | null;
  projectSavedAt?: number | null;
  projectDirty?: boolean;
  musicIntegration?: { available: boolean; fault: string };
  recovered: boolean;
  questionCount: number;
  playedCount: number;
  completed: boolean;
  finalQuestionId?: string | null;
  teams: Team[];
  round: Round | null;
  me: {
    id: string;
    name: string;
    score: number;
    recovery: string;
    answer: Answer | null;
    bet: { amount: number } | null;
  } | null;
  questions?: Question[];
  rounds?: Round[];
  adjustments?: {
    id: string;
    teamId: string;
    delta: number;
    reason: string;
    at: number;
  }[];
  joinUrls?: string[];
  connection?: {
    ssid: string;
    joinUrl: string | null;
    joinQr: string | null;
    wifiQr: string | null;
    settings?: ConnectionSettings;
    detection?: { ssid: string; fault: string; checking: boolean } | null;
    preferredUnavailable?: boolean;
  };
  controller?: boolean;
  controllerBusy?: boolean;
};
export type ConnectionSettings = {
  ssid: string;
  automatic: boolean;
  security: 'manual' | 'open' | 'wpa';
  password: string;
  preferredUrl: string;
};
export const kindLabel = { music: 'Tidsfråga', bonus: 'Bonus', wager: 'Final' };
export const statusLabel = {
  ready: 'Redo att spela',
  betting: 'Lås era satsningar',
  running: 'Nu spelar vi',
  paused: 'Paus',
  closed: 'Svaren är låsta',
  revealed: 'Dags för facit',
};
export const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
export const remember = (key: string, value?: string) => {
  try {
    const legacyKey = key.replace(/^quiz-/, 'perfekt-');
    if (value === undefined) {
      const stored = localStorage.getItem(key);
      if (stored !== null) return stored;
      const legacy = localStorage.getItem(legacyKey) || '';
      if (legacy) localStorage.setItem(key, legacy);
      return legacy;
    }
    localStorage.setItem(key, value);
    localStorage.removeItem(legacyKey);
  } catch {}
  return '';
};
export type CommandResult = {
  token?: string;
  state?: QuizState;
  question?: Question;
  answer?: Answer;
  bet?: { amount: number };
  recovery?: string;
  name?: string;
};
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof Blob) &&
    !headers.has('Content-Type')
  )
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(8000),
    headers,
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(data.error || 'Anslutningen bröts. Försök igen.');
  return data as T;
}
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
};

export const remainingTime = (r: Round, elapsed: number) =>
  Math.max(0, (r.limitMs ?? r.question.duration * 1000) - elapsed);
export const questionPoints = (r: Round, elapsed: number) =>
  r.question.kind === 'bonus'
    ? r.question.maxPoints
    : Math.max(
        0,
        Math.ceil(
          r.countdownStartMs != null
            ? ((r.countdownFromPoints ?? 0) * remainingTime(r, elapsed)) /
                ((r.limitMs ?? 0) - r.countdownStartMs)
            : r.question.maxPoints *
                (1 - elapsed / (r.question.duration * 1000)),
        ),
      );

export type MediaHealth = {
  checkedAt: number;
  checking: boolean;
  localCount: number;
  issues: string[];
  music: { checkedAt: number | null; issues: string[]; checked: number };
};
