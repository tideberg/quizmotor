import test from 'node:test';
import assert from 'node:assert/strict';
import { createBedPlaylist } from '../lib/bed-playlist.mjs';
import { normalizeShow } from '../server/model.mjs';

test('shuffle visits every track, holds through snapshots, and avoids boundary repeats', () => {
  const pick = createBedPlaylist(() => 0.5);
  const tracks = ['a', 'b', 'c'];
  const played = [];
  for (let round = 0; round < 12; round++) {
    const track = pick(tracks, round);
    assert.equal(pick(tracks, round), track);
    assert.notEqual(track, played.at(-1));
    played.push(track);
  }
  for (let i = 0; i < 12; i += 3)
    assert.equal(new Set(played.slice(i, i + 3)).size, 3);
});

test('playlist handles removal, empty lists and a single looping track', () => {
  const pick = createBedPlaylist();
  assert.equal(pick(['a'], 1), 'a');
  assert.equal(pick(['a'], 2), 'a');
  assert.equal(pick(['b'], 2), 'b');
  assert.equal(pick([], 2), null);
  assert.equal(pick(['c'], 2), 'c');
});

test('old single-track settings migrate and new lists validate', () => {
  const url = '/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.wav';
  assert.deepEqual(normalizeShow({ bedAudio: url }).bedTracks, [url]);
  assert.deepEqual(
    normalizeShow({ bedAudio: url, bedTracks: [] }).bedTracks,
    [],
  );
  assert.deepEqual(normalizeShow({ bedTracks: [url, url] }).bedTracks, [url]);
  for (const bedTracks of [
    'bad',
    [null],
    ['https://example.com/music.mp3'],
    Array(31).fill(url),
  ])
    assert.throws(() => normalizeShow({ bedTracks }));
});
