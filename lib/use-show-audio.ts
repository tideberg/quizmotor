'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QuizState } from './quiz';
import { createBedPlaylist } from './bed-playlist.mjs';
import {
  cancelVolumeFade,
  fadeOutAndPause,
  setSmoothVolume,
} from './audio-volume';

// Prepared questions are still hidden; stop the bed only when the question starts.
function isIntermission(state: QuizState) {
  return (
    (state.view === 'round' && state.round?.status === 'closed') ||
    state.view === 'leaderboard' ||
    (state.round != null &&
      ['revealed', 'ready', 'betting'].includes(state.round.status))
  );
}

export function useShowAudio(
  state: QuizState | null,
  online: boolean,
  onError: (message: string) => void,
) {
  const [starting, setStarting] = useState(false);
  const bed = useRef<HTMLAudioElement | null>(null),
    effect = useRef<HTMLAudioElement | null>(null),
    unlocked = useRef(false),
    played = useRef(''),
    stateRef = useRef(state);
  const playlist = useRef(createBedPlaylist());
  const lastBoundary = useRef<number | string>('initial');
  const selectBed = (s: QuizState) => {
    if (s.round?.closedAt) lastBoundary.current = s.round.closedAt;
    return playlist.current(
      s.show.bedTracks ?? (s.show.bedAudio ? [s.show.bedAudio] : []),
      lastBoundary.current,
    );
  };
  stateRef.current = state;
  useEffect(() => {
    bed.current = new Audio();
    bed.current.loop = true;
    effect.current = new Audio();
    return () => {
      if (bed.current) cancelVolumeFade(bed.current);
      bed.current?.pause();
      effect.current?.pause();
    };
  }, []);
  // A direct click authorizes each audio element; later intermissions can then play automatically.
  const unlock = useCallback(
    async (startQuestion = false) => {
      if (startQuestion) {
        setStarting(true);
        if (bed.current) await fadeOutAndPause(bed.current);
      }
      if (!unlocked.current) {
        const elements = [bed.current, effect.current].filter(
          Boolean,
        ) as HTMLAudioElement[];
        await Promise.all(
          elements.map(async (a) => {
            a.src = '/sounds/times-up.wav';
            a.volume = 0;
            try {
              await a.play();
              a.pause();
              a.currentTime = 0;
            } catch {}
          }),
        );
        unlocked.current = true;
      }
      const s = stateRef.current;
      if (
        !startQuestion &&
        !starting &&
        s?.controller &&
        isIntermission(s) &&
        (s.show.bedTracks?.length || s.show.bedAudio) &&
        s.show.bedEnabled &&
        bed.current
      ) {
        const track = selectBed(s);
        if (!track) return;
        if (bed.current.getAttribute('src') !== track) bed.current.src = track;
        setSmoothVolume(
          bed.current,
          (s.show.talking
            ? Math.min(s.show.bedVolume, s.show.talkVolume)
            : s.show.bedVolume) / 100,
        );
        try {
          await bed.current.play();
        } catch {
          onError('Bakgrundsspåret kunde inte spelas. Kontrollera filen.');
        }
      }
    },
    [onError, starting],
  );
  useEffect(() => {
    const b = bed.current,
      e = effect.current,
      s = state?.show;
    if (!b || !e || !s) return;
    if (!online || !state.controller) {
      b.pause();
      e.pause();
      return;
    }
    if (!starting)
      setSmoothVolume(
        b,
        (s.talking ? Math.min(s.bedVolume, s.talkVolume) : s.bedVolume) / 100,
      );
    e.volume = s.effectVolume / 100;
    const shouldBed =
      !starting &&
      isIntermission(state) &&
      s.bedEnabled &&
      (s.bedTracks?.length || s.bedAudio);
    if (shouldBed) {
      const track = selectBed(state);
      if (!track) return;
      if (b.getAttribute('src') !== track) {
        cancelVolumeFade(b);
        b.volume = 0;
        b.src = track;
        b.load();
      }
      if (b.paused)
        void b
          .play()
          .then(() =>
            setSmoothVolume(
              b,
              (s.talking ? Math.min(s.bedVolume, s.talkVolume) : s.bedVolume) /
                100,
            ),
          )
          .catch(() =>
            onError(
              'Bakgrundsljudet kunde inte starta. Aktivera ljudet i Regi och kontrollera filen.',
            ),
          );
    } else if (!starting) b.pause();
    const id = state.round?.id,
      closed = state.round?.closedAt;
    if (state.view === 'timesup' && id && closed && played.current !== id) {
      played.current = id;
      let seen = false;
      try {
        seen = sessionStorage.getItem(`quiz-effect-${id}`) === '1';
        sessionStorage.setItem(`quiz-effect-${id}`, '1');
      } catch {}
      if (!seen && state.serverNow - closed < 3200) {
        e.src = s.closingAudio || '/sounds/times-up.wav';
        void e
          .play()
          .catch(() =>
            onError('Ljudeffekten kunde inte starta. Svaren är stängda ändå.'),
          );
      }
    }
  }, [state, online, onError, starting]);
  return { unlock, finishStart: () => setStarting(false) };
}
