'use client';
import { useState } from 'react';
import { api, MediaHealth } from '@/lib/quiz';
export function MediaStatus({
  health,
  disabled,
  onRefresh,
}: {
  health?: MediaHealth;
  disabled: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function check() {
    setBusy(true);
    setError('');
    try {
      await api('/api/media/check', {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(60000),
      });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const issues = [...(health?.issues || []), ...(health?.music.issues || [])];
  return (
    <section className="panel below">
      <div className="panel-heading">
        <h2>Media inför spelkvällen</h2>
        <button
          type="button"
          className="button secondary"
          disabled={disabled || busy || health?.checking}
          onClick={() => void check()}
        >
          {busy || health?.checking ? 'Kontrollerar…' : 'Kontrollera media nu'}
        </button>
      </div>
      <p>
        {health
          ? `${health.localCount} lokala filer kontrollerade · ${health.music.checked} låtar hittade i Musik-biblioteket`
          : 'Mediekontrollen förbereds.'}
      </p>
      {!!health?.checkedAt && (
        <p className="muted small">
          Filer kontrollerade{' '}
          {new Date(health.checkedAt).toLocaleString('sv-SE')}
          {health.music.checkedAt
            ? ` · Musik-bibliotek ${new Date(health.music.checkedAt).toLocaleString('sv-SE')}`
            : ''}
        </p>
      )}
      {!!issues.length && (
        <ul className="notice error">
          {issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
      {!issues.length &&
        health &&
        !health.checking &&
        health.music.checkedAt !== null && (
          <p className="notice">
            Inga saknade filer eller bibliotekskopplingar hittades.
          </p>
        )}
      <p className="muted small below">
        Kontrollen spelar inget. En bibliotekskoppling bevisar inte att låten
        går att spela. Provspela varje låt i frågeredigeraren på quizdatorn före
        kvällen, särskilt om ni bytt dator eller ska spela utan internet.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
