import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuizError } from './engine.mjs';

export const defaultConnection = {
  ssid: '',
  automatic: true,
  security: 'manual',
  password: '',
  preferredUrl: '',
};

export function connectionUrls(interfaces, port, preferredUrl = '') {
  const urls = [
    ...new Set(
      Object.entries(interfaces)
        // Apple peer-to-peer interfaces cannot be used by guest phones.
        .filter(([name]) => !/^(awdl|llw|utun)/.test(name))
        .flatMap(([, addresses]) => addresses || [])
        .filter(
          (a) =>
            a.family === 'IPv4' &&
            !a.internal &&
            !a.address.startsWith('169.254.'),
        )
        .map((a) => `http://${a.address}:${port}/join/`),
    ),
  ];
  return urls.includes(preferredUrl)
    ? [preferredUrl, ...urls.filter((url) => url !== preferredUrl)]
    : urls;
}

export function validateConnection(input) {
  if (!input || typeof input !== 'object')
    throw new QuizError('Ogiltiga nätverksinställningar.');
  const { ssid, security, password = '', preferredUrl = '' } = input;
  const automatic = input.automatic ?? true;
  if (typeof automatic !== 'boolean')
    throw new QuizError('Ogiltigt val för automatiskt wifi.');
  if (
    typeof ssid !== 'string' ||
    (!ssid.trim() && !(automatic && ssid === '')) ||
    Buffer.byteLength(ssid) > 32 ||
    ssid
      .split('')
      .some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
  )
    throw new QuizError('Ange ett wifi-namn på högst 32 byte.');
  if (!['manual', 'open', 'wpa'].includes(security))
    throw new QuizError('Välj hur deltagarna ansluter till wifi.');
  if (
    typeof password !== 'string' ||
    (security === 'wpa' &&
      (password.length < 8 ||
        password.length > 63 ||
        /[^\x20-\x7e]/.test(password)))
  )
    throw new QuizError('Wifi-lösenordet ska innehålla 8–63 vanliga tecken.');
  if (
    typeof preferredUrl !== 'string' ||
    (preferredUrl &&
      !/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d+\/join\/$/.test(preferredUrl))
  )
    throw new QuizError('Välj en av datorns nätverksadresser.');
  return {
    ssid,
    automatic,
    security,
    password: security === 'wpa' ? password : '',
    preferredUrl,
  };
}

const escapeWifi = (value) => value.replace(/[\\;,:"]/g, '\\$&');
export function wifiPayload(settings) {
  if (!settings.ssid || settings.security === 'manual') return null;
  return `WIFI:T:${settings.security === 'open' ? 'nopass' : 'WPA'};S:${escapeWifi(settings.ssid)};${settings.security === 'wpa' ? `P:${escapeWifi(settings.password)};` : ''};`;
}

export function connectionInfo(settings, urls, code, host = false) {
  const joinUrl = urls[0]
    ? `${urls[0]}?code=${encodeURIComponent(code)}`
    : null;
  const wifi = wifiPayload(settings);
  const version = (value) =>
    createHash('sha256').update(value).digest('hex').slice(0, 16);
  return {
    ssid: settings.ssid,
    joinUrl,
    joinQr: joinUrl ? `/api/qr/join.svg?v=${version(joinUrl)}` : null,
    wifiQr: wifi ? `/api/qr/wifi.svg?v=${version(wifi)}` : null,
    ...(host
      ? {
          settings,
          preferredUnavailable:
            !!settings.preferredUrl && !urls.includes(settings.preferredUrl),
        }
      : {}),
  };
}

export function createConnectionSettings(directory) {
  const file = join(directory, 'connection.json');
  let current = existsSync(file)
    ? validateConnection(JSON.parse(readFileSync(file, 'utf8')))
    : { ...defaultConnection };
  return {
    get: () => ({ ...current }),
    save(input, urls) {
      const next = validateConnection(input);
      if (next.preferredUrl && !urls.includes(next.preferredUrl))
        throw new QuizError(
          'Adressen finns inte längre på datorn. Välj en aktuell nätverksadress.',
        );
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', {
        mode: 0o600,
      });
      renameSync(temporary, file);
      current = next;
      return this.get();
    },
  };
}
