import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createQuizStore } from '../server/engine.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-final-'));
  let now = 1000000;
  let store = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    get s() {
      return store;
    },
    advance(ms) {
      now += ms;
    },
    reopen() {
      store.close();
      store = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
    },
  };
}

test('jumping to the final from the lobby preserves the bank and finishes early', (t) => {
  const f = fixture(t),
    s = f.s;
  const questions = s.export().questions;
  const player = s.command('join', { code: s.snapshot().code, name: 'A' });
  const teamId = s.snapshot({ credential: player.token }).me.id;
  s.command('adjust', {
    teamId,
    delta: 100,
    requestId: 'seed',
    reason: 'Test',
  });
  s.command('goToFinal');
  const roundId = s.active().id;
  assert.equal(s.active().status, 'betting');
  assert.equal(s.active().number, 1);
  assert.equal(s.active().question.id, questions[2].id);
  assert.equal(s.snapshot().completed, false);
  assert.equal(s.snapshot().round.question.prompt, undefined);
  assert.equal(s.snapshot().round.question.answer, undefined);
  assert.equal(s.snapshot().finalQuestionId, undefined);
  s.command('bet', { roundId, amount: 75 }, player.token);
  s.command('goToFinal');
  assert.equal(s.active().id, roundId, 'retry must preserve the locked bet');
  assert.throws(() => s.command('unprepare'), /satsat/);
  assert.throws(() => s.command('cancelFinal'), /förberetts/);
  s.command('start');
  s.command('answer', { roundId, text: 'Roxette' }, player.token);
  s.command('close');
  s.command('grade', { roundId, teamId, correct: true });
  assert.equal(s.snapshot().completed, false);
  assert.throws(() => s.command('reveal'), /Vänta/);
  s.command('leaderboard');
  f.advance(10000);
  s.command('reveal');
  assert.equal(s.snapshot().completed, true);
  assert.equal(s.snapshot().view, 'leaderboard');
  assert.equal(s.snapshot().playedCount, 1);
  assert.equal(s.snapshot().questionCount, 3);
  assert.equal(s.snapshot({ credential: player.token }).me.score, 175);
  assert.deepEqual(s.export().questions, questions);
  assert.throws(
    () => s.command('prepare', { id: questions[0].id }),
    /Finalen är avslutad/,
  );
  assert.throws(() => s.command('goToFinal'), /avslutad/);
  assert.throws(() => s.command('cancelFinal'), /förberetts/);
  f.reopen();
  assert.equal(f.s.snapshot().completed, true);
  assert.equal(f.s.snapshot({ credential: player.token }).me.score, 175);
  f.s.command('resetResults', { confirm: true });
  assert.equal(f.s.snapshot().completed, false);
  assert.equal(f.s.snapshot({ host: true }).finalQuestionId, null);
  assert.deepEqual(f.s.export().questions, questions);
  f.s.command('prepare', { id: questions[0].id });
  assert.equal(f.s.active().number, 1);
});

test('an unstarted ordinary question is replaced, and the final can be unprepared before betting', (t) => {
  const s = fixture(t).s;
  const questions = s.export().questions;
  s.command('prepare', { id: questions[0].id });
  s.command('goToFinal');
  assert.equal(s.active().number, 1);
  assert.equal(s.snapshot({ host: true }).rounds.length, 1);
  assert.equal(s.active().question.id, questions[2].id);
  assert.equal(s.snapshot().playedCount, 0);
  s.command('unprepare');
  assert.equal(s.snapshot({ host: true }).finalQuestionId, null);
  assert.equal(s.snapshot().completed, false);
  s.command('prepare', { id: questions[0].id });
  assert.equal(s.active().question.id, questions[0].id);
});

for (const status of ['running', 'paused', 'closed', 'revealed']) {
  test(`final selection while ${status} preserves answers and waits for scoring`, (t) => {
    const f = fixture(t),
      s = f.s;
    const questions = s.export().questions;
    const player = s.command('join', { code: s.snapshot().code, name: 'A' });
    s.command('prepare', { id: questions[0].id });
    s.command('start');
    f.advance(30000);
    const roundId = s.active().id;
    const { answer } = s.command(
      'answer',
      { roundId, text: 'ABBA' },
      player.token,
    );
    if (status === 'paused') s.command('pause');
    if (['closed', 'revealed'].includes(status)) s.command('close');
    if (status === 'revealed') {
      s.command('grade', { roundId, teamId: answer.teamId, correct: true });
      s.command('leaderboard');
      f.advance(10000);
      s.command('reveal');
    }
    const before = structuredClone(s.active());
    s.command('goToFinal');
    assert.equal(s.snapshot({ host: true }).finalQuestionId, questions[2].id);
    if (status !== 'revealed') {
      assert.deepEqual(s.active(), before);
      assert.throws(
        () => s.command('prepare', { id: questions[2].id }),
        /Avsluta/,
      );
      if (status !== 'closed') s.command('close');
      assert.throws(() => s.command('reveal'), /Rätta alla/);
      s.command('grade', { roundId, teamId: answer.teamId, correct: true });
      assert.throws(() => s.command('reveal'), /Vänta/);
      s.command('leaderboard');
      f.advance(10000);
      s.command('reveal');
      assert.throws(
        () => s.command('prepare', { id: questions[1].id }),
        /Finalen står på tur/,
      );
      s.command('goToFinal');
    }
    assert.equal(s.active().status, 'betting');
    assert.equal(s.active().number, 2);
    assert.equal(s.active().question.id, questions[2].id);
    assert.equal(
      s.snapshot({ credential: player.token }).me.score,
      answer.points,
    );
    s.command(
      'bet',
      { roundId: s.active().id, amount: answer.points },
      player.token,
    );
    assert.equal(s.active().bets[0].amount, answer.points);
    assert.deepEqual(s.export().questions, questions);
  });
}

test('pending final survives restart and project switches, and can be cancelled', (t) => {
  const f = fixture(t),
    s = f.s;
  const questions = s.export().questions;
  s.command('projectSaved', { id: 'a', savedAt: 1 });
  s.command('prepare', { id: questions[0].id });
  s.command('start');
  f.advance(10000);
  s.tick();
  s.command('goToFinal');
  assert.throws(
    () => s.command('deleteQuestion', { id: questions[2].id }),
    /förberedda/,
  );
  assert.throws(
    () => s.command('saveQuestion', { ...questions[2], kind: 'music' }),
    /förberetts/,
  );
  s.command('loadProject', { id: 'b', title: 'B', questions });
  assert.equal(s.snapshot({ host: true }).finalQuestionId, null);
  f.reopen();
  f.s.command('loadProject', { id: 'a', title: 'A', questions });
  assert.equal(f.s.active().status, 'paused');
  assert.equal(f.s.snapshot().round.elapsedMs, 10000);
  assert.equal(f.s.snapshot({ host: true }).finalQuestionId, questions[2].id);
  f.s.command('cancelFinal');
  f.s.command('cancelFinal');
  assert.equal(f.s.snapshot({ host: true }).finalQuestionId, null);
  f.s.command('close');
  f.s.command('reveal');
  f.s.command('prepare', { id: questions[1].id });
  assert.equal(f.s.active().question.id, questions[1].id);
  f.s.command('goToFinal');
  f.s.command('reset', { confirm: 'NY OMGÅNG' });
  assert.equal(f.s.snapshot({ host: true }).finalQuestionId, null);
  assert.equal(f.s.snapshot().completed, false);
});

test('missing final rejects the jump without losing the prepared question', (t) => {
  const s = fixture(t).s;
  const questions = s.export().questions;
  s.command('deleteQuestion', { id: questions[2].id });
  s.command('prepare', { id: questions[0].id });
  const before = s.export();
  assert.throws(() => s.command('goToFinal'), /ospelad/);
  assert.deepEqual(s.export(), before);
});

test('a final selected through the ordinary flow also ends a quiz with unused questions', (t) => {
  const s = fixture(t).s;
  const questions = s.export().questions;
  s.command('prepare', { id: questions[2].id });
  s.command('start');
  s.command('close');
  s.command('reveal');
  assert.equal(s.snapshot().completed, true);
  assert.equal(s.snapshot().playedCount, 1);
  assert.equal(s.snapshot().questionCount, 3);
});

test('a quiz without a final still completes when all questions are played', (t) => {
  const s = fixture(t).s;
  const questions = s.export().questions;
  s.command('deleteQuestion', { id: questions[2].id });
  for (const question of questions.slice(0, 2)) {
    assert.equal(s.snapshot().completed, false);
    s.command('prepare', { id: question.id });
    s.command('start');
    s.command('close');
    s.command('reveal');
  }
  assert.equal(s.snapshot().completed, true);
});

test('a final prepared by an older version still finishes with unused questions', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-legacy-final-'));
  const path = join(dir, 'quiz.sqlite');
  let s = createQuizStore(path);
  t.after(() => {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  s.command('goToFinal');
  const saved = s.export();
  delete saved.finalQuestionId;
  s.close();
  const db = new DatabaseSync(path);
  db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(saved));
  db.close();
  s = createQuizStore(path);
  assert.equal(s.snapshot().completed, false);
  s.command('start');
  s.command('close');
  s.command('reveal');
  assert.equal(s.snapshot().completed, true);
  assert.equal(s.snapshot().playedCount, 1);
  assert.throws(
    () => s.command('prepare', { id: saved.questions[0].id }),
    /Finalen är avslutad/,
  );
});
