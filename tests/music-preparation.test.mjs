import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPreparation } from '../server/music-preparation.mjs';
import { createMusicBridge } from '../server/music.mjs';

const track = {
  persistentId: '',
  catalogId: '123',
  url: 'https://music.apple.com/se/song/123',
  name: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
};
const linked = { ...track, persistentId: 'ABCDEF0123456789' };
function setup({
  existing = [],
  afterAdd = [linked],
  delay = 0,
  addError,
  now,
} = {}) {
  const calls = [];
  let added = false,
    searches = 0;
  const preparation = createMusicPreparation({
    catalog: {
      lookup: async (url) => {
        calls.push(['lookup', url]);
        return track;
      },
    },
    music: {
      check: async () => ({ tracks: existing }),
      search: async () => ({
        tracks: added && searches++ >= delay ? afterAdd : existing,
      }),
      add: async (url) => {
        calls.push(['add', url]);
        if (addError) throw new Error(addError);
        added = true;
      },
    },
    sleep: async () => {},
    now,
  });
  return { ...preparation, calls };
}
test('existing matching library track is linked without adding anything', async () => {
  const p = setup({ existing: [linked] });
  assert.deepEqual(await p.prepare(track), linked);
  assert.equal(p.calls.filter(([action]) => action === 'add').length, 0);
});
test('explicit preparation adds exact catalog URL, waits for sync, then reuses it on retry', async () => {
  const p = setup({ delay: 2 });
  assert.deepEqual(await p.prepare(track), linked);
  assert.deepEqual(await p.prepare(track), linked);
  assert.deepEqual(
    p.calls.filter(([action]) => action === 'add'),
    [['add', track.url]],
  );
});
test('ambiguous library matches stop before mutation', async () => {
  const p = setup({
    existing: [linked, { ...linked, persistentId: '1111111111111111' }],
  });
  await assert.rejects(p.prepare(track), /Flera bibliotekslåtar/);
  assert.equal(
    p.calls.some(([action]) => action === 'add'),
    false,
  );
});
test('slow sync gets more than twelve polls without sending a second addition', async () => {
  const p = setup({ delay: 20 });
  assert.deepEqual(await p.prepare(track), linked);
  assert.equal(p.calls.filter(([action]) => action === 'add').length, 1);
});
test('retrying a pending sync does not repeat the library mutation within two minutes', async () => {
  let time = 0;
  const p = setup({ afterAdd: [], now: () => time });
  await assert.rejects(p.prepare(track), /synkroniseringen/);
  time = 60000;
  await assert.rejects(p.prepare(track), /synkroniseringen/);
  assert.equal(p.calls.filter(([action]) => action === 'add').length, 1);
  time = 121000;
  await assert.rejects(p.prepare(track), /synkroniseringen/);
  assert.equal(p.calls.filter(([action]) => action === 'add').length, 2);
});
test('another album is never linked after addition and a sync timeout is explicit', async () => {
  const p = setup({ afterAdd: [{ ...linked, album: 'Live' }] });
  await assert.rejects(
    p.prepare(track),
    /Tillägget skickades.*synkroniseringen/,
  );
  assert.equal(p.calls.filter(([action]) => action === 'add').length, 1);
});
test('permission failures propagate without claiming a successful link', async () => {
  await assert.rejects(
    setup({ addError: 'Hjälpmedel krävs' }).prepare(track),
    /Hjälpmedel/,
  );
});
test('valid existing persistent ID needs no catalog lookup', async () => {
  const p = setup({ existing: [linked] });
  assert.deepEqual(await p.prepare(linked), linked);
  assert.deepEqual(p.calls, []);
});
test('missing persistent ID can be repaired using its catalog URL', async () => {
  const p = setup();
  assert.deepEqual(
    await p.prepare({ ...linked, persistentId: '1111111111111111' }),
    linked,
  );
});
test('invalid URLs and unsupported platforms cannot start the native helper', async () => {
  let executed = false;
  const bridge = createMusicBridge({
    platform: 'linux',
    execute: async () => {
      executed = true;
    },
  });
  assert.throws(() => bridge.add('https://example.com/song/123'));
  await assert.rejects(bridge.add(track.url), /kräver.*Mac/);
  assert.equal(executed, false);
});

test('question preparation protects project identity and saves only a verified link', async () => {
  const question = {
    id: 'q1',
    title: 'Question',
    audioSource: 'appleMusic',
    appleMusic: track,
    offset: 12,
  };
  const state = {
    id: 'session',
    projectId: 'project',
    questions: [question],
    rounds: [],
  };
  const saved = [];
  const store = {
    export: () => structuredClone(state),
    command: (...args) => saved.push(args),
  };
  const request = {
    sessionId: state.id,
    projectId: state.projectId,
    questionId: question.id,
    track,
  };
  for (const patch of [
    { sessionId: 'other' },
    { projectId: 'other' },
    { questionId: 'missing' },
    { track: { ...track, catalogId: '456' } },
  ]) {
    const p = setup();
    await assert.rejects(p.prepareQuestion(store, { ...request, ...patch }));
    assert.deepEqual(p.calls, []);
  }
  assert.deepEqual(saved, []);
  const p = setup();
  assert.deepEqual(await p.prepareQuestion(store, request), { track: linked });
  assert.deepEqual(saved, [
    ['saveQuestion', { ...question, appleMusic: linked }],
  ]);
});
test('played questions and failed additions leave question data untouched', async () => {
  const question = { id: 'q1', audioSource: 'appleMusic', appleMusic: track };
  const state = {
    id: 'session',
    questions: [question],
    rounds: [{ question }],
  };
  const request = { sessionId: 'session', questionId: 'q1', track };
  const store = {
    export: () => state,
    command: () => assert.fail('must not save'),
  };
  const p = setup({ addError: 'permission denied' });
  await assert.rejects(
    p.prepareQuestion(store, request),
    /förberedd eller spelad/,
  );
  assert.deepEqual(p.calls, []);
  state.rounds = [];
  await assert.rejects(p.prepareQuestion(store, request), /permission denied/);
});
