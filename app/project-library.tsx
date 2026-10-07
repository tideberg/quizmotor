'use client';
import { useEffect, useState } from 'react';
import { Download, FolderOpen, Save } from 'lucide-react';
import { MediaStatus } from './media-health';
import { MusicPreparation } from './music-preparation';
import { BrandingEditor } from './branding-editor';
import { QuizState, api, Project } from '@/lib/quiz';
export function ProjectLibrary({
  state,
  onRefresh,
  disabled,
  onReset,
  onBranding,
}: {
  onBranding: (branding: QuizState['branding']) => Promise<unknown>;
  state: QuizState;
  onRefresh: () => Promise<unknown>;
  disabled: boolean;
  onReset: () => void;
}) {
  const [name, setName] = useState(state.title),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const [musicBusy, setMusicBusy] = useState(false);
  disabled = disabled || musicBusy;
  const savedName =
    state.projects?.find((p) => p.id === state.projectId)?.name || state.title;
  useEffect(() => {
    setName(savedName);
  }, [state.projectId, savedName]);
  async function save(copy = false) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await api<{ project: Project }>('/api/projects/save', {
        method: 'POST',
        body: JSON.stringify({ name, copy }),
        signal: AbortSignal.timeout(180000),
      });
      await onRefresh();
      setStatus(`”${result.project.name}” är sparat med alla lokala filer.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(load: Project) {
    setBusy(true);
    setError('');
    try {
      await api('/api/projects/load', {
        method: 'POST',
        body: JSON.stringify({ id: load.id }),
        signal: AbortSignal.timeout(180000),
      });
      await onRefresh();
      setStatus(
        `”${load.name}” är öppnat. Lag och resultat sparas när du byter projekt.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = state.projects?.find((p) => p.id === state.projectId);
  return (
    <div className="project-library">
      <section
        className="panel project-picker"
        id="project-picker"
        tabIndex={-1}
        aria-labelledby="project-picker-title"
      >
        <div className="panel-heading">
          <h2 id="project-picker-title">
            <FolderOpen size={20} />
            Byt quiz
          </h2>
          <span className="counter">{state.projects?.length || 0}</span>
        </div>
        <p className="muted">
          Öppna ett sparat quiz. Dess texter och tema visas direkt i Regi, på
          storbilden och på lagens mobiler.
        </p>
        {!state.projects?.length ? (
          <p className="muted">
            Demoquizet är redan öppet. Spara det som ditt första projekt nedan.
            Sedan kan du skapa en kopia och göra quizet till ert eget.
          </p>
        ) : (
          state.projects.map((p) => (
            <div className="project-row" key={p.id}>
              <div>
                <h3>
                  {p.name}{' '}
                  {p.id === state.projectId && (
                    <span className="example-badge">ÖPPET</span>
                  )}
                </h3>
                <p className="muted">
                  {p.questionCount} frågor ·{' '}
                  {new Date(p.savedAt).toLocaleString('sv-SE')}
                </p>
              </div>
              <div className="row-actions">
                <a
                  className="button ghost"
                  href={`/api/projects/export?id=${p.id}`}
                >
                  <Download size={17} />
                  Hämta ZIP
                </a>
                <button
                  className="button secondary"
                  disabled={busy || disabled || p.id === state.projectId}
                  onClick={() => void open(p)}
                >
                  Öppna quiz
                </button>
              </div>
            </div>
          ))
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
        <p className="muted small below">
          På disk: en projektmapp med quiz.json och assets/. ZIP-filen
          innehåller samma struktur. Apple Music-låtar refereras till ditt
          bibliotek och kopieras inte som ljudfiler.
        </p>
      </section>
      <section className="panel below">
        <div className="panel-heading">
          <div>
            <p className="eyebrow accent">FRÅN IDÉ TILL QUIZKVÄLL</p>
            <h2 className="project-title">Spara aktuellt quiz.</h2>
          </div>
          <FolderOpen size={32} />
        </div>
        <p className="muted">
          Identitet, frågor, ledtrådar, bilder, filmer och showljud följer med
          projektet. Lag, resultat och pågående frågor sparas automatiskt för
          varje projekt. Byt tillbaka när du vill; pågående frågor pausas.
        </p>
        <p className="notice">
          {active
            ? 'Skapa ett eget quiz: skriv ett nytt namn och välj Spara som kopia. Har du testspelat, rensa resultaten längst ned först så att frågorna går att ändra. Redigera sedan under Frågorna och anpassa texter och tema här.'
            : 'Spara demoquizet först. Skriv sedan ett nytt namn och välj Spara som kopia för att bygga ert eget quiz med exempelfrågorna som mall.'}
        </p>
        <div className="project-save">
          <label className="field">
            Projektets namn
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              className="button"
              disabled={busy || disabled || !name.trim()}
              onClick={() => void save()}
            >
              <Save size={18} />
              {active ? 'Spara projekt' : 'Spara nytt projekt'}
            </button>
            {active && (
              <button
                className="button secondary"
                disabled={busy || disabled || !name.trim()}
                onClick={() => void save(true)}
              >
                Spara som kopia
              </button>
            )}
          </div>
        </div>
        <div className="project-save-status">
          <span className={`status ${state.projectDirty ? 'offline' : ''}`}>
            <span />
            {active
              ? state.projectDirty
                ? 'Ändringar i omgången · spara projektet'
                : `Projekt sparat ${new Date(state.projectSavedAt!).toLocaleString('sv-SE')}`
              : 'Omgången sparas automatiskt · projektet är ännu inte sparat'}
          </span>
        </div>
      </section>
      <MusicPreparation
        key={state.projectId || state.id}
        state={state}
        disabled={
          disabled ||
          busy ||
          ['running', 'paused'].includes(state.round?.status || '')
        }
        onRefresh={onRefresh}
        onBusy={setMusicBusy}
      />
      <MediaStatus
        health={state.mediaHealth}
        disabled={disabled || busy || state.round?.status === 'running'}
        onRefresh={onRefresh}
      />
      <BrandingEditor
        key={state.projectId || state.id}
        branding={state.branding}
        disabled={
          disabled ||
          busy ||
          (!!state.round && state.round.status !== 'revealed')
        }
        onSave={onBranding}
      />
      <section className="panel below">
        <h2>Börja om med samma lag</h2>
        <p className="muted">
          Rensa svar och poäng i det öppna projektet. Lag, spelkod och frågor
          behålls.
        </p>
        <button
          className="button danger below"
          disabled={busy || disabled}
          onClick={onReset}
        >
          Rensa resultat och börja om
        </button>
      </section>
    </div>
  );
}
