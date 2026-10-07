import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectionInfo,
  connectionUrls,
  createConnectionSettings,
  defaultConnection,
  wifiPayload,
} from '../server/connection.mjs';

test('connection addresses exclude loopback, link-local and Apple peer-to-peer; chosen interface takes priority', () => {
  const address = (address, extra = {}) => ({
    address,
    family: 'IPv4',
    internal: false,
    ...extra,
  });
  const interfaces = {
    lo0: [address('127.0.0.1', { internal: true })],
    en0: [address('192.168.1.8'), address('fe80::1', { family: 'IPv6' })],
    en1: [address('10.0.0.8'), address('192.168.1.8'), address('169.254.1.2')],
    awdl0: [address('10.1.1.1')],
    utun0: [address('10.2.2.2')],
  };
  const preferred = 'http://10.0.0.8:4318/join/';
  assert.deepEqual(connectionUrls(interfaces, 4318, preferred), [
    preferred,
    'http://192.168.1.8:4318/join/',
  ]);
  assert.deepEqual(connectionUrls({}, 4318), []);
  const info = connectionInfo(
    { ...defaultConnection, preferredUrl: preferred },
    [],
    '123456',
    true,
  );
  assert.equal(info.joinQr, null);
  assert.equal(info.joinUrl, null);
  assert.equal(info.preferredUnavailable, true);
});

test('Wi-Fi payload supports open/WPA networks and escapes QR delimiters', () => {
  assert.equal(wifiPayload(defaultConnection), null);
  assert.equal(
    wifiPayload({ ...defaultConnection, ssid: 'Test wifi', security: 'open' }),
    'WIFI:T:nopass;S:Test wifi;;',
  );
  assert.equal(
    wifiPayload({
      ssid: 'Quiz; "wifi"',
      security: 'wpa',
      password: 'a:b,c;d\\e',
    }),
    'WIFI:T:WPA;S:Quiz\\; \\"wifi\\";P:a\\:b\\,c\\;d\\\\e;;',
  );
  const a = connectionInfo(
    defaultConnection,
    ['http://10.0.0.8:5173/join/'],
    '123456',
  );
  const b = connectionInfo(
    defaultConnection,
    ['http://10.0.0.8:5173/join/'],
    '654321',
  );
  assert.equal(a.joinUrl, 'http://10.0.0.8:5173/join/?code=123456');
  assert.notEqual(a.joinQr, b.joinQr, 'a new game must refresh the QR image');
});

test('network preferences persist separately from quiz projects and reject invalid changes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-connection-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createConnectionSettings(dir);
  const settings = {
    ...defaultConnection,
    automatic: false,
    ssid: 'Test wifi',
    security: 'wpa',
    password: 'guest-password',
  };
  store.save(settings, []);
  assert.deepEqual(createConnectionSettings(dir).get(), settings);
  assert.throws(
    () => store.save({ ...settings, ssid: 'å'.repeat(17) }, []),
    /wifi-namn/,
  );
  assert.throws(
    () => store.save({ ...settings, password: '' }, []),
    /lösenordet/,
  );
  assert.throws(
    () =>
      store.save(
        { ...settings, preferredUrl: 'http://10.0.0.8:4318/join/' },
        [],
      ),
    /Adressen/,
  );
  assert.deepEqual(
    store.get(),
    settings,
    'a rejected save preserves the previous settings',
  );
  store.save({ ...settings, security: 'open' }, []);
  assert.equal(store.get().password, '');
});

test('HTTP: host configures Wi-Fi, public splash gets local QR images and current game code', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-qr-http-'));
  const child = fork('server/server.mjs', [], {
    env: {
      ...process.env,
      PORT: '0',
      QUIZ_FRONTEND_PORT: '0',
      QUIZ_DATA_DIR: dir,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const [ready] = await once(child, 'message');
  const base = `http://localhost:${ready.port}`;
  const settings = {
    ...defaultConnection,
    automatic: false,
    ssid: 'Test wifi',
    security: 'wpa',
    password: 'guest-password',
  };
  const save = (cookie = '', origin = base) =>
    fetch(base + '/api/connection', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify(settings),
    });
  assert.equal((await save()).status, 401);
  assert.equal(
    (await fetch(base + '/api/connection/detect', { method: 'POST' })).status,
    401,
  );
  assert.equal((await fetch(base + '/api/qr/wifi.svg')).status, 404);
  const session = await fetch(base + '/api/session', { method: 'POST' });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await save(cookie, 'https://example.org')).status, 403);
  assert.equal((await save(cookie)).status, 200);
  const publicState = await (await fetch(base + '/api/state')).json();
  assert.equal(publicState.connection.ssid, 'Test wifi');
  assert.equal(publicState.connection.settings, undefined);
  assert.equal(JSON.stringify(publicState).includes(settings.password), false);
  const qr = await fetch(base + publicState.connection.wifiQr);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
  assert.equal(qr.headers.get('cache-control'), 'no-store');
  assert.match(await qr.text(), /<svg[^>]+viewBox=/);
  if (publicState.joinUrls.length) {
    assert.equal(
      new URL(publicState.connection.joinUrl).port,
      String(ready.port),
    );
    assert.equal(
      new URL(publicState.connection.joinUrl).searchParams.get('code'),
      publicState.code,
    );
    assert.equal(
      (await fetch(base + publicState.connection.joinQr)).status,
      200,
    );
  }
  const hostState = await (
    await fetch(base + '/api/state?view=host', { headers: { Cookie: cookie } })
  ).json();
  assert.deepEqual(hostState.connection.settings, settings);
});
