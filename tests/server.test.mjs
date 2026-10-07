import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real HTTP: host protection, mobile join, upload/ranges, grade, backup and crash recovery', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-http-'));
  let process;
  async function boot() {
    process = fork('server/server.mjs', [], {
      env: { ...globalThis.process.env, PORT: '0', QUIZ_DATA_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const [message] = await once(process, 'message');
    return `http://localhost:${message.port}`;
  }
  t.after(async () => {
    if (process?.exitCode === null) {
      process.kill('SIGTERM');
      await once(process, 'exit');
    }
    rmSync(dir, { recursive: true, force: true });
  });
  let base = await boot();
  let cookie = '';
  const id = 'a-test-controller-123456789';
  const request = (path, opts = {}) =>
    fetch(base + path, {
      ...opts,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        'X-Quiz-Controller': id,
        ...opts.headers,
      },
    });
  const post = async (path, body, headers = {}) => {
    const response = await request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    const data = await response.json();
    return { status: response.status, data };
  };
  assert.equal((await request('/api/state?view=host')).status, 401);
  assert.equal(
    (await post('/api/session', {}, { Origin: 'https://evil.invalid' })).status,
    403,
  );
  const session = await request('/api/session', { method: 'POST', body: '{}' });
  assert.equal(session.status, 200);
  cookie = session.headers.get('set-cookie').split(';')[0];
  const state = await (await request('/api/state?view=host')).json();
  assert.equal(state.host, true);
  const joined = await post('/api/team/command', {
    action: 'join',
    payload: { code: state.code, name: 'HTTP-laget' },
  });
  assert.equal(joined.status, 200);
  const token = joined.data.token;
  const unauth = await fetch(base + '/api/host/command', {
    method: 'POST',
    body: JSON.stringify({ action: 'start' }),
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(unauth.status, 401);
  assert.equal(
    (await post('/api/team/command', { action: 'goToFinal' })).status,
    400,
  );
  assert.equal((await post('/api/control', { claim: true })).status, 200);
  // Synthetic uncompressed WAV fixture: validate upload and range serving without remote audio.
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const uploaded = await (
    await request('/api/upload?kind=audio&filename=fixture.wav', {
      method: 'POST',
      body: wav,
    })
  ).json();
  assert.match(uploaded.url, /\.wav$/);
  assert.equal((await fetch(base + uploaded.url)).status, 403);
  const partial = await request(uploaded.url, {
    headers: { Range: 'bytes=0-43' },
  });
  assert.equal(partial.status, 206);
  assert.equal((await partial.arrayBuffer()).byteLength, 44);
  assert.equal(
    (await request(uploaded.url, { headers: { Range: 'bytes=999999-' } }))
      .status,
    416,
  );
  const picture = await (
    await request('/api/upload?kind=image&filename=clue.png', {
      method: 'POST',
      body: Buffer.from('image-fixture'),
    })
  ).json();
  const movie = await (
    await request('/api/upload?kind=video&filename=clue.mp4', {
      method: 'POST',
      body: Buffer.from('video-fixture'),
    })
  ).json();
  assert.equal((await fetch(base + picture.url)).status, 404);
  assert.equal((await fetch(base + movie.url)).status, 404);
  assert.equal(
    (
      await fetch(base + '/api/music', {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
      })
    ).status,
    401,
  );
  // Branding assets are deliberately public; unrevealed question media stays private.
  for (const action of ['prepare', 'prepareQuestion']) {
    assert.equal(
      (
        await fetch(base + '/api/music', {
          method: 'POST',
          body: JSON.stringify({ action }),
        })
      ).status,
      401,
    );
    assert.equal(
      (await post('/api/music', { action }, { Origin: 'https://evil.invalid' }))
        .status,
      403,
    );
  }
  const wrongProject = await post('/api/music', {
    action: 'prepareQuestion',
    sessionId: 'another-session',
    questionId: 'q1',
  });
  assert.equal(wrongProject.status, 400);
  assert.match(wrongProject.data.error, /Quizet har bytts/);
  for (const path of ['/api/media/check', '/api/media/import']) {
    assert.equal(
      (await fetch(base + path, { method: 'POST', body: '{}' })).status,
      401,
    );
  }
  const logo = await (
    await request('/api/upload?kind=image&filename=logo.png', {
      method: 'POST',
      body: Buffer.from('logo-fixture'),
    })
  ).json();
  const branded = await post('/api/host/command', {
    action: 'branding',
    payload: { ...state.branding, logo: logo.url },
  });
  assert.equal(branded.status, 200);
  assert.equal((await fetch(base + logo.url)).status, 200);
  assert.equal((await fetch(base + picture.url)).status, 404);
  const publicState = await (await fetch(base + '/api/state')).json();
  assert.equal(publicState.branding.logo, logo.url);
  assert.equal(publicState.mediaHealth, undefined);
  const health = await post('/api/media/check', {});
  assert.equal(health.status, 200);
  assert.deepEqual(health.data.issues, []);
  assert.equal(
    (
      await post('/api/media/import', {
        url: 'https://127.0.0.1/photo.jpg',
        kind: 'image',
      })
    ).status,
    400,
  );
  const question = {
    ...state.questions[0],
    audio: uploaded.url,
    cues: [
      {
        id: 'visual',
        at: 20,
        text: 'A later clue',
        image: picture.url,
        video: movie.url,
      },
    ],
  };
  assert.equal(
    (
      await post('/api/host/command', {
        action: 'saveQuestion',
        payload: question,
      })
    ).status,
    200,
  );
  const savedProject = await post('/api/projects/save', {
    name: 'HTTP project',
    copy: true,
  });
  assert.equal(savedProject.status, 200);
  const projectZip = await request(
    '/api/projects/export?id=' + savedProject.data.project.id,
  );
  assert.equal(projectZip.status, 200);
  assert.equal(
    Buffer.from(await projectZip.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    'PK',
  );
  assert.equal(
    (
      await post('/api/host/command', {
        action: 'showSettings',
        payload: { musicVolume: 101 },
      })
    ).status,
    400,
  );
  const settings = await post('/api/host/command', {
    action: 'showSettings',
    payload: { musicVolume: 77, talkVolume: 17, talking: true },
  });
  assert.equal(settings.data.state.show.talkVolume, 17);
  const prepared = await post('/api/host/command', {
    action: 'prepare',
    payload: { id: question.id },
  });
  const roundId = prepared.data.state.round.id;
  assert.equal(
    (await post('/api/host/command', { action: 'start' })).status,
    200,
  );
  assert.equal((await fetch(base + picture.url)).status, 404);
  assert.equal((await fetch(base + movie.url)).status, 404);
  assert.equal(
    (await post('/api/host/command', { action: 'nextCue' })).status,
    200,
  );
  assert.equal((await fetch(base + picture.url)).status, 200);
  assert.equal((await fetch(base + movie.url)).status, 200);
  const answered = await post(
    '/api/team/command',
    { action: 'answer', payload: { roundId, text: 'Svamp' } },
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(answered.status, 200);
  const saved = answered.data.answer;
  assert.ok(saved.points <= 100 && saved.points > 90);
  const duplicate = await post(
    '/api/team/command',
    { action: 'answer', payload: { roundId, text: 'Different' } },
    { Authorization: `Bearer ${token}` },
  );
  assert.deepEqual(duplicate.data.answer, saved);
  const pub = await (await fetch(base + '/api/state')).json();
  assert.equal(pub.host, false);
  assert.equal(pub.round.question.answer, undefined);
  assert.equal(pub.round.answers, undefined);
  assert.equal(pub.questions, undefined);
  assert.equal(
    (
      await post('/api/host/command', {
        action: 'grade',
        payload: { roundId, teamId: saved.teamId, correct: true },
      })
    ).status,
    200,
  );
  const earlyRetry = await post(
    '/api/team/command',
    {
      action: 'answer',
      payload: { roundId, text: 'Changed after grading' },
    },
    { Authorization: `Bearer ${token}` },
  );
  assert.deepEqual(earlyRetry.data.answer, saved);
  const shortened = await post('/api/host/command', { action: 'countdown' });
  assert.equal(shortened.status, 200);
  assert.ok(shortened.data.state.round.limitMs < 11000);
  // SIGKILL models loss of the process, without executing graceful-save handlers.
  process.kill('SIGKILL');
  await once(process, 'exit');
  base = await boot();
  const restored = await (await request('/api/state?view=host')).json();
  assert.equal(restored.round.status, 'paused');
  assert.equal(restored.round.answers.length, 1);
  assert.equal(restored.round.answers[0].text, 'Svamp');
  assert.ok(restored.round.limitMs < 11000);
  assert.equal(restored.show.musicVolume, 77);
  assert.equal(restored.round.visibleCues.length, 1);
  const own = await (
    await request('/api/state', {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.equal(own.me.name, 'HTTP-laget');
  assert.equal(own.me.answer.text, 'Svamp');
  assert.equal(own.me.answer.correct, null);
  assert.equal(own.me.score, 0);
  assert.equal(restored.round.answers[0].correct, true);
  assert.equal(
    (
      await post('/api/host/command', {
        action: 'grade',
        payload: { roundId, teamId: saved.teamId, correct: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (await post('/api/host/command', { action: 'close' })).status,
    200,
  );
  assert.equal(
    (await post('/api/host/command', { action: 'reveal' })).status,
    409,
  );
  assert.equal(
    (
      await post('/api/host/command', {
        action: 'grade',
        payload: { roundId, teamId: saved.teamId, correct: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (await post('/api/host/command', { action: 'reveal' })).status,
    409,
    'facit must wait for the public points presentation',
  );
  assert.equal(
    (await post('/api/host/command', { action: 'leaderboard' })).status,
    200,
  );
  const presentation = await (await fetch(base + '/api/state')).json();
  assert.equal(presentation.teams[0].roundResult.text, 'Svamp');
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(
        0,
        presentation.round.scorePresentationEndsAt - presentation.serverNow,
      ) + 100,
    ),
  );
  assert.equal(
    (await post('/api/host/command', { action: 'reveal' })).status,
    200,
  );
  const scores = await (await fetch(base + '/api/state')).json();
  assert.equal(scores.teams[0].score, saved.points);
  const final = await post('/api/host/command', { action: 'goToFinal' });
  assert.equal(final.status, 200);
  assert.equal(final.data.state.round.status, 'betting');
  assert.equal(final.data.state.round.number, 2);
  assert.equal(final.data.state.round.question.kind, 'wager');
  assert.equal(final.data.state.playedCount, 1);
  assert.equal(final.data.state.questionCount, 3);
  const finalPublic = await (await fetch(base + '/api/state')).json();
  assert.equal(finalPublic.round.question.prompt, undefined);
  assert.equal(finalPublic.finalQuestionId, undefined);
  assert.equal(finalPublic.teams[0].score, saved.points);
  const backup = await request('/api/backup');
  assert.equal(backup.status, 200);
  assert.equal(
    Buffer.from(await backup.arrayBuffer())
      .subarray(0, 15)
      .toString(),
    'SQLite format 3',
  );
  for (const path of ['/', '/join/', '/screen/']) {
    const response = await request(path);
    assert.equal(
      response.status,
      200,
      `${path} must be present in the production export`,
    );
    const html = await response.text();
    assert.match(html, /QUIZ/);
    assert.ok(!html.includes('quiz_host='));
  }
});
