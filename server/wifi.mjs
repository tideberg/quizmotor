import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const utility = fileURLToPath(
  new URL(
    '../native-wifi/build/Wifi nu.app/Contents/Resources/wifi-now',
    import.meta.url,
  ),
);
const validSSID = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 32 &&
  !value
    .split('')
    .some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    );

export function createWifiBridge({
  execute = promisify(execFile),
  platform = process.platform,
  now = Date.now,
} = {}) {
  let current = { ssid: '', fault: '', checking: false };
  let checkedAt = -Infinity;
  let pending;
  const snapshot = () => ({ ...current });
  function refresh(force = false) {
    if (pending) return pending;
    if (!force && now() - checkedAt < 30000) return Promise.resolve(snapshot());
    current = { ssid: '', fault: '', checking: true };
    pending = (async () => {
      try {
        if (platform !== 'darwin')
          throw new Error(
            'Automatisk wifi-avläsning kräver en Mac. Ange nätverket manuellt.',
          );
        let stdout;
        try {
          ({ stdout } = await execute('/bin/sh', [utility], {
            timeout: 25000,
            maxBuffer: 16384,
          }));
        } catch (error) {
          if (error.code === 1 && error.stdout) stdout = error.stdout;
          else
            throw new Error(
              'Kunde inte anropa Wifi nu. Kontrollera att appen är byggd och kan köras.',
            );
        }
        const result = JSON.parse(stdout);
        // Location is deliberately neither retained nor exposed in quiz state.
        if (!validSSID(result?.ssid)) {
          if (
            result?.errors?.includes('permission_required') ||
            result?.errors?.includes('location_services_disabled')
          )
            throw new Error(
              'Öppna Wifi nu och tillåt platsåtkomst. Hämta sedan nätverket igen.',
            );
          throw new Error(
            'Inget aktuellt wifi-nätverk kunde läsas. Kontrollera datorns wifi eller ange nätverket manuellt.',
          );
        }
        current = { ssid: result.ssid, fault: '', checking: false };
      } catch (error) {
        current = {
          ssid: '',
          fault:
            error instanceof SyntaxError
              ? 'Wifi nu gav ett ogiltigt svar.'
              : error.message,
          checking: false,
        };
      } finally {
        checkedAt = now();
      }
      return snapshot();
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  }
  return {
    get: snapshot,
    refreshIfNeeded: () => refresh(false),
    refresh: () => refresh(true),
  };
}

export function isConnectionScreen(state) {
  return (
    !['timesup', 'leaderboard'].includes(state.view) &&
    (state.view === 'lobby' || !state.round)
  );
}

export function effectiveConnection(settings, detected) {
  if (settings.automatic === false) return settings;
  const ssid = detected.ssid || '';
  // Never carry a saved password or open-network QR over to a different SSID.
  return ssid && ssid === settings.ssid
    ? { ...settings, ssid }
    : { ...settings, ssid, security: 'manual', password: '' };
}
