'use client';
import { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { api, QuizState } from '@/lib/quiz';

export function MusicPreparation({
  state,
  disabled,
  onRefresh,
  onBusy,
}: {
  state: QuizState;
  disabled: boolean;
  onRefresh: () => Promise<unknown>;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const cancelled = useRef(false);
  const running = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );
  const questions = (state.questions || []).filter(
    (q) =>
      q.audioSource === 'appleMusic' &&
      q.appleMusic &&
      !q.appleMusic.persistentId,
  );
  if (!questions.length && !status && !errors.length) return null;

  async function prepare() {
    if (running.current) return;
    running.current = true;
    cancelled.current = false;
    setBusy(true);
    onBusy(true);
    setErrors([]);
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const [index, question] of questions.entries()) {
        if (cancelled.current) break;
        setStatus(
          `${index + 1} av ${questions.length}: ${question.appleMusic!.name}`,
        );
        try {
          await api('/api/music', {
            method: 'POST',
            body: JSON.stringify({
              action: 'prepareQuestion',
              sessionId: state.id,
              projectId: state.projectId,
              questionId: question.id,
              track: question.appleMusic,
            }),
            signal: AbortSignal.timeout(180000),
          });
          completed++;
        } catch (error) {
          failures.push(`${question.title}: ${(error as Error).message}`);
          setErrors([...failures]);
          // A track-specific failure must not block unrelated songs. Stop when
          // the context or permissions have changed, or the server is unreachable.
          if (
            /Quizet har bytts|Hjälpmedel|Automatisering|Apples sökning svarar inte|Öppna Musik|Kunde inte bygga|Tillägget tog för lång tid|pågående frågan|Endast programledaren|Musik väntar|synkroniseringen|fick inte fokus|fetch|network|timeout|timed out|Anslutningen bröts/i.test(
              (error as Error).message,
            )
          )
            break;
        }
      }
      setStatus(
        `${completed} av ${questions.length} frågor kopplade.${cancelled.current ? ' Avbrutet efter aktuell låt.' : ''}${failures.length ? ` ${failures.length} kunde inte kopplas. Klara kopplingar är sparade; försök igen med de återstående.` : completed === questions.length ? ' Provspela låtarna före quizstart.' : ''}`,
      );
      await onRefresh();
    } catch (error) {
      setErrors([...failures, (error as Error).message]);
    } finally {
      running.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="panel below" aria-labelledby="music-preparation-title">
      <div className="panel-heading">
        <h2 id="music-preparation-title">
          <Music2 size={20} /> Koppla quizets låtar
        </h2>
        <span className="counter">{questions.length} okopplade</span>
      </div>
      <p className="muted">
        Knappen lägger till saknade låtar i ditt Musik-bibliotek och kopplar dem
        till frågorna. Låtar som redan finns återanvänds. Musik öppnas på Macen;
        låt appen arbeta färdigt. Ingen låt köps.
      </p>
      <div className="form-actions">
        <button
          className="button"
          disabled={disabled || busy || !questions.length}
          onClick={() => void prepare()}
        >
          Lägg till och koppla alla låtar
        </button>
        {busy && (
          <button
            className="button secondary"
            onClick={() => {
              cancelled.current = true;
              setStatus('Avbryter efter aktuell låt…');
            }}
          >
            Avbryt efter aktuell låt
          </button>
        )}
      </div>
      <p className="muted small">
        Första gången kan macOS kräva Automatisering och Hjälpmedel för
        terminalen som kör quizet. Spara projektet när kopplingarna är klara.
      </p>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {errors.map((error) => (
        <p key={error} className="notice error" role="alert">
          {error}
        </p>
      ))}
    </section>
  );
}
