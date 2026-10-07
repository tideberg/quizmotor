'use client';
import { useState } from 'react';
import { Check, Music2, Search, ExternalLink } from 'lucide-react';
import { api, AppleTrack } from '@/lib/quiz';

const duration = (seconds: number) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const identity = (track: AppleTrack | null, offset: number) =>
  `${track?.persistentId}:${track?.catalogId}:${offset}`;

export function AppleMusicPicker({
  value,
  onChange,
  offset = 0,
}: {
  value: AppleTrack | null;
  offset?: number;
  onChange: (track: AppleTrack | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('catalog');
  const [tracks, setTracks] = useState<AppleTrack[]>([]);
  const [shown, setShown] = useState(20);
  const [limited, setLimited] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState('');
  const tested = value && verified === identity(value, offset);

  function choose(track: AppleTrack | null) {
    onChange(track);
    setVerified('');
    setError('');
    setStatus('');
  }
  async function call(action: string) {
    setBusy(action);
    setError('');
    setStatus('');
    if (action === 'preview') setVerified('');
    try {
      const post = <T,>(body: Record<string, unknown>) =>
        api<T>('/api/music', {
          method: 'POST',
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(action === 'prepare' ? 180000 : 60000),
        });
      if (action === 'preview' && value) {
        const result = await post<{ track: AppleTrack }>({
          action,
          track: value,
          position: offset,
        });
        onChange(result.track);
        setVerified(identity(result.track, offset));
      } else if ((action === 'resolve' || action === 'prepare') && value) {
        const track = await post<AppleTrack>({ action, track: value });
        onChange(track);
        setStatus('Låten är kopplad. Provspela för att kontrollera ljudet.');
      } else if (action === 'openCatalog' && value?.url) {
        await post({ action, url: value.url });
        setStatus(
          'Låten är öppnad i Musik. Välj låtens meny → Lägg till i bibliotek. Gå sedan tillbaka och koppla låten här.',
        );
      } else if (action === 'selection') {
        const track = await post<AppleTrack>({ action });
        choose(track);
        setStatus('Låten är kopplad. Provspela för att kontrollera ljudet.');
      } else if (action === 'search') {
        const result = await post<{ tracks: AppleTrack[]; limited?: boolean }>({
          action,
          query: query.trim(),
          source,
        });
        setTracks(result.tracks);
        setLimited(Boolean(result.limited));
        setShown(20);
        setSearched(true);
      } else {
        const result = await post<{ running: boolean }>({ action: 'status' });
        setStatus(
          result.running
            ? 'Musik-appen är ansluten. Provspela den valda låten för att kontrollera uppspelningen.'
            : 'Öppna Musik-appen på Macen och logga in på Apple Music.',
        );
      }
    } catch (e) {
      setError(
        (action === 'selection' && value
          ? 'Kunde inte hämta markeringen. Din valda låt finns kvar. '
          : '') + (e as Error).message,
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="apple-picker">
      <div className="panel-heading">
        <h2>
          <Music2 size={19} />
          Apple Music på din Mac
        </h2>
        <button
          type="button"
          className="text-button"
          disabled={!!busy}
          onClick={() => void call('status')}
        >
          Kontrollera anslutning
        </button>
      </div>
      <p className="muted small">
        Sök hos Apple eller klistra in en låtlänk. För att quizet ska kunna
        starta, pausa och söka i låten behöver den läggas till i
        Musik-biblioteket på Macen. Provspela före quizstart.
      </p>
      {value && (
        <>
          <div className={`selected-track ${tested ? '' : 'untested-track'}`}>
            {tested ? <Check /> : <Music2 />}
            <div>
              <strong>{value.name}</strong>
              <p>
                {value.artist} · {duration(value.duration)}
                {value.album ? ` · ${value.album}` : ''}
              </p>
              <p>
                {tested
                  ? 'Uppspelningen kontrollerad'
                  : value.persistentId
                    ? 'Kopplad · behöver provspelas'
                    : 'Vald från katalogen · behöver kopplas'}
              </p>
            </div>
            <button
              type="button"
              className="button ghost"
              disabled={!!busy}
              onClick={() => choose(null)}
            >
              Byt
            </button>
          </div>
          {!value.persistentId && (
            <p className="notice">
              ”Lägg till och koppla” lägger till den valda låten i ditt
              Musik-bibliotek om den saknas. Musik öppnas på Macen medan
              tillägget görs. Ingen låt köps.
            </p>
          )}
          <div className="music-actions">
            {!value.persistentId && value.url && (
              <button
                type="button"
                className="button"
                disabled={!!busy}
                onClick={() => void call('prepare')}
              >
                Lägg till och koppla
              </button>
            )}
            {value.url && (
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={() => void call('openCatalog')}
              >
                <ExternalLink size={17} />
                Öppna i Musik
              </button>
            )}
            {!value.persistentId && (
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={() => void call('resolve')}
              >
                Koppla från biblioteket
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={!!busy}
              onClick={() => void call('preview')}
            >
              Provspela 3 sekunder
            </button>
          </div>
          <p className="muted small">
            Spelar från {offset} sekunder på Macen och stannar automatiskt.
            Första starten kan ta upp till 25 sekunder medan låten laddas.
          </p>
          {tested && (
            <p className="notice" role="status">
              Provspelningen gick framåt och stoppades. Kontrollera också att
              ljudet hördes i rätt högtalare.
            </p>
          )}
        </>
      )}
      <div className="music-sources" aria-label="Var vill du söka?">
        <button
          type="button"
          className={`button ${source === 'catalog' ? 'primary' : 'secondary'}`}
          aria-pressed={source === 'catalog'}
          disabled={!!busy}
          onClick={() => {
            setSource('catalog');
            setTracks([]);
            setSearched(false);
          }}
        >
          Sök hos Apple
        </button>
        <button
          type="button"
          className={`button ${source === 'library' ? 'primary' : 'secondary'}`}
          aria-pressed={source === 'library'}
          disabled={!!busy}
          onClick={() => {
            setSource('library');
            setTracks([]);
            setSearched(false);
          }}
        >
          Mitt bibliotek
        </button>
      </div>
      <div className="music-search">
        <input
          aria-label={
            source === 'catalog'
              ? 'Artist, låttitel eller Apple Music-länk'
              : 'Sök i Musik-biblioteket'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!busy && query.trim()) void call('search');
            }
          }}
          placeholder={
            source === 'catalog'
              ? 'Artist, låttitel eller https://music.apple.com/…'
              : 'Artist eller låttitel'
          }
          maxLength={source === 'catalog' ? 2000 : 100}
          disabled={!!busy}
        />
        <button
          type="button"
          className="button secondary"
          disabled={!!busy || !query.trim()}
          onClick={() => void call('search')}
        >
          <Search size={17} />
          Sök
        </button>
      </div>
      {source === 'library' && (
        <button
          type="button"
          className="button secondary"
          disabled={!!busy}
          onClick={() => void call('selection')}
        >
          Använd markerad bibliotekslåt i Musik
        </button>
      )}
      {searched && (
        <p className="muted small" role="status">
          {tracks.length
            ? `${tracks.length} ${tracks.length === 1 ? 'träff' : 'träffar'}. Visar ${Math.min(shown, tracks.length)}.`
            : 'Inga träffar. Prova färre sökord eller en annan version av låten.'}
          {limited
            ? ' Förfina sökningen om rätt låt saknas; Apple visar högst 200 träffar.'
            : ''}
        </p>
      )}
      {tracks.length > 0 && (
        <>
          <div className="music-results" aria-label="Sökresultat">
            {tracks.slice(0, shown).map((t) => (
              <button
                key={t.persistentId || t.catalogId}
                type="button"
                className="music-result"
                disabled={!!busy}
                aria-pressed={
                  !!value &&
                  (t.catalogId
                    ? value.catalogId === t.catalogId
                    : value.persistentId === t.persistentId)
                }
                onClick={() => choose(t)}
              >
                <strong>{t.name}</strong>
                <span>
                  {t.artist} · {duration(t.duration)}
                </span>
                {t.album && <span>{t.album}</span>}
              </button>
            ))}
          </div>
          {shown < tracks.length && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setShown(shown + 20)}
            >
              Visa fler ({tracks.length - shown} kvar)
            </button>
          )}
        </>
      )}
      {busy && (
        <p className="muted small" role="status">
          {busy === 'preview'
            ? 'Förbereder och provspelar i Musik…'
            : busy === 'prepare'
              ? 'Lägger till och kopplar låten. Låt Musik arbeta färdigt…'
              : 'Väntar på Musik eller Apples sökning…'}
        </p>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
