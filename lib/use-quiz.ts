'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, CommandResult, QuizState, randomId, remember } from './quiz';
export function useQuiz(role: 'host' | 'team' | 'screen') {
  const [state, setState] = useState<QuizState | null>(null),
    [online, setOnline] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(0),
    [ready, setReady] = useState(false);
  const controller = useRef(''),
    received = useRef(0),
    token = useRef(''),
    stateRef = useRef<QuizState | null>(null);
  const apply = useCallback((s: QuizState) => {
    if (
      stateRef.current?.id === s.id &&
      ((stateRef.current.revision ?? 0) > (s.revision ?? 0) ||
        (stateRef.current.revision === s.revision &&
          stateRef.current.serverNow > s.serverNow))
    )
      return;
    stateRef.current = s;
    received.current = performance.now();
    setState(s);
    setNow(performance.now());
    setOnline(true);
  }, []);
  const refresh = useCallback(async () => {
    const s = await api<QuizState>(
      `/api/state${role === 'host' ? '?view=host' : ''}`,
      {
        headers: {
          Authorization: `Bearer ${token.current}`,
          'X-Quiz-Controller': controller.current,
        },
        signal: AbortSignal.timeout(4000),
      },
    );
    apply(s);
    return s;
  }, [apply, role]);
  useEffect(() => {
    controller.current = randomId();
    token.current = role === 'team' ? remember('quiz-team') : '';
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!stopped) {
          setOnline(false);
          setError((e as Error).message);
        }
      }
      if (!stopped)
        timer = setTimeout(
          poll,
          stateRef.current?.round?.status === 'closed' ? 250 : 1000,
        );
    };
    const start = async () => {
      if (role === 'host')
        try {
          await api('/api/session', { method: 'POST', body: '{}' });
        } catch (e) {
          if (!stopped) setError((e as Error).message);
        }
      if (!stopped) {
        setReady(true);
        void poll();
      }
    };
    void start();
    const animation = setInterval(() => setNow(performance.now()), 150);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(animation);
    };
  }, [refresh, role]);
  const command = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const result = await api<CommandResult>(
        `/api/${role === 'host' ? 'host' : 'team'}/command`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.current}`,
            'X-Quiz-Controller': controller.current,
          },
          signal: AbortSignal.timeout(role === 'host' ? 60000 : 8000),
          body: JSON.stringify({ action, payload }),
        },
      );
      if (result.token) {
        token.current = result.token;
        remember('quiz-team', result.token);
      }
      if (result.state) apply(result.state);
      else await refresh();
      return result;
    },
    [role, apply, refresh],
  );
  const r = state?.round;
  const elapsed = r
    ? Math.min(
        r.limitMs ?? r.question.duration * 1000,
        r.elapsedMs +
          (r.status === 'running' && online
            ? Math.max(0, now - received.current)
            : 0),
      )
    : 0;
  return {
    state,
    online,
    error,
    setError,
    ready,
    command,
    refresh,
    elapsed,
    controller,
    forget: () => {
      token.current = '';
      remember('quiz-team', '');
      void refresh();
    },
  };
}
