'use client';
import { useId, useState } from 'react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, ConnectionSettings as Settings, QuizState } from '@/lib/quiz';

export function ConnectionSettings({
  state,
  online,
  onSaved,
}: {
  state: QuizState;
  online: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const saved = state.connection?.settings;
  const id = useId();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!saved) return null;
  const settings = draft || saved;
  const update = (value: Partial<Settings>) => {
    setDraft({ ...settings, ...value });
    setMessage('');
  };
  return (
    <details className="network-options connection-settings">
      <summary>Wifi och QR-koder</summary>
      <form
        className="join-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await api('/api/connection', {
              method: 'POST',
              body: JSON.stringify(settings),
            });
            await onSaved();
            setDraft(null);
            setMessage('Sparat. Startsidan visar de nya uppgifterna.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={settings.automatic}
              onChange={(e) => update({ automatic: e.target.checked })}
            />{' '}
            Använd quizdatorns aktuella wifi
          </span>
        </label>
        {settings.automatic && (
          <>
            <p className="muted" role="status">
              {state.connection?.detection?.checking
                ? 'Hämtar aktuellt nätverk…'
                : state.connection?.detection?.ssid
                  ? `Aktuellt wifi: ${state.connection.detection.ssid}`
                  : state.connection?.detection?.fault ||
                    'Hämta nätverket för att se datorns wifi.'}
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={!online || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const result = await api<{ ssid: string; fault: string }>(
                    '/api/connection/detect',
                    {
                      method: 'POST',
                      body: '{}',
                      signal: AbortSignal.timeout(30000),
                    },
                  );
                  if (result.fault) setError(result.fault);
                  if (result.ssid)
                    update({
                      ssid: result.ssid,
                      security:
                        result.ssid === settings.ssid
                          ? settings.security
                          : 'manual',
                      password:
                        result.ssid === settings.ssid ? settings.password : '',
                    });
                  await onSaved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Hämta aktuellt wifi
            </button>
          </>
        )}
        <label className="field" htmlFor={`${id}-ssid`}>
          {settings.automatic ? 'Wifi-namn för eventuell wifi-QR' : 'Wifi-namn'}
          <input
            id={`${id}-ssid`}
            required={!settings.automatic}
            maxLength={32}
            value={settings.ssid}
            onChange={(e) => update({ ssid: e.target.value })}
          />
        </label>
        <label className="field" htmlFor={`${id}-security`}>
          Anslutning till wifi
          <NativeSelect
            id={`${id}-security`}
            value={settings.security}
            onChange={(e) =>
              update({ security: e.target.value as Settings['security'] })
            }
          >
            <NativeSelectOption value="manual">
              Manuell anslutning / inloggningssida
            </NativeSelectOption>
            <NativeSelectOption value="open">
              Öppet nät · visa wifi-QR
            </NativeSelectOption>
            <NativeSelectOption value="wpa">
              Gemensamt lösenord · visa wifi-QR
            </NativeSelectOption>
          </NativeSelect>
        </label>
        {settings.security === 'wpa' && (
          <label className="field">
            Wifi-lösenord
            <input
              required
              type="password"
              autoComplete="off"
              minLength={8}
              maxLength={63}
              value={settings.password}
              onChange={(e) => update({ password: e.target.value })}
            />
            <span className="muted">
              Lösenordet delas med deltagarna via wifi-QR-koden.
            </span>
          </label>
        )}
        <label className="field" htmlFor={`${id}-address`}>
          Adress i quizets QR-kod
          <NativeSelect
            id={`${id}-address`}
            value={settings.preferredUrl}
            onChange={(e) => update({ preferredUrl: e.target.value })}
          >
            <NativeSelectOption value="">
              Automatisk nätverksadress
            </NativeSelectOption>
            {settings.preferredUrl &&
              !state.joinUrls?.includes(settings.preferredUrl) && (
                <NativeSelectOption value={settings.preferredUrl}>
                  Tidigare adress (ej tillgänglig)
                </NativeSelectOption>
              )}
            {state.joinUrls?.map((url) => (
              <NativeSelectOption value={url} key={url}>
                {url.replace('http://', '')}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <p className="muted">
          {settings.automatic
            ? 'Nätverksnamnet hämtas automatiskt var 30:e sekund medan anslutningsskärmen är synlig. Wifi-QR visas bara när dess sparade nätverksnamn matchar det aktuella nätverket.'
            : 'Anslut även quizdatorn till rätt nät.'}{' '}
          Prova quizlänken från en mobil på nätverket före start.
        </p>
        <button
          className="button secondary"
          disabled={!online || busy || !draft}
        >
          Spara nätverksinställningar
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {message && <output className="accent">{message}</output>}
      </form>
    </details>
  );
}
