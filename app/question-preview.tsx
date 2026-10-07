'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
/* oxlint-disable jsx-a11y/media-has-caption -- Quiz audio; question text and clues are displayed by Stage. */
import {
  Question,
  QuizState,
  Round,
  clockText,
  api,
  randomId,
} from '@/lib/quiz';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Stage } from './quiz-shared';

export function QuestionPreview({
  question,
  state,
  onClose,
}: {
  question: Question;
  state: QuizState;
  onClose: () => void;
}) {
  const [session] = useState(randomId);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const appleMusic = question.audioSource === 'appleMusic';
  const musicCommand = useCallback(
    (action: string, values = {}) => {
      const task = requests.current
        .catch(() => {})
        .then(() =>
          api('/api/question-preview', {
            method: 'POST',
            body: JSON.stringify({ session, action, ...values }),
            signal: AbortSignal.timeout(60000),
            keepalive: action === 'stop',
          }),
        );
      requests.current = task;
      return task;
    },
    [session],
  );
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<Round['status']>('ready');
  const [hintVisible, setHintVisible] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const duration = question.duration * 1000;
  const running = status === 'running';
  const cues = [...(question.cues || [])].sort((a, b) => a.at - b.at);
  const next = cues.find((cue) => cue.at * 1000 > elapsed);
  const source =
    question.audioSource === 'appleMusic'
      ? null
      : question.audio || question.video;

  useEffect(() => {
    mounted.current = true;
    const media = audio.current;
    return () => {
      mounted.current = false;
      media?.pause();
      if (appleMusic) void musicCommand('stop').catch(() => {});
    };
  }, [appleMusic, musicCommand]);

  useEffect(() => {
    if (!appleMusic) return;
    if (!running) {
      void musicCommand('stop').catch((e) => {
        if (mounted.current) setError(e.message);
      });
      return;
    }
    const heartbeat = window.setInterval(() => {
      void musicCommand('ping').catch((e) => {
        if (mounted.current) {
          setStatus('paused');
          setError(e.message);
        }
      });
    }, 3000);
    return () => window.clearInterval(heartbeat);
  }, [appleMusic, running, musicCommand]);

  async function togglePlayback() {
    if (running) {
      setStatus('paused');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (appleMusic) {
        await musicCommand('start', {
          track: question.appleMusic,
          position: question.offset + elapsed / 1000,
          remaining: duration - elapsed,
        });
      } else if (audio.current) {
        audio.current.currentTime = question.offset + elapsed / 1000;
        await audio.current.play();
      }
      if (mounted.current) setStatus('running');
    } catch (e) {
      if (mounted.current)
        setError(
          (e as Error).message || 'Musiken kunde inte starta. Försök igen.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const initial = elapsed;
    const timer = window.setInterval(() => {
      const value = Math.min(duration, initial + performance.now() - started);
      setElapsed(value);
      if (value >= duration) setStatus('paused');
    }, 100);
    return () => window.clearInterval(timer);
    // Rebase against the monotonic clock after each update and seek.
  }, [running, duration, elapsed]);

  useEffect(() => {
    const media = audio.current;
    if (!media) return;
    const sync = () => {
      const target = question.offset + elapsed / 1000;
      if (media.readyState >= 1 && Math.abs(media.currentTime - target) > 0.5)
        media.currentTime = Number.isFinite(media.duration)
          ? Math.min(target, media.duration)
          : target;
      if (running && !media.ended)
        void media
          .play()
          .catch(() =>
            setError(
              'Ljudet kunde inte spelas. Kontrollera filen och försök igen.',
            ),
          );
      else media.pause();
    };
    sync();
    media.addEventListener('loadedmetadata', sync);
    return () => media.removeEventListener('loadedmetadata', sync);
  }, [elapsed, running, question.offset]);

  function seek(value: number) {
    setStatus('paused');
    setElapsed(value);
  }
  const round: Round = {
    id: 'editor-preview',
    number: 1,
    question,
    status,
    elapsedMs: elapsed,
    hintVisible,
    visibleCues:
      status === 'ready' ? [] : cues.filter((cue) => cue.at * 1000 <= elapsed),
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="quiz-dialog question-preview-dialog">
        <DialogHeader>
          <DialogTitle>Prova frågan</DialogTitle>
          <DialogDescription>
            Dina osparade ändringar visas här. Tävlingen och lagens poäng
            påverkas inte.
          </DialogDescription>
        </DialogHeader>
        <div className="question-preview-controls">
          <button
            type="button"
            className="button"
            disabled={busy || elapsed >= duration || status === 'revealed'}
            onClick={() => void togglePlayback()}
          >
            {busy
              ? 'Startar musiken…'
              : running
                ? 'Pausa'
                : status === 'ready'
                  ? 'Starta frågan'
                  : 'Fortsätt'}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setStatus('ready');
              setElapsed(0);
              setHintVisible(false);
              setError('');
            }}
          >
            Börja om
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !next || status === 'revealed'}
            onClick={() => {
              if (next) seek(next.at * 1000);
            }}
          >
            Till nästa ledtråd
          </button>
          {(question.hint || question.image) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setHintVisible(!hintVisible)}
            >
              {hintVisible ? 'Dölj extraledtråd' : 'Visa extraledtråd'}
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              setStatus(status === 'revealed' ? 'paused' : 'revealed')
            }
          >
            {status === 'revealed' ? 'Tillbaka till frågan' : 'Visa facit'}
          </button>
        </div>
        <label className="field">
          Tid i frågan · {clockText(elapsed)} / {clockText(duration)}
          <input
            disabled={busy}
            type="range"
            min={0}
            max={duration}
            step={100}
            value={elapsed}
            onChange={(event) => seek(Number(event.target.value))}
          />
        </label>
        {question.audioSource === 'appleMusic' && (
          <p className="notice">
            Musiken spelas i Musik-appen på quizets Mac och följer provlägets
            start och paus.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {source && (
          <audio
            ref={audio}
            src={source}
            preload="auto"
            onError={() =>
              setError(
                'Ljudfilen kunde inte läsas. Kontrollera filen i editorn.',
              )
            }
          />
        )}
        <Stage
          state={{ ...state, view: 'question', round, teams: [] }}
          elapsed={elapsed}
          preview
        />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Tillbaka till editorn
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
