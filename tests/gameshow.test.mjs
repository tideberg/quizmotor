import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createQuizStore } from '../server/engine.mjs';
import {
  recoveryCode,
  normalizeCode,
  normalizeQuestion,
  normalizeShow,
} from '../server/model.mjs';
import { createProjects } from '../server/projects.mjs';
import { createMusicBridge } from '../server/music.mjs';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-v2-'));
  let now = 1000000,
    s = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
  t.after(() => {
    try {
      s.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    get s() {
      return s;
    },
    advance: (ms) => {
      now += ms;
    },
    restart() {
      s.close();
      s = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
    },
  };
}
const base = (s, patch = {}) => ({
  ...s.snapshot({ host: true }).questions[0],
  ...patch,
});
const prepare = (s) => {
  s.command('prepare', { id: s.snapshot({ host: true }).questions[0].id });
  s.command('start');
};
const team = (s) =>
  s.command('join', { name: 'Laget', code: s.snapshot().code });

test('spoken recovery codes are unique, simple and tolerate casing, spaces and accents', () => {
  const codes = [];
  for (let i = 0; i < 1000; i++) codes.push(recoveryCode(codes));
  assert.equal(new Set(codes).size, 1000);
  assert.ok(codes.every((c) => /^[a-z]+-[a-z]+$/.test(c)));
  assert.equal(normalizeCode(' VARM - JÖRD '), normalizeCode('varm-jord'));
});
test('legacy team codes migrate while both old and new codes work after restart', (t) => {
  const f = fixture(t),
    s = f.s,
    ticket = team(s);
  s.close();
  const db = new DatabaseSync(join(f.dir, 'quiz.sqlite'));
  const data = JSON.parse(
    db.prepare('SELECT json FROM state WHERE id=1').get().json,
  );
  data.teams[0].recovery = 'ABCDEF1234';
  delete data.show;
  db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(data));
  db.close();
  const migrated = createQuizStore(join(f.dir, 'quiz.sqlite'));
  try {
    const state = migrated.snapshot({ host: true });
    assert.match(state.teams[0].recovery, /^[a-z]+-[a-z]+$/);
    assert.equal(
      migrated.command('recoverTeam', {
        code: state.code,
        recovery: 'abcdef1234',
      }).token,
      ticket.token,
    );
    assert.equal(
      migrated.command('recoverTeam', {
        code: state.code,
        recovery: state.teams[0].recovery.replace('-', ' '),
      }).token,
      ticket.token,
    );
  } finally {
    migrated.close();
  }
});
test('timeline hides future clue content, freezes in pause, persists manual and timed progression', (t) => {
  const f = fixture(t),
    s = f.s;
  s.command(
    'saveQuestion',
    base(s, {
      prompt: '',
      cues: [
        { id: 'one', at: 20, text: 'Early clue', image: null, video: null },
        {
          id: 'two',
          at: 40,
          text: 'Secret clue',
          image: '/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png',
          video: null,
        },
      ],
    }),
  );
  prepare(s);
  assert.ok(!JSON.stringify(s.snapshot()).includes('Early clue'));
  assert.ok(!JSON.stringify(s.snapshot()).includes('Secret clue'));
  f.advance(20000);
  assert.equal(s.snapshot().round.visibleCues[0].text, 'Early clue');
  s.command('pause');
  f.advance(30000);
  assert.equal(s.snapshot().round.visibleCues.length, 1);
  s.command('nextCue');
  assert.equal(s.snapshot().round.visibleCues.length, 2);
  assert.equal(s.snapshot().round.visibleCues[1].shownAt, 20);
  f.restart();
  assert.equal(f.s.snapshot().round.visibleCues.length, 2);
  assert.equal(f.s.snapshot().round.status, 'paused');
  assert.equal(f.s.snapshot().round.elapsedMs, 20000);
});
test('last ten seconds shorten deadline without seeking, rescale only remaining music points and cannot be extended', (t) => {
  const f = fixture(t),
    s = f.s,
    ticket = team(s);
  prepare(s);
  f.advance(30000);
  s.command('countdown');
  const r = s.snapshot().round;
  assert.equal(r.elapsedMs, 30000);
  assert.equal(r.limitMs, 40000);
  assert.equal(r.countdownFromPoints, 75);
  f.advance(5000);
  s.command('pause');
  f.advance(50000);
  s.command('countdown');
  assert.equal(s.snapshot().round.limitMs, 40000);
  s.command('resume');
  const a = s.command(
    'answer',
    { roundId: r.id, text: 'Exempelsvar' },
    ticket.token,
  ).answer;
  assert.equal(a.points, 38);
  f.advance(5000);
  s.tick();
  assert.equal(s.snapshot().view, 'timesup');
  assert.equal(s.snapshot().round.status, 'closed');
  f.advance(3201);
  assert.equal(s.snapshot().view, 'round');
  assert.equal(s.snapshot().round.question.answer, s.active().question.answer);
  s.command('leaderboard');
  assert.equal(s.snapshot().view, 'leaderboard');
  assert.equal(s.snapshot().teams[0].score, 0);
});
test('forced countdown survives crash and bonus keeps its fixed value', (t) => {
  const f = fixture(t);
  const ticket = team(f.s);
  f.s.command('saveQuestion', base(f.s, { kind: 'bonus', maxPoints: 150 }));
  prepare(f.s);
  f.advance(10000);
  f.s.command('countdown');
  f.advance(3000);
  f.s.tick();
  f.restart();
  assert.equal(f.s.snapshot().round.limitMs, 20000);
  assert.equal(f.s.snapshot().round.elapsedMs, 13000);
  f.s.command('resume');
  assert.equal(
    f.s.command(
      'answer',
      { roundId: f.s.active().id, text: 'Exempelsvar' },
      ticket.token,
    ).answer.points,
    150,
  );
});
test('portable project copies all media, stores no teams/tokens/results and opens a fresh event', (t) => {
  const f = fixture(t),
    s = f.s,
    projects = createProjects(f.dir);
  mkdirSync(join(f.dir, 'media'), { recursive: true });
  const media = {
    audio: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.wav',
    bed: 'dddddddd-dddd-dddd-dddd-dddddddddddd.wav',
    image: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png',
    video: 'cccccccc-cccc-cccc-cccc-cccccccccccc.mp4',
  };
  for (const [kind, name] of Object.entries(media))
    writeFileSync(join(f.dir, 'media', name), kind + '-bytes');
  s.command(
    'saveQuestion',
    base(s, {
      prompt: '',
      audio: '/media/' + media.audio,
      picture: '/media/' + media.image,
      video: '/media/' + media.video,
      cues: [
        {
          id: 'cue',
          at: 20,
          text: 'Hej quizlaget',
          image: '/media/' + media.image,
          video: '/media/' + media.video,
        },
      ],
    }),
  );
  s.command('showSettings', {
    bedTracks: ['/media/' + media.audio, '/media/' + media.bed],
    closingAudio: '/media/' + media.audio,
    musicVolume: 76,
    talkVolume: 19,
  });
  const saved = projects.save(s.export(), { name: 'Fredagsquiz' });
  s.command('projectSaved', saved);
  const folder = projects.directory(saved.id),
    portable = JSON.parse(readFileSync(join(folder, 'quiz.json'), 'utf8'));
  assert.deepEqual(portable.show.bedTracks, [
    'assets/' + media.audio,
    'assets/' + media.bed,
  ]);
  assert.deepEqual(projects.load(saved.id).show.bedTracks, [
    '/media/' + media.audio,
    '/media/' + media.bed,
  ]);
  assert.equal(portable.$schema, 'quiz-project.schema.json');
  assert.ok(existsSync(join(folder, 'quiz-project.schema.json')));
  assert.equal(portable.questions[0].audio, 'assets/' + media.audio);
  assert.equal(portable.questions[0].cues[0].video, 'assets/' + media.video);
  assert.equal(portable.questions[0].picture, 'assets/' + media.image);
  assert.equal(portable.teams, undefined);
  assert.equal(portable.rounds, undefined);
  assert.equal(portable.code, undefined);
  assert.equal(projects.list().length, 1);
  const ticket = team(s);
  s.command('adjust', {
    teamId: s.snapshot().teams[0].id,
    delta: 50,
    reason: 'Test',
    requestId: 'adjust',
  });
  s.command('loadProject', projects.load(saved.id));
  assert.equal(s.snapshot().teams.length, 1);
  assert.equal(s.snapshot().teams[0].score, 50);
  assert.equal(s.snapshot({ credential: ticket.token }).me.name, ticket.name);
  rmSync(join(f.dir, 'media', media.audio));
  projects.load(saved.id);
  assert.equal(
    readFileSync(join(f.dir, 'media', media.audio), 'utf8'),
    'audio-bytes',
  );
  s.command('saveQuestion', base(s, { title: 'Changed' }));
  assert.equal(s.snapshot({ host: true }).projectDirty, true);
  projects.save(s.export(), { id: saved.id, name: 'Updated' });
  assert.ok(existsSync(join(folder, 'history')));
  assert.equal(projects.list()[0].name, 'Updated');
});
test('malformed projects and media paths cannot overwrite the active event', (t) => {
  const f = fixture(t),
    projects = createProjects(f.dir),
    saved = projects.save(f.s.export());
  const path = join(projects.directory(saved.id), 'quiz.json'),
    json = JSON.parse(readFileSync(path, 'utf8'));
  json.questions[0].audio = '../../quiz.sqlite';
  writeFileSync(path, JSON.stringify(json));
  assert.throws(() => projects.load(saved.id), /följer inte schemat/);
  json.questions[0].audio = null;
  json.questions[0].duration = '120';
  writeFileSync(path, JSON.stringify(json));
  assert.throws(() => projects.load(saved.id), /följer inte schemat/);
  assert.equal(f.s.snapshot().questionCount, 3);
  assert.throws(
    () =>
      normalizeQuestion(
        base(f.s, { cues: [{ id: 'a', at: 120, text: 'Too late' }] }),
      ),
    /heltal/,
  );
  assert.throws(() => normalizeShow({ musicVolume: 101 }), /heltal/);
});
test('native music bridge validates arguments and serializes JXA calls without shell interpolation', async () => {
  const seen = [];
  let active = 0,
    max = 0;
  const bridge = createMusicBridge({
    platform: 'darwin',
    execute: async (file, args) => {
      active++;
      max = Math.max(max, active);
      seen.push({ file, args });
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { stdout: '{"ok":true}' };
    },
  });
  await Promise.all([
    bridge.search('ABBA $(whoami) "Waterloo"'),
    bridge.volume(22),
    bridge.play({ persistentId: 'ABCDEF0123456789', position: 20, volume: 80 }),
  ]);
  assert.equal(max, 1);
  assert.equal(seen[0].file, '/usr/bin/osascript');
  assert.equal(JSON.parse(seen[0].args.at(-1)).query, 'ABBA $(whoami) "Waterloo"');
  assert.throws(
    () => bridge.play({ persistentId: 'bad', position: 0, volume: 50 }),
    /Ogiltigt/,
  );
  assert.throws(() => bridge.volume(101), /heltal/);
  await assert.rejects(
    createMusicBridge({ platform: 'linux' }).status(),
    /Mac/,
  );
});

test('projects can switch before the first question starts, including after restart', (t) => {
  const f = fixture(t);
  for (const kind of ['music', 'wager']) {
    let s = f.s;
    s.command('saveQuestion', base(s, { kind }));
    const project = {
      title: 'Annat quiz',
      questions: s.snapshot({ host: true }).questions,
    };
    s.command('prepare', { id: project.questions[0].id });
    f.restart();
    s = f.s;
    s.command('loadProject', project);
    assert.equal(s.snapshot().view, 'lobby');
    assert.equal(s.active(), undefined);
    assert.equal(s.snapshot({ host: true }).rounds.length, 0);
  }
});

test('project switching persists teams, answers, edits and paused time across restart', (t) => {
  const f = fixture(t);
  let s = f.s;
  s.command('projectSaved', { id: 'a', savedAt: 1 });
  const player = team(s);
  const questions = s.export().questions;
  s.command('prepare', { id: questions[0].id });
  s.command('start');
  s.command('answer', { roundId: s.active().id, text: 'Exempelsvar' }, player.token);
  s.command('rename', { title: 'Ändrat' });
  s.command('loadProject', { id: 'b', title: 'B', questions });
  assert.equal(s.snapshot().teams.length, 0);
  f.restart();
  s = f.s;
  s.command('loadProject', { id: 'a', title: 'A', questions });
  assert.equal(s.snapshot().title, 'Ändrat');
  assert.equal(s.snapshot({ host: true }).projectDirty, true);
  assert.equal(s.active().status, 'paused');
  assert.equal(s.snapshot({ credential: player.token }).me.answer.text, 'Exempelsvar');
  const code = s.snapshot().code;
  assert.throws(() => s.command('resetResults'), /Bekräfta/);
  s.command('resetResults', { confirm: true });
  assert.equal(s.snapshot().code, code);
  assert.equal(s.snapshot().teams.length, 1);
  assert.equal(s.snapshot().teams[0].score, 0);
  assert.equal(s.active(), undefined);
  s.command('loadProject', { id: 'b', title: 'B', questions });
  s.command('loadProject', { id: 'a', title: 'A', questions });
  assert.equal(s.snapshot({ host: true }).rounds.length, 0);
  assert.ok(s.snapshot({ credential: player.token }).me);
});
