import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import demo from '../examples/demo/quiz.json' with { type: 'json' };
import { createQuizStore } from '../server/engine.mjs';
import { createProjects } from '../server/projects.mjs';
import { createMediaHealth } from '../server/media.mjs';

test('the portable demo plays all three question types on a fresh install without media or music services', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-demo-'));
  let now = 1_000_000;
  const store = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(store.snapshot().title, demo.name);
  assert.equal(store.snapshot().teams.length, 0);
  assert.equal(store.snapshot().playedCount, 0);
  const projects = createProjects(dir);
  mkdirSync(projects.directory(demo.id));
  copyFileSync(
    new URL('../examples/demo/quiz.json', import.meta.url),
    join(projects.directory(demo.id), 'quiz.json'),
  );
  store.command('loadProject', projects.load(demo.id));
  const media = createMediaHealth(join(dir, 'media'), {
    check() {
      assert.fail('the demo must not depend on a local music library');
    },
  });
  const health = await media.check(store.export());
  assert.equal(health.localCount, 0);
  assert.deepEqual(health.issues, []);
  assert.deepEqual(health.music.issues, []);
  const player = store.command('join', {
    code: store.snapshot().code,
    name: 'Demolaget',
  });
  const teamId = store.snapshot({ credential: player.token }).me.id;
  const questions = store.snapshot({ host: true }).questions;
  assert.deepEqual(
    questions.map((q) => q.kind),
    ['music', 'bonus', 'wager'],
  );
  for (const question of questions) {
    store.command('prepare', { id: question.id });
    const roundId = store.active().id;
    if (question.kind === 'wager')
      store.command('bet', { roundId, amount: 75 }, player.token);
    store.command('start');
    if (question.kind === 'music') {
      now += 60_000;
      assert.equal(store.snapshot().round.visibleCues.length, 2);
      assert.equal(store.snapshot().round.question.answer, undefined);
    }
    store.command('answer', { roundId, text: question.answer }, player.token);
    store.command('close');
    store.command('grade', { roundId, teamId, correct: true });
    store.command('leaderboard');
    now += 20_000;
    store.command('reveal');
  }
  assert.equal(store.snapshot().completed, true);
  assert.equal(store.snapshot().playedCount, 3);
  assert.equal(store.snapshot({ credential: player.token }).me.score, 275);
  const saved = projects.save(store.export(), { name: 'Mitt första quiz' });
  assert.deepEqual(projects.load(saved.id).questions, questions);
});
