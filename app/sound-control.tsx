'use client';
import { useEffect, useState } from 'react';
import { Mic2, Music2, Volume2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { MediaInput } from './media-input';
import { ShowSettings } from '@/lib/quiz';
function Level({
  label,
  value,
  onSave,
  disabled,
}: {
  label: string;
  value: number;
  onSave: (n: number) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="volume-level">
      <span>
        {label}
        <strong>{draft}%</strong>
      </span>
      <Slider
        aria-label={label}
        value={[draft]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={(v) => setDraft(Array.isArray(v) ? v[0] : v)}
        onValueCommitted={(v) => onSave(Array.isArray(v) ? v[0] : v)}
      />
    </label>
  );
}
export function SoundControl({
  settings,
  disabled,
  onChange,
  expanded = false,
}: {
  settings: ShowSettings;
  disabled: boolean;
  onChange: (p: Partial<ShowSettings>) => Promise<unknown>;
  expanded?: boolean;
}) {
  const [error, setError] = useState(''),
    [upload, setUpload] = useState('');
  const tracks =
    settings.bedTracks ?? (settings.bedAudio ? [settings.bedAudio] : []);
  const save = async (p: Partial<ShowSettings>) => {
    setError('');
    try {
      await onChange(p);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="sound-control">
      <div className={`talk-switch ${settings.talking ? 'talking' : ''}`}>
        <div>
          {settings.talking ? <Mic2 size={23} /> : <Volume2 size={23} />}
          <label htmlFor={expanded ? 'talk-expanded' : 'talk-live'}>
            <strong>
              {settings.talking ? 'Jag pratar' : 'Musiken i fokus'}
            </strong>
            <small>
              {settings.talking
                ? `${settings.talkVolume}% · pratnivå`
                : `${settings.musicVolume}% · musiknivå`}
            </small>
          </label>
        </div>
        <Switch
          id={expanded ? 'talk-expanded' : 'talk-live'}
          aria-label="Sänk till pratnivå"
          checked={settings.talking}
          disabled={disabled}
          onCheckedChange={(checked) => void save({ talking: checked })}
        />
      </div>
      <div className="volume-presets">
        <Level
          label="Musiknivå"
          value={settings.musicVolume}
          disabled={disabled}
          onSave={(n) => void save({ musicVolume: n })}
        />
        <Level
          label="Pratnivå"
          value={settings.talkVolume}
          disabled={disabled}
          onSave={(n) => void save({ talkVolume: n })}
        />
      </div>
      {expanded && (
        <div className="show-tracks">
          <h3>
            <Music2 size={18} />
            Ljud mellan frågorna
          </h3>
          <p className="muted small">
            Spelas från programledarens dator. Spara projektet för att ta med
            filerna till spelkvällen.
          </p>
          <div className="show-track">
            <div className="panel-heading">
              <strong>Bakgrund till poängtavlan</strong>
              <Switch
                aria-label="Spela bakgrundsspår på poängtavlan"
                checked={settings.bedEnabled}
                disabled={disabled}
                onCheckedChange={(v) => void save({ bedEnabled: v })}
              />
            </div>
            <p className="muted small">
              Nytt spår mellan frågorna, i blandad ordning utan direkt
              upprepning. Varje spår loopar tills nästa fråga har spelats.
            </p>
            {tracks.map((url, index) => (
              <div className="show-track" key={url}>
                <div className="panel-heading">
                  <strong>Bakgrundsspår {index + 1}</strong>
                  <button
                    className="icon-button"
                    aria-label={`Ta bort bakgrundsspår ${index + 1}`}
                    disabled={disabled || !!upload}
                    onClick={() =>
                      void save({ bedTracks: tracks.filter((t) => t !== url) })
                    }
                  >
                    <X size={18} />
                  </button>
                </div>
                {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Instrumental music preview. */}
                <audio src={url} controls preload="none" />
              </div>
            ))}
            <MediaInput
              kind="audio"
              label="Lägg till bakgrundsspår"
              disabled={disabled || !!upload || tracks.length >= 30}
              onBusyChange={(active) => setUpload(active ? 'bedTracks' : '')}
              onSelect={(url) =>
                onChange({ bedTracks: [...new Set([...tracks, url])] })
              }
            />
            <Level
              label="Bakgrundens volym"
              value={settings.bedVolume}
              disabled={disabled}
              onSave={(n) => void save({ bedVolume: n })}
            />
          </div>
          <div className="show-track">
            <strong>Ljudeffekt när tiden går ut</strong>
            {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Music playback/preview; the quiz displays question text and answers separately. */}
            <audio
              src={settings.closingAudio || '/sounds/times-up.wav'}
              controls
              preload="metadata"
            />
            <div className="row-actions">
              <MediaInput
                kind="audio"
                label="Välj egen ljudeffekt"
                disabled={disabled || !!upload}
                onBusyChange={(active) =>
                  setUpload(active ? 'closingAudio' : '')
                }
                onSelect={(url) => onChange({ closingAudio: url })}
              />
              {settings.closingAudio && (
                <button
                  className="button ghost"
                  disabled={disabled}
                  onClick={() => void save({ closingAudio: null })}
                >
                  Återställ standard
                </button>
              )}
            </div>
            <Level
              label="Effektens volym"
              value={settings.effectVolume}
              disabled={disabled}
              onSave={(n) => void save({ effectVolume: n })}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function QuickTalk({
  settings,
  disabled,
  onChange,
}: {
  settings: ShowSettings;
  disabled: boolean;
  onChange: (talking: boolean) => void;
}) {
  return (
    <div className={`quick-talk ${settings.talking ? 'talking' : ''}`}>
      <Mic2 size={21} />
      <label htmlFor="quick-talk-toggle">
        <strong>{settings.talking ? 'Pratnivå' : 'Musiknivå'}</strong>
        <small>
          {settings.talking ? settings.talkVolume : settings.musicVolume}%
        </small>
      </label>
      <Switch
        id="quick-talk-toggle"
        aria-label="Växla snabbt till pratnivå"
        checked={settings.talking}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
