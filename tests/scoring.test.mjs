import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuizStore } from '../server/engine.mjs';
import { MOVE_MS, TERM_MS } from '../server/scoring.mjs';

function game(t, scores, questionIndex = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-scoring-'));
  let now = 1000000;
  let store = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
  const teams = scores.map((score, i) => {
    const ticket = store.command('join', {
      name: `Lag ${i + 1}`,
      code: store.snapshot().code,
    });
    const id = store.snapshot({ credential: ticket.token }).me.id;
    store.command('adjust', {
      teamId: id,
      delta: score,
      reason: 'Tidigare frågor',
      requestId: id,
    });
    return { ...ticket, id };
  });
  store.command('prepare', {
    id: store.snapshot({ host: true }).questions[questionIndex].id,
  });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    teams,
    at(time) {
      now = time;
    },
    advance(ms) {
      now += ms;
    },
    restart() {
      store.close();
      store = createQuizStore(join(dir, 'quiz.sqlite'), () => now);
    },
    answer(team, text = 'Svamp') {
      return store.command(
        'answer',
        { roundId: store.active().id, text },
        team.token,
      ).answer;
    },
    grade(team, correct) {
      return store.command('grade', {
        roundId: store.active().id,
        teamId: team.id,
        correct,
      });
    },
    publicTeam(team) {
      return store.snapshot().teams.find((entry) => entry.id === team.id);
    },
  };
}

test('61 +22 stays in its old place, merges to 83 and overtakes; fast judgments queue in frozen order', (t) => {
  const g = game(t, [80, 70, 61]);
  const [leader, middle, last] = g.teams;
  g.store.command('start');
  g.advance(94000);
  for (const team of g.teams) assert.equal(g.answer(team).points, 22);
  g.store.command('close');
  g.store.command('leaderboard');
  assert.deepEqual(g.store.snapshot({ host: true }).round.gradingOrder, [
    last.id,
    middle.id,
    leader.id,
  ]);
  g.grade(leader, true);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 0);
  assert.equal(g.publicTeam(last).roundResult.correct, null);
  g.grade(last, true);
  g.grade(middle, false);
  g.grade(leader, true);
  const events = g.store.export().rounds[0].scoring.events;
  assert.deepEqual(
    events.map((e) => e.teamId),
    [last.id, middle.id, leader.id],
  );
  assert.ok(
    events.every((e, i) => i === 0 || e.startsAt >= events[i - 1].endsAt),
  );
  assert.throws(() => g.store.command('reveal'), /räknats ihop/);
  assert.throws(
    () => g.store.command('prepare', { id: 'anything' }),
    /Avsluta/,
  );
  g.at(events[0].startsAt);
  assert.equal(g.publicTeam(last).score, 61);
  assert.equal(g.publicTeam(last).roundResult.delta, 22);
  assert.equal(g.publicTeam(last).roundResult.correct, true);
  assert.equal(g.store.snapshot().teams.at(-1).id, last.id);
  assert.equal(
    g.store.snapshot({ credential: last.token }).me.answer.correct,
    true,
  );
  assert.equal(
    g.store.snapshot().round.question.answer,
    g.store.active().question.answer,
  );
  g.at(events[0].mergesAt);
  assert.equal(g.publicTeam(last).score, 83);
  assert.equal(g.publicTeam(last).roundResult.delta, null);
  assert.equal(g.store.snapshot().teams[0].id, last.id);
  g.at(events[1].startsAt);
  assert.equal(g.publicTeam(middle).roundResult.delta, 0);
  assert.equal(g.publicTeam(middle).roundResult.correct, false);
  g.at(events.at(-1).endsAt);
  assert.deepEqual(
    g.store.snapshot().teams.map((entry) => entry.score),
    [102, 83, 70],
  );
  g.store.command('reveal');
  assert.equal(
    g.store.snapshot().round.question.answer,
    g.store.active().question.answer,
  );
});

test('equal scores present in reverse display order regardless of grading order, skipping missing answers', (t) => {
  const g = game(t, [0, 0, 0, 0]);
  g.store.command('start');
  g.answer(g.teams[0], 'En alternativ stavning');
  g.answer(g.teams[2], 'svmp');
  g.store.command('close');
  g.store.command('leaderboard');
  g.grade(g.teams[0], true);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 0);
  g.grade(g.teams[2], true);
  g.grade(g.teams[0], true);
  assert.equal(g.publicTeam(g.teams[3]).roundResult.text, null);
  g.advance(20000);
  assert.equal(g.publicTeam(g.teams[0]).score, 100);
  assert.equal(g.publicTeam(g.teams[2]).score, 100);
  g.store.command('reveal');
});

test('retry and restart preserve the presentation; reversing a judgment applies only the difference', (t) => {
  const g = game(t, [61]);
  const [team] = g.teams;
  g.store.command('start');
  g.advance(94000);
  g.answer(team);
  g.store.command('close');
  g.store.command('leaderboard');
  g.grade(team, true);
  const event = g.store.export().rounds[0].scoring.events[0];
  g.at(event.startsAt + 500);
  g.restart();
  assert.equal(g.publicTeam(team).score, 61);
  assert.equal(g.publicTeam(team).roundResult.delta, 22);
  g.grade(team, true);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 1);
  g.grade(team, false);
  const correction = g.store.export().rounds[0].scoring.events[1];
  assert.equal(correction.delta, -22);
  g.at(correction.startsAt);
  assert.equal(g.publicTeam(team).score, 83);
  assert.equal(g.publicTeam(team).roundResult.delta, -22);
  g.at(correction.endsAt);
  g.restart();
  assert.equal(g.publicTeam(team).score, 61);
  assert.equal(g.publicTeam(team).roundResult.correct, false);
  g.store.command('reveal');
  g.grade(team, true);
  assert.equal(g.publicTeam(team).score, 83);
});

test('missing final answers lose their wager in the same last-to-first queue', (t) => {
  const g = game(t, [100, 80, 60], 2);
  const [first, middle, last] = g.teams;
  for (const team of g.teams)
    g.store.command(
      'bet',
      {
        roundId: g.store.active().id,
        amount: 50,
      },
      team.token,
    );
  g.store.command('start');
  g.answer(first, 'Roxette');
  g.answer(last, 'Fel');
  g.store.command('close');
  g.store.command('leaderboard');
  assert.equal(g.publicTeam(middle).score, 80);
  g.grade(last, false);
  g.grade(first, true);
  const events = g.store.export().rounds[0].scoring.events;
  assert.deepEqual(
    events.map((e) => e.teamId),
    [last.id, middle.id, first.id],
  );
  assert.throws(() => g.grade(middle, true), /uteblivet/);
  g.at(events[1].startsAt);
  assert.equal(g.publicTeam(middle).score, 80);
  assert.equal(g.publicTeam(middle).roundResult.delta, -50);
  g.at(events.at(-1).endsAt);
  assert.deepEqual(
    g.store.snapshot().teams.map((entry) => entry.score),
    [150, 30, 10],
  );
  g.store.command('reveal');
});

test('a closed question without answers can reveal immediately; next question hides old answers', (t) => {
  const g = game(t, [0]);
  g.store.command('start');
  g.store.command('close');
  g.store.command('leaderboard');
  g.store.command('reveal');
  g.store.command('prepare', {
    id: g.store.snapshot({ host: true }).questions[1].id,
  });
  assert.equal(g.publicTeam(g.teams[0]).roundResult, undefined);
  assert.equal(g.store.snapshot().round.gradingOrder, undefined);
  assert.equal(g.store.snapshot().round.question.answer, undefined);
});

for (const count of [6, 20, 100]) {
  test(`${count} teams take one batch and at most five individual presentations`, (t) => {
    const g = game(
      t,
      Array.from({ length: count }, (_, i) => 1000 - i),
    );
    g.store.command('start');
    for (const team of g.teams) {
      g.answer(team);
      g.grade(team, true);
    }
    g.store.command('close');
    g.store.command('leaderboard');
    const events = g.store.export().rounds[0].scoring.events;
    const batch = events.filter((e) => e.batch);
    const individual = events.filter((e) => !e.batch);
    assert.equal(batch.length, count - 5);
    assert.equal(individual.length, 5);
    assert.deepEqual(
      individual.map((e) => e.teamId),
      g.teams
        .slice(0, 5)
        .reverse()
        .map((t) => t.id),
    );
    assert.equal(new Set(batch.map((e) => e.startsAt)).size, 1);
    assert.ok(
      batch.every(
        (e) => e.startsAt === e.mergesAt && e.endsAt <= individual[0].startsAt,
      ),
    );
    assert.equal(
      events.at(-1).endsAt - events[0].startsAt,
      MOVE_MS + 5 * (TERM_MS + MOVE_MS),
    );
    g.at(batch[0].startsAt - 1);
    assert.ok(
      g.store.snapshot().teams.every((t) => t.roundResult.correct === null),
    );
    g.at(batch[0].startsAt);
    for (let i = 5; i < count; i++) {
      const team = g.publicTeam(g.teams[i]);
      assert.equal(team.score, 1100 - i);
      assert.equal(team.roundResult.correct, true);
      assert.equal(team.roundResult.delta, null);
      assert.equal(team.roundResult.active, false);
    }
    assert.equal(g.publicTeam(g.teams[4]).score, 996);
    g.restart();
    assert.deepEqual(g.store.export().rounds[0].scoring.events, events);
    g.at(events.at(-1).endsAt);
    g.store.command('reveal');
    assert.deepEqual(
      g.store.snapshot().teams.map((t) => t.score),
      g.teams.map((_, i) => 1100 - i),
    );
  });
}

test('live and paused grading stays private, survives restart and waits on the answer screen', (t) => {
  const g = game(t, [100, 90, 80, 70, 60, 50]);
  const [first, , , , , last] = g.teams;
  g.store.command('start');
  const receipt = structuredClone(g.answer(first));
  g.grade(first, true);
  g.answer(last);
  g.store.command('pause');
  g.grade(last, true);
  g.grade(last, false);
  g.grade(last, true);
  g.restart();
  assert.equal(g.store.active().status, 'paused');
  assert.equal(g.store.snapshot({ host: true }).round.answers[0].correct, true);
  assert.equal(g.store.snapshot().round.question.answer, undefined);
  assert.equal(g.store.snapshot().round.answers, undefined);
  assert.equal(
    g.store.snapshot({ credential: first.token }).me.answer.correct,
    null,
  );
  assert.equal(g.publicTeam(first).score, 100);
  assert.equal(g.publicTeam(first).roundResult, undefined);
  assert.deepEqual(g.answer(first, 'Cannot replace the answer'), receipt);
  g.store.command('resume');
  g.advance(120000);
  g.store.tick();
  assert.equal(g.store.active().status, 'closed');
  g.advance(60000);
  assert.equal(g.store.snapshot().view, 'round');
  assert.equal(g.publicTeam(last).score, 50);
  assert.equal(
    g.store.snapshot({ credential: last.token }).me.answer.correct,
    null,
  );
  assert.deepEqual(g.store.export().rounds[0].scoring.events, []);
  assert.throws(() => g.store.command('reveal'), /räknats ihop/);
  g.restart();
  g.store.command('leaderboard');
  const scoring = g.store.export().rounds[0].scoring;
  assert.deepEqual(scoring.batchTeamIds, [last.id]);
  assert.equal(scoring.events.length, 2);
  assert.equal(g.publicTeam(last).score, 150);
  assert.equal(g.store.snapshot().teams[0].id, last.id);
  assert.equal(g.publicTeam(first).score, 100);
  const events = structuredClone(scoring.events);
  g.store.command('leaderboard');
  assert.deepEqual(g.store.export().rounds[0].scoring.events, events);
  g.at(events.at(-1).endsAt);
  g.store.command('reveal');
  assert.equal(g.publicTeam(first).score, 200);
});

test('batch waits for remaining judgments and top five retain their presentation order', (t) => {
  const g = game(t, [100, 90, 80, 70, 60, 50, 40, 30]);
  g.store.command('start');
  // The eighth team submits no answer and must not block the batch.
  for (const team of g.teams.slice(0, 7)) g.answer(team);
  g.store.command('close');
  g.store.command('leaderboard');
  g.grade(g.teams[0], true);
  g.grade(g.teams[5], true);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 0);
  g.grade(g.teams[6], false);
  let events = g.store.export().rounds[0].scoring.events;
  assert.equal(events.length, 2);
  assert.equal(events[0].startsAt, events[1].startsAt);
  g.grade(g.teams[0], false); // Change a queued-for-later judgment before presentation.
  for (const team of g.teams.slice(1, 5)) g.grade(team, true);
  events = g.store.export().rounds[0].scoring.events;
  assert.equal(events.length, 7);
  assert.deepEqual(
    events.slice(2).map((e) => e.teamId),
    g.teams
      .slice(0, 5)
      .reverse()
      .map((t) => t.id),
  );
  assert.equal(events.at(-1).delta, 0);
  assert.throws(() => g.store.command('reveal'), /räknats ihop/);
  g.at(events.at(-1).endsAt);
  g.grade(g.teams[5], false);
  const correction = g.store.export().rounds[0].scoring.events.at(-1);
  assert.equal(correction.batch, true);
  assert.equal(correction.delta, -100);
  assert.equal(correction.startsAt, correction.mergesAt);
  assert.equal(g.publicTeam(g.teams[5]).score, 50);
  g.grade(g.teams[5], false);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 8);
  g.at(correction.endsAt);
  g.store.command('reveal');
});

test('a tie at fifth place still limits individual presentations to five teams', (t) => {
  const g = game(t, [0, 0, 0, 0, 0, 0, 0]);
  const top = g.store
    .snapshot()
    .teams.slice(0, 5)
    .map((t) => t.id);
  g.store.command('start');
  for (const team of g.teams) {
    g.answer(team);
    g.grade(team, true);
  }
  g.store.command('close');
  g.store.command('leaderboard');
  assert.deepEqual(
    g.store
      .export()
      .rounds[0].scoring.events.filter((e) => !e.batch)
      .map((e) => e.teamId),
    top.reverse(),
  );
});

test('missing final answers in the batch lose their wagers together', (t) => {
  const g = game(t, [100, 90, 80, 70, 60, 50, 40], 2);
  for (const team of g.teams)
    g.store.command(
      'bet',
      { roundId: g.store.active().id, amount: 20 },
      team.token,
    );
  g.store.command('start');
  g.answer(g.teams[0]);
  g.grade(g.teams[0], true);
  g.store.command('close');
  g.store.command('leaderboard');
  const events = g.store.export().rounds[0].scoring.events;
  assert.deepEqual(
    events.slice(0, 2).map((e) => e.delta),
    [-20, -20],
  );
  g.at(events[0].mergesAt);
  assert.equal(g.publicTeam(g.teams[5]).score, 30);
  assert.equal(g.publicTeam(g.teams[6]).score, 20);
  assert.equal(g.publicTeam(g.teams[4]).score, 60);
  g.at(events.at(-1).endsAt);
  g.store.command('reveal');
  assert.deepEqual(
    g.store.snapshot().teams.map((t) => t.score),
    [120, 70, 60, 50, 40, 30, 20],
  );
});

test('removing an ungraded batch team releases the remaining results', (t) => {
  const g = game(t, [100, 90, 80, 70, 60, 50, 40]);
  g.store.command('start');
  for (const team of g.teams) g.answer(team);
  g.store.command('close');
  g.store.command('leaderboard');
  for (const team of g.teams.slice(0, 6)) g.grade(team, true);
  assert.equal(g.store.export().rounds[0].scoring.events.length, 0);
  g.store.command('removeTeam', { teamId: g.teams[6].id, confirm: true });
  const scoring = g.store.export().rounds[0].scoring;
  assert.deepEqual(scoring.batchTeamIds, [g.teams[5].id]);
  assert.equal(scoring.events.length, 6);
  g.at(scoring.events.at(-1).endsAt);
  g.store.command('reveal');
});
