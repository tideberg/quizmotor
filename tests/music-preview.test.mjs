import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../scripts/music-control.js', import.meta.url),
  'utf8',
);
function preview({
  stalled = false,
  seekFailure = false,
  startupDelay = 0,
  action = 'preview',
  stallAfterSeek = false,
  seekDelay = 0,
} = {}) {
  let elapsed = 0,
    sought = false,
    pendingSeek = null;
  const volumeChanges = [];
  let seeks = 0;
  let state = 'stopped',
    position = 0,
    volume = 65,
    pauses = 0;
  const track = {
    persistentID: () => 'ABCDEF0123456789',
    name: () => 'Song',
    artist: () => 'Artist',
    duration: () => 200,
    album: () => 'Album',
  };
  const music = {
    running: () => true,
    libraryPlaylists: [{ tracks: { whose: () => () => [track] } }],
    currentTrack: () => track,
    playerState: () => state,
    stop: () => {
      state = 'stopped';
      position = 0;
    },
    play: () => {
      state = 'playing';
    },
    pause: () => {
      state = 'paused';
      pauses++;
    },
  };
  Object.defineProperty(music, 'soundVolume', {
    get: () => () => volume,
    set: (v) => {
      volume = v;
      volumeChanges.push({
        volume: v,
        elapsed,
        position,
        pending: !!pendingSeek,
      });
    },
  });
  Object.defineProperty(music, 'playerPosition', {
    get: () => () => position,
    set: (v) => {
      seeks++;
      if (seekDelay) pendingSeek = { at: elapsed + seekDelay, position: v };
      else position = seekFailure ? 0 : v;
      sought = true;
    },
  });
  const context = vm.createContext({
    Date: { now: () => elapsed * 1000 },
    Application: () => music,
    delay: (seconds) => {
      elapsed += seconds;
      if (pendingSeek && elapsed >= pendingSeek.at) {
        position = pendingSeek.position;
        pendingSeek = null;
      }
      if (
        !stalled &&
        !pendingSeek &&
        !(sought && stallAfterSeek) &&
        elapsed > startupDelay &&
        state === 'playing'
      )
        position += seconds;
    },
  });
  vm.runInContext(source, context);
  let result, error;
  try {
    result = JSON.parse(
      context.run([
        action,
        JSON.stringify({
          persistentId: track.persistentID(),
          position: seekDelay ? 0 : 35,
          volume: 90,
        }),
      ]),
    );
  } catch (e) {
    error = e;
  }
  return {
    result,
    error,
    state,
    volume,
    pauses,
    position,
    elapsed,
    volumeChanges,
    seeks,
  };
}
test('preview verifies progress, stops and restores volume', () => {
  const actual = preview();
  assert.equal(actual.result.ok, true);
  assert.equal(actual.state, 'paused');
  assert.equal(actual.volume, 65);
  assert.equal(actual.pauses, 1);
});
test('stalled playback fails and still stops and restores volume', () => {
  const actual = preview({ stalled: true });
  assert.match(actual.error.message, /kom inte igång/);
  assert.equal(actual.state, 'paused');
  assert.equal(actual.volume, 65);
});
test('failed seek stops preview and restores volume', () => {
  const actual = preview({ seekFailure: true });
  assert.match(actual.error.message, /rätt position/);
  assert.equal(actual.state, 'paused');
  assert.equal(actual.volume, 65);
});

test('slow streaming startup is awaited before seeking', () => {
  const actual = preview({ startupDelay: 12 });
  assert.equal(actual.result.ok, true);
  assert.ok(actual.elapsed >= 15);
  assert.ok(actual.position >= 38);
  assert.equal(actual.state, 'paused');
});
test('normal quiz playback also rejects a stalled start', () => {
  const actual = preview({ stalled: true, action: 'play' });
  assert.match(actual.error.message, /kom inte igång/);
  assert.equal(actual.state, 'paused');
  assert.equal(actual.volume, 65);
});
test('normal play starts at requested position only after verification', () => {
  const actual = preview({ action: 'play' });
  assert.equal(actual.result.ok, true);
  assert.ok(actual.position > 35 && actual.position < 36);
  assert.equal(actual.seeks, 1);
  const audible = actual.volumeChanges.filter((change) => change.volume > 0);
  assert.ok(audible.length > 5);
  assert.ok(audible[0].volume < 90);
  assert.ok(
    audible.every((change) => change.position > 35.15 && !change.pending),
  );
  assert.equal(actual.volume, 90);
  assert.equal(actual.state, 'playing');
});
test('a stall after seeking does not pass verification', () => {
  const actual = preview({ stallAfterSeek: true });
  assert.match(actual.error.message, /gick inte framåt/);
  assert.equal(actual.state, 'paused');
  assert.equal(actual.volume, 65);
});

test('play waits for a delayed streaming seek and progress after the position jumps back', () => {
  const actual = preview({ action: 'play', seekDelay: 1, startupDelay: 0 });
  assert.equal(actual.error, undefined);
  assert.equal(actual.result.ok, true);
  assert.equal(actual.state, 'playing');
  assert.ok(actual.elapsed >= 1.2);
  assert.equal(actual.seeks, 1);
  assert.ok(
    actual.volumeChanges
      .filter((change) => change.volume > 0)
      .every((change) => !change.pending && change.position > 0.15),
  );
});

test('library readiness check reads metadata without playback, volume changes or launching Music', () => {
  const track = {
    persistentID: () => 'ABCDEF0123456789',
    name: () => 'Song',
    artist: () => 'Artist',
    duration: () => 200,
    album: () => 'Album',
  };
  let running = true;
  const music = {
    running: () => running,
    libraryPlaylists: [
      {
        tracks: {
          whose:
            ({ persistentID }) =>
            () =>
              persistentID === track.persistentID() ? [track] : [],
        },
      },
    ],
  };
  const context = vm.createContext({ Application: () => music });
  vm.runInContext(source, context);
  const checked = JSON.parse(
    context.run([
      'check',
      JSON.stringify({ ids: [track.persistentID(), '1111111111111111'] }),
    ]),
  );
  assert.equal(checked.tracks.length, 1);
  assert.equal(checked.tracks[0].name, 'Song');
  running = false;
  assert.throws(
    () =>
      context.run(['check', JSON.stringify({ ids: [track.persistentID()] })]),
    /Öppna Musik/,
  );
});
