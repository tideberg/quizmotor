import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWifiBridge,
  effectiveConnection,
  isConnectionScreen,
} from '../server/wifi.mjs';
import {
  defaultConnection,
  validateConnection,
  wifiPayload,
} from '../server/connection.mjs';

test('wifi bridge keeps SSID from partial location failure, drops coordinates, caches and clears failed reads', async () => {
  let now = 0;
  let calls = 0;
  const bridge = createWifiBridge({
    platform: 'darwin',
    now: () => now,
    execute: async (file, args, options) => {
      calls++;
      assert.equal(file, '/bin/sh');
      assert.match(args[0], /Contents\/Resources\/wifi-now$/);
      assert.equal(options.timeout, 25000);
      if (calls > 1)
        return {
          stdout: JSON.stringify({
            ssid: null,
            errors: ['permission_required'],
          }),
        };
      throw Object.assign(new Error('partial'), {
        code: 1,
        stdout: JSON.stringify({
          ssid: 'Mitt wifi',
          location: { latitude: 55, longitude: 13 },
          errors: ['location_timeout'],
        }),
      });
    },
  });
  const result = await bridge.refresh();
  assert.deepEqual(result, { ssid: 'Mitt wifi', checking: false, fault: '' });
  assert.deepEqual(bridge.get(), result);
  assert.equal(calls, 1);
  now = 30001;
  assert.equal(bridge.get().ssid, 'Mitt wifi');
  assert.equal(calls, 1, 'reading state after TTL must not launch the utility');
  const failed = await bridge.refreshIfNeeded();
  assert.equal(failed.ssid, '');
  assert.match(failed.fault, /platsåtkomst/);
  assert.equal(calls, 2);
});

test('automatic refresh is limited to the welcome stage and shared across visible clients', async () => {
  assert.equal(isConnectionScreen({ view: 'lobby', round: {} }), true);
  assert.equal(isConnectionScreen({ view: 'question', round: null }), true);
  for (const view of ['timesup', 'leaderboard', 'question']) {
    assert.equal(isConnectionScreen({ view, round: {} }), false);
  }
  assert.equal(isConnectionScreen({ view: 'leaderboard', round: null }), false);
  let calls = 0;
  const bridge = createWifiBridge({
    platform: 'darwin',
    execute: async () => {
      calls++;
      return { stdout: JSON.stringify({ ssid: 'Live wifi' }) };
    },
  });
  assert.equal(bridge.get().ssid, '');
  assert.equal(calls, 0);
  await bridge.refreshIfNeeded();
  await bridge.refreshIfNeeded();
  assert.equal(calls, 1);
});

test('overlapping refreshes launch one utility and malformed/non-mac responses have no fabricated SSID', async () => {
  let release;
  let calls = 0;
  const bridge = createWifiBridge({
    platform: 'darwin',
    execute: () => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const first = bridge.refresh();
  const second = bridge.refresh();
  release({ stdout: 'bad json' });
  assert.equal((await first).ssid, '');
  assert.match((await second).fault, /ogiltigt/);
  assert.equal(calls, 1);
  assert.match(
    (await createWifiBridge({ platform: 'linux' }).refresh()).fault,
    /Mac/,
  );
});

test('automatic defaults and legacy settings use live SSID without reusing another network password', () => {
  assert.equal(defaultConnection.ssid, '');
  assert.equal(defaultConnection.automatic, true);
  const legacy = validateConnection({
    ssid: 'Old guest',
    security: 'wpa',
    password: 'secret123',
    preferredUrl: '',
  });
  assert.equal(legacy.automatic, true);
  const current = effectiveConnection(legacy, { ssid: 'Current wifi' });
  assert.equal(current.ssid, 'Current wifi');
  assert.equal(current.password, '');
  assert.equal(wifiPayload(current), null);
  assert.equal(effectiveConnection(legacy, { ssid: '' }).ssid, '');
  assert.equal(
    effectiveConnection(legacy, { ssid: 'Old guest' }).password,
    'secret123',
  );
  assert.equal(
    effectiveConnection({ ...legacy, automatic: false }, null).ssid,
    'Old guest',
  );
});
