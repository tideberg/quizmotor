import demo from '../examples/demo/quiz.json' with { type: 'json' };
import { migratedBranding, normalizeBranding } from './branding.mjs';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  answerPoints,
  compareTeams,
  publicResult,
  queueResult,
  queuePendingResults,
  INDIVIDUAL_TEAM_LIMIT,
  TIMES_UP_MS,
} from './scoring.mjs';

import {
  fail,
  text,
  integer,
  normalizeCode,
  recoveryCode,
  normalizeQuestion,
  normalizeShow,
  defaultShow,
  roundLimit,
  pointsAt,
  revealedCues,
} from './model.mjs';
export { QuizError } from './model.mjs';
const token = () => randomBytes(24).toString('hex');
const fresh = () => ({
  version: 1,
  id: randomUUID(),
  title: demo.name,
  branding: structuredClone(demo.branding),
  code: String(Math.floor(100000 + Math.random() * 900000)),
  teams: [],
  rounds: [],
  activeId: null,
  finalQuestionId: null,
  view: 'lobby',
  recovered: false,
  adjustments: [],
  show: normalizeShow(demo.show),
  projectId: null,
  projectSavedAt: null,
  projectDirty: false,
  questions: demo.questions.map((q) =>
    normalizeQuestion(q, { keepExample: true }),
  ),
});

export function createQuizStore(path, now = Date.now) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_sessions (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archives (id TEXT PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const saved = db.prepare('SELECT json FROM state WHERE id=1').get();
  let state = saved ? JSON.parse(saved.json) : fresh();
  if (state.version !== 1)
    throw new Error(
      'Databasen kommer från en annan version. Återställ inte automatiskt.',
    );
  const write = () =>
    db
      .prepare(
        'INSERT INTO state(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
      )
      .run(JSON.stringify(state));
  const event = (type, detail = {}) =>
    db
      .prepare('INSERT INTO events(at,type,detail) VALUES(?,?,?)')
      .run(now(), type, JSON.stringify(detail));
  const active = () => state.rounds.find((r) => r.id === state.activeId);
  const finalComplete = () =>
    state.rounds.some(
      (r) =>
        r.status === 'revealed' &&
        (r.question.id === state.finalQuestionId ||
          // Finals prepared by older versions have no saved final selection.
          (r.id === state.activeId && r.question.kind === 'wager')),
    );
  function prepareQuestion(q) {
    if (finalComplete())
      fail('Finalen är avslutad. Starta en ny omgång för att spela igen.', 409);
    if (state.rounds.some((r) => r.question.id === q.id))
      fail('Den här frågan har redan spelats.');
    if (state.finalQuestionId && state.finalQuestionId !== q.id)
      fail(
        'Finalen står på tur. Välj Fortsätt med frågorna för att ändra.',
        409,
      );
    const round = {
      id: randomUUID(),
      number: state.rounds.length + 1,
      question: structuredClone(q),
      status: q.kind === 'wager' ? 'betting' : 'ready',
      answers: [],
      bets: [],
      elapsedMs: 0,
      checkpointMs: 0,
      startedAt: null,
      hintVisible: false,
      manualCueIds: [],
      limitMs: q.duration * 1000,
      countdownStartMs: null,
      closedAt: null,
    };
    if (q.kind === 'wager') state.finalQuestionId = q.id;
    state.rounds.push(round);
    state.activeId = round.id;
    state.view = 'round';
  }
  const elapsed = (r) =>
    Math.max(
      0,
      Math.min(
        roundLimit(r),
        r.elapsedMs +
          (r.status === 'running' ? Math.max(0, now() - r.startedAt) : 0),
      ),
    );
  const score = (
    teamId,
    publicOnly = false,
    excludeRoundId = null,
    at = now(),
  ) =>
    state.adjustments
      .filter((a) => a.teamId === teamId)
      .reduce((s, a) => s + a.delta, 0) +
    state.rounds
      .filter((r) => r.id !== excludeRoundId)
      .reduce((s, r) => {
        const a = r.answers.find((a) => a.teamId === teamId);
        if (publicOnly && r.status !== 'revealed')
          return s + (r.scoring ? publicResult(r, teamId, at).points : 0);
        return s + answerPoints(r, a);
      }, 0);
  const transaction = (type, detail, fn) => {
    const before = structuredClone(state);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      state.revision = (state.revision || 0) + 1;
      write();
      event(type, detail);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      state = before;
      db.exec('ROLLBACK');
      throw e;
    }
  };
  if (!saved) transaction('created', {}, () => {});
  if (!state.show || state.teams.some((t) => !t.recovery.includes('-')))
    transaction('upgrade_gameshow', {}, () => {
      state.show ||= defaultShow();
      state.projectId ||= null;
      state.projectSavedAt ||= null;
      state.projectDirty ??= false;
      for (const t of state.teams)
        if (!t.recovery.includes('-')) {
          t.legacyRecovery = t.recovery;
          t.recovery = recoveryCode(state.teams.map((t) => t.recovery));
        }
    });
  if (!state.branding)
    transaction('upgrade_branding', {}, () => {
      state.branding = migratedBranding(state.title);
      state.projectDirty = true;
    });
  if (active()?.status === 'running')
    transaction('recovered', {}, () => {
      // Last durable heartbeat is authoritative: downtime must not consume points.
      const r = active();
      r.elapsedMs = r.checkpointMs ?? r.elapsedMs;
      r.startedAt = null;
      r.status = 'paused';
      state.recovered = true;
    });
  let secret = db
    .prepare("SELECT value FROM settings WHERE key='hostSecret'")
    .get()?.value;
  if (!secret) {
    secret = token();
    db.prepare("INSERT INTO settings(key,value) VALUES('hostSecret',?)").run(
      secret,
    );
  }
  const teamFor = (credential) =>
    state.teams.find((t) => t.token === credential) ??
    fail('Anslut laget igen.', 401);
  function beginScoring(r) {
    if (r.scoring) return;
    const standing = state.teams
      .map((t) => ({
        id: t.id,
        name: t.name,
        score: score(t.id, false, r.id),
      }))
      .sort(compareTeams);
    r.scoring = {
      batchTeamIds: standing.slice(INDIVIDUAL_TEAM_LIMIT).map((t) => t.id),
      order: standing.reverse().map((t) => t.id),
      events: [],
      startedAt: state.view === 'leaderboard' ? now() : null,
    };
    queuePendingResults(r, now());
  }
  if (active()?.status === 'closed' && !active().scoring)
    transaction('upgrade_scoring', {}, () => beginScoring(active()));
  function closeRound(r) {
    r.elapsedMs = elapsed(r);
    r.startedAt = null;
    r.status = 'closed';
    r.closedAt = now();
    state.view = 'intermission';
    if (r.question.kind === 'wager')
      for (const b of r.bets)
        if (!r.answers.some((a) => a.teamId === b.teamId)) {
          r.answers.push({
            teamId: b.teamId,
            text: '(Inget svar)',
            points: b.amount,
            elapsedMs: r.elapsedMs,
            submittedAt: now(),
            correct: false,
            automatic: true,
          });
        }
    beginScoring(r);
  }
  function simulate() {
    const r = active();
    if (!state.rehearsal?.enabled || !r) return;
    for (const t of state.teams.filter((team) => team.simulated)) {
      const slot = (t.simulationIndex + r.number - 1) % 5;
      if (r.status === 'betting' && !r.bets.some((b) => b.teamId === t.id)) {
        command(
          'bet',
          {
            roundId: r.id,
            amount: Math.floor(
              Math.max(0, score(t.id)) * [0, 0.25, 0.5, 0.75, 1][slot],
            ),
          },
          t.token,
        );
      }
      if (r.status !== 'running' || r.answers.some((a) => a.teamId === t.id))
        continue;
      // Rotate the unsuccessful fifth; occasionally let it miss the deadline.
      if (slot === 4 && r.number % 3 === 0) continue;
      const fraction = 0.12 + ((t.simulationIndex * 3 + r.number) % 7) * 0.12;
      const due =
        r.countdownStartMs != null
          ? Math.min(
              r.question.duration * 1000 * fraction,
              r.countdownStartMs +
                (roundLimit(r) - r.countdownStartMs) * fraction,
            )
          : roundLimit(r) * fraction;
      if (elapsed(r) < due) continue;
      command(
        'answer',
        {
          roundId: r.id,
          text:
            slot === 4
              ? '(Testlagets felsvar)'
              : r.question.answer.slice(0, 500),
        },
        t.token,
      );
    }
  }
  function tick() {
    const r = active();
    if (!r || r.status !== 'running' || elapsed(r) < roundLimit(r)) simulate();
    if (r?.status !== 'running') return;
    if (elapsed(r) >= roundLimit(r))
      transaction('time_expired', { roundId: r.id }, () => closeRound(r));
    else
      transaction('checkpoint', { roundId: r.id }, () => {
        r.checkpointMs = elapsed(r);
      });
  }
  function command(action, p = {}, credential) {
    // Persist expiration before rejecting a late answer.
    if (
      !(action === 'pause' && p.atCheckpoint) &&
      active()?.status === 'running' &&
      elapsed(active()) >= roundLimit(active())
    )
      tick();
    return transaction(
      action,
      { roundId: state.activeId, teamId: p.teamId },
      () => {
        const r = active();
        if (action === 'rehearsal') {
          if (typeof p.enabled !== 'boolean') fail('Välj start eller stopp.');
          if (!state.teams.some((t) => t.simulated)) {
            if (!p.enabled) return {};
            if (state.rounds.length)
              fail('Starta en ny omgång innan du lägger till testlag.');
            const count = integer(p.count ?? 6, 5, 6, 'Antal testlag');
            if (state.teams.length + count > 100) fail('Rummet är fullt.');
            const names = [
              'Refrängen',
              'Basgången',
              'Diskokulan',
              'Tonträffen',
              'Extranumret',
              'Taktslaget',
            ];
            for (let i = 0; i < count; i++) {
              let name = `Testlag ${i + 1} · ${names[i]}`;
              while (
                state.teams.some(
                  (t) =>
                    t.name.toLocaleLowerCase('sv') ===
                    name.toLocaleLowerCase('sv'),
                )
              )
                name = `Testlag ${i + 1} · ${randomUUID().slice(0, 8)}`;
              state.teams.push({
                id: randomUUID(),
                name,
                token: token(),
                recovery: recoveryCode(state.teams.map((t) => t.recovery)),
                joinedAt: now(),
                simulated: true,
                simulationIndex: i,
              });
            }
          }
          state.rehearsal = { enabled: p.enabled };
          return {};
        }
        if (action === 'join') {
          if (p.code !== state.code)
            fail('Spelkoden stämmer inte. Titta på storbilden.');
          const name = text(p.name, 40, 'Lagnamnet');
          if (
            state.teams.some(
              (t) =>
                t.name.toLocaleLowerCase('sv') === name.toLocaleLowerCase('sv'),
            )
          )
            fail(
              'Lagnamnet används redan. Återanslut med lagets återställningskod eller välj ett annat namn.',
            );
          if (state.teams.length >= 100) fail('Rummet är fullt.');
          const t = {
            id: randomUUID(),
            name,
            token: token(),
            recovery: recoveryCode(state.teams.map((t) => t.recovery)),
            joinedAt: now(),
          };
          state.teams.push(t);
          return { token: t.token, recovery: t.recovery, name: t.name };
        }
        if (action === 'recoverTeam') {
          const t = state.teams.find(
            (t) =>
              normalizeCode(t.recovery) === normalizeCode(p.recovery) ||
              (t.legacyRecovery &&
                normalizeCode(t.legacyRecovery) === normalizeCode(p.recovery)),
          );
          if (!t || p.code !== state.code)
            fail('Spel- eller återställningskoden stämmer inte.', 403);
          return { token: t.token, recovery: t.recovery, name: t.name };
        }
        if (action === 'answer' || action === 'bet') {
          const t = teamFor(credential);
          if (!r || p.roundId !== r.id)
            fail('Frågan har bytts. Uppdatera och försök igen.', 409);
          if (action === 'bet') {
            const existing = r.bets.find((b) => b.teamId === t.id);
            if (existing) return { bet: existing };
            if (r.status !== 'betting') fail('Satsningen är stängd.', 409);
            const amount = integer(
              p.amount,
              0,
              Math.max(0, score(t.id)),
              'Satsningen',
            );
            const b = { teamId: t.id, amount };
            r.bets.push(b);
            return { bet: b };
          }
          const existing = r.answers.find((a) => a.teamId === t.id);
          if (existing)
            return {
              answer: {
                ...existing,
                correct:
                  r.status === 'revealed'
                    ? existing.correct
                    : publicResult(r, t.id, now()).correct,
              },
            }; // Retries must not expose an early judgment.
          if (r.status !== 'running')
            fail('Svar går bara att låsa medan frågan pågår.', 409);
          const answer = text(p.text, 500, 'Svaret');
          const usedMs = elapsed(r);
          const bet = r.bets.find((b) => b.teamId === t.id);
          if (r.question.kind === 'wager' && !bet)
            fail('Ni behöver ha låst en satsning före finalfrågan.', 409);
          const points =
            r.question.kind === 'wager'
              ? bet.amount
              : r.question.kind === 'bonus'
                ? r.question.maxPoints
                : pointsAt(r, usedMs);
          const a = {
            teamId: t.id,
            text: answer,
            points,
            elapsedMs: usedMs,
            submittedAt: now(),
            correct: null,
          };
          r.answers.push(a);
          return { answer: a };
        }
        if (action === 'saveQuestion') {
          const id = p.id || randomUUID();
          if (
            state.finalQuestionId === id ||
            state.rounds.some((r) => r.question.id === id)
          )
            fail(
              'Den här frågan har redan förberetts eller spelats. Skapa en ny fråga för ändringar.',
            );
          const q = normalizeQuestion({ ...p, id });
          state.projectDirty = true;
          const index = state.questions.findIndex((q) => q.id === id);
          if (index >= 0) state.questions[index] = q;
          else {
            if (state.questions.length >= 200) fail('Högst 200 frågor.');
            state.questions.push(q);
          }
          return { question: q };
        }
        if (action === 'deleteQuestion') {
          if (
            state.finalQuestionId === p.id ||
            state.rounds.some((r) => r.question.id === p.id)
          )
            fail('Spelade eller förberedda frågor kan inte tas bort.');
          state.questions = state.questions.filter((q) => q.id !== p.id);
          state.projectDirty = true;
          return {};
        }
        if (action === 'moveQuestion') {
          const i = state.questions.findIndex((q) => q.id === p.id),
            j = i + (p.direction === 'up' ? -1 : 1);
          if (i >= 0 && j >= 0 && j < state.questions.length)
            [state.questions[i], state.questions[j]] = [
              state.questions[j],
              state.questions[i],
            ];
          state.projectDirty = true;
          return {};
        }
        if (action === 'goToFinal') {
          if (finalComplete()) fail('Finalen är redan avslutad.', 409);
          if (r?.question.kind === 'wager') return {};
          const q =
            state.questions.find(
              (q) =>
                q.kind === 'wager' &&
                (!state.finalQuestionId || q.id === state.finalQuestionId) &&
                !state.rounds.some((round) => round.question.id === q.id),
            ) ?? fail('Lägg till en ospelad fråga av typen Final först.');
          state.finalQuestionId = q.id;
          if (r && ['running', 'paused', 'closed'].includes(r.status))
            return {};
          // An unstarted ordinary question has no answers or locked wagers.
          if (r?.status === 'ready')
            state.rounds = state.rounds.filter((round) => round.id !== r.id);
          prepareQuestion(q);
          return {};
        }
        if (action === 'cancelFinal') {
          if (r?.question.kind === 'wager')
            fail(
              'Finalen har redan förberetts. Avbryt förberedelsen först.',
              409,
            );
          state.finalQuestionId = null;
          return {};
        }
        if (action === 'prepare') {
          if (r && r.status !== 'revealed')
            fail('Avsluta, rätta och visa facit på aktuell fråga först.', 409);
          const q =
            state.questions.find((q) => q.id === p.id) ??
            fail('Frågan finns inte.');
          prepareQuestion(q);
          return {};
        }
        if (action === 'unprepare') {
          if (!r || !['ready', 'betting'].includes(r.status) || r.bets.length)
            fail(
              'Förberedelsen kan bara avbrytas innan frågan startat och innan någon satsat.',
            );
          state.rounds = state.rounds.filter((round) => round.id !== r.id);
          if (r.question.id === state.finalQuestionId)
            state.finalQuestionId = null;
          state.activeId = state.rounds.at(-1)?.id ?? null;
          state.view = 'lobby';
          return {};
        }
        if (action === 'start') {
          if (!r || !['ready', 'betting'].includes(r.status))
            fail('Förbered en fråga först.');
          if (r.question.kind === 'wager')
            for (const t of state.teams)
              if (!r.bets.some((b) => b.teamId === t.id))
                r.bets.push({ teamId: t.id, amount: 0 });
          r.status = 'running';
          r.startedAt = now();
          state.view = 'round';
          state.recovered = false;
          return {};
        }
        if (action === 'pause') {
          if (r?.status !== 'running') return {};
          r.elapsedMs = p.atCheckpoint ? r.checkpointMs : elapsed(r);
          r.checkpointMs = r.elapsedMs;
          r.startedAt = null;
          r.status = 'paused';
          return {};
        }
        if (action === 'resume') {
          if (r?.status !== 'paused') fail('Frågan är inte pausad.');
          r.startedAt = now();
          r.status = 'running';
          state.recovered = false;
          return {};
        }
        if (action === 'close') {
          if (!r || !['running', 'paused'].includes(r.status))
            fail('Ingen fråga pågår.');
          closeRound(r);
          return {};
        }
        if (action === 'hint') {
          if (!r || !['running', 'paused'].includes(r.status))
            fail('Starta frågan först.');
          r.hintVisible = !r.hintVisible;
          return {};
        }
        if (action === 'countdown') {
          if (!r || !['running', 'paused'].includes(r.status))
            fail('Starta frågan först.');
          const used = elapsed(r);
          if (roundLimit(r) - used <= 10000) return {};
          r.countdownFromPoints = pointsAt(r, used);
          r.countdownStartMs = used;
          r.limitMs = used + 10000;
          return {};
        }
        if (action === 'nextCue') {
          if (!r || !['running', 'paused'].includes(r.status))
            fail('Starta frågan först.');
          const shown = new Set(revealedCues(r, elapsed(r)).map((c) => c.id));
          const next = (r.question.cues || []).find((c) => !shown.has(c.id));
          if (next) {
            r.manualCueIds ||= [];
            r.manualCueIds.push(next.id);
            r.manualCueTimes ||= {};
            r.manualCueTimes[next.id] = elapsed(r) / 1000;
          }
          return {};
        }
        if (action === 'grade') {
          const target =
            state.rounds.find((r) => r.id === p.roundId) ??
            fail('Frågan finns inte.');
          if (
            !['running', 'paused', 'closed', 'revealed'].includes(target.status)
          )
            fail('Starta frågan före rättning.');
          const a =
            target.answers.find((a) => a.teamId === p.teamId) ??
            fail('Svaret finns inte.');
          if (typeof p.correct !== 'boolean') fail('Välj rätt eller fel.');
          if (a.automatic)
            fail('Ett uteblivet finalsvar räknas alltid som fel.');
          if (a.correct === p.correct) return {}; // Safe retry, no duplicate presentation.
          a.correct = p.correct;
          if (target.status === 'closed') {
            if (target.scoring.events.some((e) => e.teamId === a.teamId))
              queueResult(target, a, now());
            queuePendingResults(target, now());
          }
          return {};
        }
        if (action === 'reveal') {
          if (r?.status !== 'closed') fail('Stäng frågan först.');
          if (r.answers.some((a) => a.correct === null))
            fail('Rätta alla inkomna svar innan facit visas.');
          if (
            (r.scoring?.startedAt === null && r.answers.length > 0) ||
            (r.scoring?.events.at(-1)?.endsAt ?? 0) > now()
          )
            fail('Vänta tills poängen har räknats ihop på storbilden.', 409);
          r.status = 'revealed';
          state.view = 'leaderboard';
          return {};
        }
        if (action === 'leaderboard' || action === 'lobby') {
          if (
            r &&
            r.status !== 'revealed' &&
            !(action === 'leaderboard' && r.status === 'closed')
          )
            fail('Stäng frågan innan du visar ställningen.');
          if (
            action === 'leaderboard' &&
            r?.status === 'closed' &&
            state.view === 'intermission'
          ) {
            if (r.scoring.startedAt === null) {
              r.scoring.startedAt = now();
              queuePendingResults(r, now());
            } else {
              // Preserve an already queued presentation from older saved games.
              const events = r.scoring.events;
              const shift = Math.max(0, now() - (events[0]?.startsAt ?? now()));
              for (const event of events) {
                event.startsAt += shift;
                event.mergesAt += shift;
                event.endsAt += shift;
              }
            }
          }
          state.view = action;
          return {};
        }
        if (action === 'removeTeam') {
          if (p.confirm !== true) fail('Bekräfta att laget ska tas bort.');
          if (!state.teams.some((t) => t.id === p.teamId))
            fail('Laget finns inte.');
          state.teams = state.teams.filter((t) => t.id !== p.teamId);
          state.adjustments = state.adjustments.filter(
            (a) => a.teamId !== p.teamId,
          );
          for (const round of state.rounds) {
            round.answers = round.answers.filter((a) => a.teamId !== p.teamId);
            round.bets = round.bets.filter((b) => b.teamId !== p.teamId);
            if (round.scoring) {
              round.scoring.order = round.scoring.order.filter(
                (id) => id !== p.teamId,
              );
              round.scoring.events = round.scoring.events.filter(
                (e) => e.teamId !== p.teamId,
              );
              round.scoring.batchTeamIds = round.scoring.batchTeamIds?.filter(
                (id) => id !== p.teamId,
              );
              queuePendingResults(round, now());
            }
          }
          return {};
        }
        if (action === 'adjust') {
          if (!state.teams.some((t) => t.id === p.teamId))
            fail('Laget finns inte.');
          const key = text(p.requestId, 100, 'Ändringens id');
          if (state.adjustments.some((a) => a.id === key)) return {};
          state.adjustments.push({
            id: key,
            teamId: p.teamId,
            delta: integer(p.delta, -100000, 100000, 'Justeringen'),
            reason: text(p.reason, 300, 'Anledningen'),
            at: now(),
          });
          return {};
        }
        if (action === 'branding') {
          if (r && !['revealed'].includes(r.status))
            fail('Avsluta frågan innan du ändrar quizets identitet.');
          state.branding = normalizeBranding(p);
          state.projectDirty = true;
          return {};
        }
        if (action === 'rename') {
          state.title = text(p.title, 100, 'Quiznamnet');
          state.projectDirty = true;
          return {};
        }
        if (action === 'showSettings') {
          state.show = normalizeShow({
            ...state.show,
            ...p,
            ...(Object.hasOwn(p, 'bedAudio') && !Object.hasOwn(p, 'bedTracks')
              ? { bedTracks: p.bedAudio ? [p.bedAudio] : [] }
              : {}),
          });
          if (Object.keys(p).some((k) => k !== 'talking'))
            state.projectDirty = true;
          return {};
        }
        if (action === 'projectSaved') {
          if (state.projectId && state.projectId !== p.id)
            db.prepare(
              'INSERT INTO project_sessions(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
            ).run(state.projectId, JSON.stringify(state));
          if (p.name) state.title = text(p.name, 100, 'Quiznamnet');
          state.projectId = p.id;
          state.projectSavedAt = p.savedAt;
          state.projectDirty = false;
          return {};
        }
        if (action === 'loadProject') {
          if (p.id && p.id === state.projectId) return {};
          if (!Array.isArray(p.questions) || p.questions.length > 200)
            fail('Ogiltig frågelista.');
          const questions = p.questions.map((q) =>
            normalizeQuestion(q, { keepExample: true }),
          );
          if (new Set(questions.map((q) => q.id)).size !== questions.length)
            fail('Frågornas id måste vara unika.');
          const show = normalizeShow(p.show || {}),
            title = text(p.title, 100, 'Quiznamnet');
          if (r?.status === 'running') {
            r.elapsedMs = elapsed(r);
            r.checkpointMs = r.elapsedMs;
            r.startedAt = null;
            r.status = 'paused';
          }
          db.prepare(
            'INSERT INTO project_sessions(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
          ).run(state.projectId || state.id, JSON.stringify(state));
          const previous =
            p.id &&
            db
              .prepare('SELECT json FROM project_sessions WHERE id=?')
              .get(p.id);
          const revision = state.revision || 0;
          state = previous
            ? JSON.parse(previous.json)
            : {
                ...fresh(),
                questions,
                title,
                branding: normalizeBranding(
                  p.branding || migratedBranding(title),
                ),
                show: { ...show, talking: false },
                projectId: p.id || null,
                projectSavedAt: p.savedAt || null,
                projectDirty: false,
              };
          if (!state.branding) {
            state.branding = migratedBranding(state.title);
            state.projectDirty = true;
          }
          state.revision = revision;
          const resumed = active();
          if (resumed?.status === 'running') {
            resumed.elapsedMs = resumed.checkpointMs ?? resumed.elapsedMs;
            resumed.startedAt = null;
            resumed.status = 'paused';
          }
          return {};
        }
        if (action === 'resetResults') {
          if (p.confirm !== true)
            fail('Bekräfta att du vill rensa resultatet.');
          db.prepare(
            'INSERT OR REPLACE INTO archives(id,at,json) VALUES(?,?,?)',
          ).run(state.id, now(), JSON.stringify(state));
          state.id = randomUUID();
          state.rounds = [];
          state.activeId = null;
          state.finalQuestionId = null;
          state.adjustments = [];
          state.view = 'lobby';
          state.recovered = false;
          state.show.talking = false;
          return {};
        }
        if (action === 'reset') {
          if (p.confirm !== 'NY OMGÅNG')
            fail('Skriv NY OMGÅNG för att starta om.');
          db.prepare('INSERT INTO archives(id,at,json) VALUES(?,?,?)').run(
            state.id,
            now(),
            JSON.stringify(state),
          );
          state = {
            ...fresh(),
            questions: state.questions,
            title: state.title,
            branding: state.branding,
            show: { ...state.show, talking: false },
            projectId: state.projectId,
            projectSavedAt: state.projectSavedAt,
            projectDirty: state.projectDirty,
          };
          return {};
        }
        fail('Okänt kommando.');
      },
    );
  }
  function snapshot({ host = false, credential } = {}) {
    const snapshotNow = now(),
      r = active(),
      me = state.teams.find((t) => t.token === credential),
      visible = r && !['ready', 'betting'].includes(r.status),
      revealed = r?.status === 'revealed';
    const used = r ? elapsed(r) : 0,
      cues = r && visible ? revealedCues(r, used) : [];
    const view =
      state.view === 'intermission'
        ? snapshotNow - (r?.closedAt || 0) < TIMES_UP_MS
          ? 'timesup'
          : 'round'
        : state.view;
    const publicTeams = state.teams
      .map((t) => {
        const a = r?.answers.find((a) => a.teamId === t.id);
        const result =
          r && ['closed', 'revealed'].includes(r.status)
            ? publicResult(r, t.id, snapshotNow)
            : null;
        return {
          id: t.id,
          name: t.name,
          score: score(t.id, true, null, snapshotNow),
          answered: !!r?.answers.some((a) => a.teamId === t.id),
          betLocked: !!r?.bets.some((b) => b.teamId === t.id),
          ...(result
            ? {
                roundResult: {
                  text: a?.text ?? null,
                  correct: revealed ? (a?.correct ?? null) : result.correct,
                  delta: revealed ? null : result.delta,
                  active: !revealed && result.active,
                },
              }
            : {}),
        };
      })
      .sort(compareTeams);
    return {
      id: state.id,
      revision: state.revision || 0,
      title: state.title,
      branding: state.branding,
      code: state.code,
      view,
      serverNow: snapshotNow,
      recovered: state.recovered,
      host,
      questionCount: state.questions.length,
      playedCount: state.rounds.filter((r) => r.status === 'revealed').length,
      completed:
        finalComplete() ||
        (state.questions.length > 0 &&
          state.questions.every((q) =>
            state.rounds.some(
              (round) =>
                round.question.id === q.id && round.status === 'revealed',
            ),
          )),
      publicTeams,
      teams: host
        ? publicTeams
            .map((t) => ({
              ...t,
              score: score(t.id),
              recovery: state.teams.find((x) => x.id === t.id).recovery,
            }))
            .sort(compareTeams)
        : publicTeams,
      me: me
        ? {
            id: me.id,
            name: me.name,
            recovery: me.recovery,
            score: score(me.id, !host, null, snapshotNow),
            answer: r?.answers.find((a) => a.teamId === me.id)
              ? {
                  ...r.answers.find((a) => a.teamId === me.id),
                  ...(!revealed && !host
                    ? {
                        correct:
                          publicTeams.find((t) => t.id === me.id)?.roundResult
                            ?.correct ?? null,
                      }
                    : {}),
                }
              : null,
            bet: r?.bets.find((b) => b.teamId === me.id) || null,
          }
        : null,
      round: r
        ? {
            id: r.id,
            number: r.number,
            status: r.status,
            elapsedMs: used,
            limitMs: roundLimit(r),
            countdownStartMs: r.countdownStartMs ?? null,
            countdownFromPoints: r.countdownFromPoints ?? null,
            closedAt: r.closedAt || null,
            scorePresentationEndsAt:
              r.status === 'closed'
                ? (r.scoring?.events.at(-1)?.endsAt ?? null)
                : null,
            hintVisible: r.hintVisible,
            visibleCues: cues,
            question: {
              id: r.question.id,
              title: r.question.title,
              kind: r.question.kind,
              duration: r.question.duration,
              maxPoints: r.question.maxPoints,
              ...(visible || host
                ? {
                    prompt: r.question.prompt,
                    picture: r.question.picture || null,
                    video: r.question.video || null,
                    image: r.hintVisible || host ? r.question.image : null,
                    hint: r.hintVisible || host ? r.question.hint : '',
                  }
                : {}),
              ...(revealed ||
              host ||
              (r.status === 'closed' && view !== 'timesup')
                ? {
                    answer: r.question.answer.slice(0, 500),
                    explanation: r.question.explanation,
                  }
                : {}),
              ...(host
                ? {
                    audio: r.question.audio,
                    offset: r.question.offset,
                    audioSource: r.question.audioSource || 'local',
                    appleMusic: r.question.appleMusic || null,
                    cues: r.question.cues || [],
                  }
                : {}),
            },
            ...(host
              ? {
                  answers: r.answers,
                  bets: r.bets,
                  gradingOrder: r.scoring?.order,
                }
              : {}),
          }
        : null,
      ...(host
        ? {
            rehearsal: {
              enabled: !!state.rehearsal?.enabled,
              count: state.teams.filter((t) => t.simulated).length,
            },
            questions: state.questions,
            finalQuestionId: state.finalQuestionId || null,
            rounds: state.rounds.map((round) => ({
              ...round,
              gradingOrder: round.scoring?.order,
            })),
            adjustments: state.adjustments,
            show: state.show,
            projectId: state.projectId || null,
            projectSavedAt: state.projectSavedAt || null,
            projectDirty: !!state.projectDirty,
          }
        : {}),
    };
  }
  return {
    command,
    snapshot,
    tick,
    active,
    elapsed,
    secret,
    teamFor,
    backup: async () => {
      const dest = `${dirname(path)}/backups`;
      mkdirSync(dest, { recursive: true });
      const file = `${dest}/quiz-${now()}-${randomUUID().slice(0, 8)}.sqlite`;
      await backup(db, file);
      return file;
    },
    export: () => structuredClone(state),
    history: () =>
      db
        .prepare(
          "SELECT at,type,detail FROM events WHERE type <> 'checkpoint' ORDER BY id DESC LIMIT 200",
        )
        .all(),
    close: () => db.close(),
  };
}
