import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMusicCatalog,
  parseMusicUrl,
  matchingLibraryTracks,
} from '../server/music-catalog.mjs';
import { normalizeAppleTrack } from '../server/model.mjs';
import { createMusicBridge } from '../server/music.mjs';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';

const song = {
  kind: 'song',
  trackId: 1296697430,
  trackName: 'Over the Rainbow',
  artistName: "Israel Kamakawiwo'ole",
  collectionName: 'Album',
  trackTimeMillis: 211933,
};
test('song links use the track id, never the album id or user-controlled host', () => {
  assert.deepEqual(
    parseMusicUrl(
      'https://music.apple.com/se/album/over-the-rainbow/1296697429?i=1296697430&uo=4',
    ),
    {
      country: 'se',
      catalogId: '1296697430',
      url: 'https://music.apple.com/se/song/1296697430',
    },
  );
  for (const url of [
    'https://music.apple.com/se/album/1296697429',
    'https://music.apple.com.evil.test/se/song/1',
    'file:///etc/passwd',
    'https://music.apple.com@evil.test/se/song/1',
    'https://music.apple.com/se/song/1?i=oops',
  ])
    assert.throws(() => parseMusicUrl(url));
});
test('catalog search returns distinct versions and lookup is cached', async () => {
  const calls = [];
  const catalog = createMusicCatalog({
    fetcher: async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({
          results: [
            song,
            { ...song, trackId: 2, collectionName: 'Live' },
            { kind: 'feature-movie' },
          ],
        }),
      };
    },
  });
  const results = await catalog.search('Over the Rainbow');
  assert.equal(results.tracks.length, 2);
  assert.equal(calls[0].searchParams.get('limit'), '200');
  const found = await catalog.lookup(
    'https://music.apple.com/se/song/1296697430',
  );
  await catalog.lookup(
    'https://music.apple.com/se/album/album/123?i=1296697430',
  );
  assert.equal(calls.length, 2);
  assert.equal(found.persistentId, '');
  assert.equal(found.duration, 211.933);
  assert.deepEqual(normalizeAppleTrack(found), found);
  const validate = new Ajv({ strict: false }).compile(
    JSON.parse(
      readFileSync(
        new URL('../schemas/quiz-project.schema.json', import.meta.url),
      ),
    ),
  );
  const trackSchema = new Ajv({ strict: false }).compile(
    validate.schema.definitions.appleTrack,
  );
  assert.equal(trackSchema(found), true);
  assert.equal(
    trackSchema({ ...found, catalogId: undefined, url: undefined }),
    false,
  );
});
test('library linking does not silently select a different album or artist', () => {
  const catalog = {
    name: 'Song',
    artist: 'Singer',
    album: 'Studio',
    duration: 180,
  };
  const exact = {
    ...catalog,
    persistentId: 'ABCDEF0123456789',
    duration: 180.1,
  };
  assert.deepEqual(
    matchingLibraryTracks(catalog, [
      exact,
      { ...exact, artist: 'Other' },
      { ...exact, album: 'Live' },
      { ...exact, duration: 190 },
    ]),
    [exact],
  );
});
test('unavailable catalog songs and server errors produce useful failures', async () => {
  await assert.rejects(
    createMusicCatalog({
      fetcher: async () => ({ ok: true, json: async () => ({ results: [] }) }),
    }).lookup('https://music.apple.com/se/song/1'),
    /hittades inte/,
  );
  await assert.rejects(
    createMusicCatalog({ fetcher: async () => ({ ok: false }) }).search('song'),
    /svarar inte/,
  );
});
test('opening a catalog link passes a canonical URL as one argument', async () => {
  let args;
  const bridge = createMusicBridge({
    platform: 'darwin',
    execute: async (...values) => {
      args = values;
      return {};
    },
  });
  await bridge.openCatalog(
    'https://music.apple.com/se/album/name/123?i=1296697430',
  );
  assert.deepEqual(args.slice(0, 2), [
    '/usr/bin/open',
    ['-a', 'Music', 'https://music.apple.com/se/song/1296697430'],
  ]);
  assert.throws(
    () => bridge.openCatalog('https://example.com/'),
    /music.apple.com/,
  );
});
test('transient catalog timeout retries the read once and then gives a useful error', async () => {
  let calls = 0;
  const catalog = createMusicCatalog({
    fetcher: async () => {
      if (++calls === 1) throw new DOMException('timeout', 'TimeoutError');
      return { ok: true, json: async () => ({ results: [song] }) };
    },
  });
  assert.equal(
    (await catalog.lookup('https://music.apple.com/se/song/1296697430'))
      .catalogId,
    '1296697430',
  );
  assert.equal(calls, 2);
  let failures = 0;
  await assert.rejects(
    createMusicCatalog({
      fetcher: async () => {
        failures++;
        throw new TypeError('network');
      },
    }).search('song'),
    /Apples sökning svarar inte/,
  );
  assert.equal(failures, 2);
});
