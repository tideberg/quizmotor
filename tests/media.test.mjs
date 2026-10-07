import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  createMediaHealth,
  checkLocalMedia,
  publicAddress,
  importMedia,
} from '../server/media.mjs';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-media-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const track = {
  persistentId: 'ABCDEF1234567890',
  name: 'Song',
  artist: 'Artist',
  duration: 200,
};
const data = () => ({
  questions: [
    {
      title: 'Fråga 1',
      audioSource: 'appleMusic',
      appleMusic: track,
      offset: 0,
    },
  ],
  show: {},
  branding: { logo: '/media/abc.png' },
});

test('startup checks files and caches one deduplicated, silent Music library check across clients', async (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'abc.png'), 'image');
  let calls = 0,
    now = 1000;
  const health = createMediaHealth(
    dir,
    {
      check: async (ids) => {
        calls++;
        assert.deepEqual(ids, [track.persistentId]);
        return { tracks: [track] };
      },
    },
    () => now,
  );
  const state = data();
  state.questions.push({ ...state.questions[0], title: 'Fråga 2' });
  health.refresh(state);
  await health.check(state);
  assert.equal(calls, 1);
  const report = health.refresh(state);
  assert.equal(report.localCount, 1);
  assert.deepEqual(report.issues, []);
  assert.equal(report.music.checked, 1);
  for (let i = 0; i < 100; i++)
    health.refresh({ ...state, show: { talking: !!(i % 2) } });
  assert.equal(calls, 1);
  now += 61000;
  health.refresh(state);
  assert.equal(calls, 1);
  now += 15 * 60000;
  await health.check(state);
  assert.equal(calls, 2);
  rmSync(join(dir, 'abc.png'));
  assert.equal(checkLocalMedia(state, dir).issues.length, 1);
});

test('unlinked, missing and invalid-offset streaming media stay visible as issues; failures are not playable claims', async (t) => {
  const dir = fixture(t),
    state = data();
  state.branding = {};
  state.questions[0].offset = 201;
  state.questions.push({
    title: 'Unlinked',
    audioSource: 'appleMusic',
    appleMusic: { ...track, persistentId: '' },
  });
  const health = createMediaHealth(dir, {
    check: async () => ({ tracks: [track] }),
  });
  const report = await health.check(state);
  assert.equal(report.music.issues.length, 2);
  assert.match(report.music.issues.join(' '), /startpunkten/);
  const failed = await createMediaHealth(dir, {
    check: async () => {
      throw new Error('Öppna Musik-appen');
    },
  }).check(state);
  assert.equal(failed.music.checked, 0);
  assert.match(failed.music.issues.join(' '), /Öppna Musik/);
  const missing = await createMediaHealth(dir, {
    check: async () => ({ tracks: [] }),
  }).check(state);
  assert.match(missing.music.issues.join(' '), /saknas/);
});

test('checks from a previous project cannot overwrite the current project report', async (t) => {
  const dir = fixture(t);
  let finish;
  const health = createMediaHealth(dir, {
    check: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const a = data();
  a.branding = {};
  health.refresh(a);
  const b = { questions: [], show: {}, branding: {} };
  health.refresh(b);
  finish({ tracks: [track] });
  await new Promise((resolve) => setImmediate(resolve));
  const report = health.refresh(b);
  assert.equal(report.music.checked, 0);
  assert.deepEqual(report.music.issues, []);
  assert.equal(report.checking, false);
});

test('media imports block local networks, credentials, insecure URLs and Apple streams', async (t) => {
  const dir = fixture(t);
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '2002:7f00:1::',
    '2001::1',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const url of [
    'file:///tmp/image.jpg',
    'http://example.com/a.jpg',
    'https://u:p@example.com/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://[::1]/a.jpg',
    'https://music.apple.com/se/song/123',
  ])
    await assert.rejects(importMedia(dir, { kind: 'image', url }));
});

test('direct links become local files; HTML, empty and interrupted downloads leave no partial media', async (t) => {
  const dir = fixture(t);
  const open =
    (chunks, mime = 'image/jpeg') =>
    async () => ({
      url: new URL('https://example.com/photo.jpeg'),
      response: Object.assign(Readable.from(chunks), {
        headers: { 'content-type': mime },
      }),
    });
  const saved = await importMedia(
    dir,
    { url: 'https://example.com/photo.jpeg', kind: 'image' },
    open([Buffer.from('photo')]),
  );
  assert.match(saved.url, /^\/media\/.+\.jpg$/);
  assert.equal(readFileSync(join(dir, saved.url.slice(7)), 'utf8'), 'photo');
  await assert.rejects(
    importMedia(
      dir,
      { url: 'x', kind: 'image' },
      open(['<html>'], 'text/html'),
    ),
    /direkt/,
  );
  await assert.rejects(
    importMedia(dir, { url: 'x', kind: 'image' }, open([])),
    /tom/,
  );
  async function* interrupted() {
    yield Buffer.from('partial');
    throw new Error('interrupted');
  }
  await assert.rejects(
    importMedia(dir, { url: 'x', kind: 'image' }, open(interrupted())),
    /interrupted/,
  );
  assert.equal(readdirSync(dir).length, 1);
});
