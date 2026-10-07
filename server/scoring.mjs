// Durable timing lets the judge work faster than the public score presentation.
export const TERM_MS = 1600;
export const MOVE_MS = 700;
export const TIMES_UP_MS = 3200;
export const INDIVIDUAL_TEAM_LIMIT = 5;

export const answerPoints = (round, answer) =>
  answer?.correct === true
    ? answer.points
    : answer?.correct === false && round.question.kind === 'wager'
      ? -answer.points
      : 0;

export const compareTeams = (a, b) =>
  b.score - a.score ||
  a.name.localeCompare(b.name, 'sv') ||
  a.id.localeCompare(b.id);

export function queueResult(round, answer, now, batchStartsAt) {
  const events = round.scoring.events;
  const batch = round.scoring.batchTeamIds?.includes(answer.teamId) ?? false;
  const previous = events
    .filter((e) => e.teamId === answer.teamId)
    .reduce((sum, e) => sum + e.delta, 0);
  const startsAt =
    batchStartsAt ??
    Math.max(
      now,
      round.closedAt + TIMES_UP_MS + 600,
      events.at(-1)?.endsAt ?? 0,
    );
  events.push({
    teamId: answer.teamId,
    correct: answer.correct,
    batch,
    delta: answerPoints(round, answer) - previous,
    startsAt,
    mergesAt: startsAt + (batch ? 0 : TERM_MS),
    endsAt: startsAt + (batch ? 0 : TERM_MS) + MOVE_MS,
  });
}

// Grading may happen in any order. Only presentation follows the frozen standing.
export function queuePendingResults(round, now) {
  if (round.status !== 'closed' || round.scoring.startedAt === null) return;
  const { order, events, batchTeamIds = [] } = round.scoring;
  const answers = new Map(round.answers.map((a) => [a.teamId, a]));
  const queued = new Set(events.map((e) => e.teamId));
  const batch = batchTeamIds.map((id) => answers.get(id)).filter(Boolean);
  if (batch.some((a) => a.correct === null)) return;
  const batchStartsAt = Math.max(
    now,
    round.closedAt + TIMES_UP_MS + 600,
    events.at(-1)?.endsAt ?? 0,
  );
  for (const a of batch)
    if (!queued.has(a.teamId)) queueResult(round, a, now, batchStartsAt);
  for (const id of order) {
    if (batchTeamIds.includes(id) || queued.has(id)) continue;
    const a = answers.get(id);
    if (!a) continue;
    if (a.correct === null) break;
    queueResult(round, a, now);
  }
}

export function publicResult(round, teamId, now) {
  const events = (round.scoring?.events || []).filter(
    (e) => e.teamId === teamId && e.startsAt <= now,
  );
  const shown = events.at(-1);
  return {
    points: events
      .filter((e) => e.mergesAt <= now)
      .reduce((sum, e) => sum + e.delta, 0),
    correct: shown?.correct ?? null,
    delta: shown && now < shown.mergesAt ? shown.delta : null,
    active: !!shown && !shown.batch && now < shown.endsAt,
  };
}
