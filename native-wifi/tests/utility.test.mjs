import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const executable = fileURLToPath(new URL('../build/Wifi nu.app/Contents/Resources/wifi-now', import.meta.url));
function query() {
  return new Promise((resolve, reject) => {
    execFile(executable, [], { timeout: 25000 }, (error, stdout, stderr) => {
      if (error && error.code !== 1) return reject(error);
      try {
        assert.equal(stderr, '');
        assert.equal(stdout.trim().split('\n').length, 1);
        const result = JSON.parse(stdout);
        if (process.env.WIFI_REQUIRE_SUCCESS === '1') {
          assert.equal(result.ok, true, `Expected real SSID and location, got: ${result.errors.join(', ')}`);
        }
        assert.equal(typeof result.ok, 'boolean');
        assert.ok(Array.isArray(result.errors));
        assert.ok(result.ssid === null || typeof result.ssid === 'string');
        assert.ok(Number.isFinite(Date.parse(result.timestamp)));
        assert.equal(error?.code ?? 0, result.ok ? 0 : 1);
        if (result.location !== null) {
          assert.ok(Math.abs(result.location.latitude) <= 90);
          assert.ok(Math.abs(result.location.longitude) <= 180);
          assert.ok(result.location.accuracyMeters >= 0);
          assert.ok(Math.abs(Date.now() - Date.parse(result.location.timestamp)) < 65000);
        }
        if (result.ok) {
          assert.notEqual(result.ssid, null);
          assert.notEqual(result.location, null);
          assert.deepEqual(result.errors, []);
        } else {
          assert.ok(result.errors.length > 0);
        }
        resolve(result);
      } catch (failure) { reject(failure); }
    });
  });
}

test('two concurrent utility instances return independent JSON and exit', { timeout: 30000 }, async () => {
  await Promise.all([query(), query()]);
});

test('a later utility instance retains authorization', { timeout: 30000 }, async () => {
  await query();
});
