'use client';
import { useState } from 'react';
import { api } from '@/lib/quiz';
export function MediaInput({
  kind,
  label,
  disabled,
  onSelect,
  onBusyChange,
}: {
  kind: 'audio' | 'image' | 'video';
  label: string;
  disabled?: boolean;
  onSelect: (url: string) => void | Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function importFile(file?: File) {
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const result = await api<{ url: string }>(
        file
          ? `/api/upload?kind=${kind}&filename=${encodeURIComponent(file.name)}`
          : '/api/media/import',
        {
          method: 'POST',
          body: file || JSON.stringify({ url, kind }),
          signal: AbortSignal.timeout(180000),
        },
      );
      await onSelect(result.url);
      setUrl('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="media-input">
      <label className="button secondary file-button">
        {busy ? 'Kopierar fil…' : label}
        <input
          type="file"
          accept={
            kind === 'image'
              ? '.png,.jpg,.jpeg,.webp'
              : kind === 'audio'
                ? '.wav,.mp3,.m4a,.ogg,.aac,.flac'
                : '.mp4,.webm,.mov'
          }
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </label>
      <details>
        <summary>Hämta från länk</summary>
        <div className="media-url">
          <input
            aria-label={`Direktlänk till ${label.toLowerCase()}`}
            type="url"
            placeholder="https://…"
            value={url}
            disabled={disabled || busy}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={disabled || busy || !url.trim()}
            onClick={() => void importFile()}
          >
            Kopiera in fil
          </button>
        </div>
        <p className="muted small">
          En direktlänk till en fil. Filen sparas lokalt. Apple Music väljs i
          ljudinställningarna.
        </p>
      </details>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
