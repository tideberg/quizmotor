import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionPreview } from '../server/question-preview.mjs';

function setup() {
  let time = 0,
    live = false;
  const calls = [];
  const track = { persistentId: 'ABCDEF0123456789' };
  const preview = createQuestionPreview({
    music: {
      play: async (args) => calls.push(['play', args]),
      pause: async (id) => calls.push(['pause', id]),
    },
    resolveTrack: async () => track,
    volume: () => 70,
    isLive: () => live,
    now: () => time,
  });
  const start = {
    action: 'start',
    session: 'preview-session-123',
    track,
    position: 42,
    remaining: 120000,
  };
  return {
    preview,
    calls,
    start,
    advance: (ms) => {
      time += ms;
    },
    setLive: () => {
      live = true;
    },
  };
}

test('editor preview plays the draft offset and resumes at the selected timeline position', async () => {
  const { preview, calls, start } = setup();
  await preview.command(start);
  assert.deepEqual(calls[0], [
    'play',
    { persistentId: start.track.persistentId, position: 42, volume: 70 },
  ]);
  await preview.command({ action: 'stop', session: start.session });
  await preview.command({ ...start, position: 72, remaining: 90000 });
  assert.equal(calls[1][0], 'pause');
  assert.equal(calls[2][1].position, 72);
  await preview.stop();
  assert.equal(calls[3][0], 'pause');
});

test('preview lease stops music after a disconnected editor and honors question duration', async () => {
  const { preview, calls, start, advance } = setup();
  await preview.command(start);
  advance(14000);
  await preview.command({ action: 'ping', session: start.session });
  advance(14000);
  await preview.expire();
  assert.equal(calls.length, 1);
  advance(1000);
  await preview.expire();
  assert.equal(calls.at(-1)[0], 'pause');
  await assert.rejects(
    preview.command({ action: 'ping', session: start.session }),
    /stannat/,
  );
  await preview.command({ ...start, remaining: 2000 });
  advance(1000);
  await preview.command({ action: 'ping', session: start.session });
  advance(1000);
  await preview.expire();
  assert.equal(calls.at(-1)[0], 'pause');
});

test('late close from another editor cannot stop current preview or subsequent live music', async () => {
  const { preview, calls, start, setLive } = setup();
  await preview.command(start);
  await preview.command({ action: 'stop', session: 'another-preview-123' });
  assert.equal(calls.length, 1);
  await assert.rejects(
    preview.command({ ...start, session: 'another-preview-123' }),
    /annan provspelning/,
  );
  await preview.stop(); // Host start/resume first releases preview ownership.
  setLive();
  await preview.command({ action: 'stop', session: start.session });
  assert.equal(calls.length, 2);
  await assert.rejects(preview.command(start), /pågående frågan/);
  assert.equal(calls.length, 2);
});

test('failed playback never creates a running preview lease', async () => {
  const preview = createQuestionPreview({
    music: {
      play: async () => {
        throw new Error('Låten kunde inte spelas');
      },
      pause: async () => assert.fail('No playback to pause'),
    },
    resolveTrack: async () => ({ persistentId: 'ABCDEF0123456789' }),
    volume: () => 70,
    isLive: () => false,
  });
  const session = 'preview-session-123';
  await assert.rejects(
    preview.command({
      action: 'start',
      session,
      remaining: 30000,
      position: 0,
    }),
    /kunde inte spelas/,
  );
  await assert.rejects(preview.command({ action: 'ping', session }), /stannat/);
  await preview.stop();
});
