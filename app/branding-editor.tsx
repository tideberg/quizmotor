'use client';
import { useState } from 'react';
import type { Branding } from '@/lib/quiz';
import { brandingTextFields, themePresets } from '@/lib/branding.mjs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Brand } from './quiz-branding';
import { MediaInput } from './media-input';
export function BrandingEditor({
  branding,
  disabled,
  onSave,
}: {
  branding: Branding;
  disabled: boolean;
  onSave: (branding: Branding) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(branding),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(branding);
  const textField = (key: keyof typeof brandingTextFields) => (
    <label className="field" key={key}>
      {brandingTextFields[key].label}
      <textarea
        rows={key === 'welcomeText' ? 3 : 2}
        maxLength={brandingTextFields[key].max}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel below branding-editor">
      <div className="panel-heading">
        <div>
          <h2>Quizets identitet</h2>
          <p className="muted section-description">
            Sätt tonen på storbilden, i Regi och på lagens mobiler.
          </p>
        </div>
      </div>
      <fieldset disabled={disabled || busy || uploading}>
        <div className="branding-presets">
          {Object.entries(themePresets).map(([id, preset]) => (
            <button
              type="button"
              key={id}
              className="button secondary"
              onClick={() => {
                const { label: _label, ...theme } = preset;
                setDraft({ ...draft, theme: theme as Branding['theme'] });
              }}
            >
              <span
                className="theme-swatch"
                style={{ background: preset.accent }}
              />
              {preset.label}
            </button>
          ))}
        </div>
        <div
          className="branding-preview"
          style={{
            background: draft.theme.background,
            color: draft.theme.foreground,
            borderColor: draft.theme.accent,
          }}
        >
          <Brand branding={draft} />
          <p>{draft.subtitle}</p>
          <strong style={{ color: draft.theme.accent }}>
            {draft.welcomeTitle}
          </strong>
        </div>
        <div className="branding-grid">
          {(
            ['brandName', 'subtitle', 'welcomeTitle', 'welcomeText'] as const
          ).map(textField)}
        </div>
        <details>
          <summary>Färger, symbol och typografi</summary>
          <div className="branding-grid below">
            {Object.entries({
              background: 'Bakgrund',
              surface: 'Paneler',
              foreground: 'Text',
              muted: 'Sekundär text',
              accent: 'Accent / startskärm',
              board: 'Poängtavla',
              alert: 'Tiden är ute',
            }).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="color"
                  value={draft.theme[key as keyof Branding['theme']]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      theme: { ...draft.theme, [key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            {Object.entries({
              symbol: {
                audio: 'Ljudvågor',
                leaf: 'Löv',
                snowflake: 'Snöflinga',
                compass: 'Kompass',
                star: 'Stjärna',
              },
              typography: {
                sans: 'Rak',
                serif: 'Klassisk',
                mono: 'Skrivmaskin',
              },
              pattern: {
                diagonal: 'Diagonaler',
                dots: 'Prickar',
                stars: 'Stjärnljus',
                grid: 'Rutnät',
                none: 'Inget mönster',
              },
            }).map(([key, choices]) => (
              <label className="field" key={key}>
                {key === 'symbol'
                  ? 'Symbol'
                  : key === 'typography'
                    ? 'Rubrikstil'
                    : 'Bakgrundsmönster'}
                <Select
                  value={draft.theme[key as keyof Branding['theme']]}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      theme: { ...draft.theme, [key]: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(choices).map(([value, label]) => (
                      <SelectItem value={value} key={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>
        </details>
        <details>
          <summary>Texter genom hela quizet</summary>
          <div className="branding-grid below">
            {(
              Object.keys(
                brandingTextFields,
              ) as (keyof typeof brandingTextFields)[]
            )
              .filter(
                (key) =>
                  ![
                    'brandName',
                    'subtitle',
                    'welcomeTitle',
                    'welcomeText',
                  ].includes(key),
              )
              .map(textField)}
          </div>
        </details>
        <details>
          <summary>Logotyp och bakgrundsbild (valfritt)</summary>
          <p className="muted below">
            Tema och symbol räcker. För en egen bild: använd en textfri bild i
            liggande format, gärna 1920 × 1080. En logotyp kan vara en
            transparent PNG.
          </p>
          <div className="branding-grid below">
            {(['logo', 'backdrop'] as const).map((key) => (
              <div key={key}>
                <MediaInput
                  kind="image"
                  label={key === 'logo' ? 'Välj logotyp' : 'Välj bakgrundsbild'}
                  onBusyChange={setUploading}
                  onSelect={(url) =>
                    setDraft((prev) => ({ ...prev, [key]: url }))
                  }
                  disabled={disabled || busy || uploading}
                />
                {draft[key] && (
                  <>
                    <img
                      className="branding-thumbnail"
                      src={draft[key]}
                      alt={
                        key === 'logo' ? 'Quizets logotyp' : 'Quizets bakgrund'
                      }
                    />
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setDraft({ ...draft, [key]: null })}
                    >
                      Ta bort bilden
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
        <div className="form-actions below">
          <button
            type="button"
            className="button"
            disabled={!dirty}
            onClick={() => void save()}
          >
            {busy ? 'Sparar…' : 'Använd identiteten'}
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={!dirty}
            onClick={() => setDraft(branding)}
          >
            Ångra ändringar
          </button>
        </div>
      </fieldset>
      {dirty && (
        <p className="notice">
          Du har ändringar i identiteten som inte används ännu.
        </p>
      )}
      <p className="muted small below">
        Använd identiteten för att visa den på alla skärmar. Spara sedan
        projektet ovan för att ta med ändringarna i projektfilen.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
