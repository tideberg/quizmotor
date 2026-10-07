'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Crown, Radio, Trophy, X } from 'lucide-react';
import { QuizSymbol } from './quiz-branding';
import { QuizState, Branding } from '@/lib/quiz';
function AnimatedPoints({ value }: { value: number }) {
  const [display, setDisplay] = useState(value),
    previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      setDisplay(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display}</>;
}
export function GameDashboard({ state }: { state: QuizState }) {
  const teams = state.publicTeams || state.teams,
    positions = useRef(new Map<string, number>()),
    container = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const board = container.current,
      frame = viewport.current;
    if (!board || !frame || !frame.closest('.screen-main')) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      const available = frame.clientHeight;
      if (!available) return;
      board.style.zoom = '1';
      board.classList.toggle('board-compact', teams.length > 7);
      if (board.offsetHeight > available) board.classList.add('board-compact');
      // Measure at each scale: narrower type changes wrapping as well as height.
      if (board.offsetHeight > available) {
        let low = 0,
          high = 1;
        for (let i = 0; i < 12; i++) {
          const scale = (low + high) / 2;
          board.style.zoom = String(scale);
          if (board.offsetHeight * scale <= available - 1) low = scale;
          else high = scale;
        }
        board.style.zoom = String(low);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(board);
    void document.fonts.ready.then(fit);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [teams, state.round?.status, state.playedCount, state.completed]);
  useLayoutEffect(() => {
    const nodes =
      container.current?.querySelectorAll<HTMLElement>('[data-team]');
    nodes?.forEach((node) => {
      const id = node.dataset.team!,
        top = node.offsetTop,
        old = positions.current.get(id);
      if (
        old != null &&
        old !== top &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        node.animate(
          [
            { transform: `translateY(${old - top}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      positions.current.set(id, top);
    });
  }, [teams]);
  const complete = state.completed;
  const presenting =
    (state.round?.scorePresentationEndsAt ?? 0) > state.serverNow;
  const ungraded = teams.some(
    (t) => t.roundResult?.text && t.roundResult.correct === null,
  );
  return (
    <div className="board-fit" ref={viewport}>
      <section
        className={`game-dashboard ${teams.length > 7 ? 'board-compact' : ''}`}
        ref={container}
      >
        <div className="board-heading">
          <div>
            <p className="eyebrow">
              <Radio size={16} />{' '}
              {complete ? 'SLUTRESULTAT' : 'LIVE · POÄNGTAVLAN'}
            </p>
            <h2>
              {complete
                ? state.branding.finalTitle
                : state.branding.leaderboardTitle}
            </h2>
          </div>
          {state.branding.theme.symbol === 'audio' ? (
            <Trophy className="board-trophy" />
          ) : (
            <QuizSymbol branding={state.branding} className="board-trophy" />
          )}
        </div>
        <div className="board-meta">
          <span>{state.playedCount} frågor avgjorda</span>
          <span>
            {teams.length} lag
            {complete ? ' · tack för matchen' : ' · allt att spela för'}
          </span>
        </div>
        {state.round?.status === 'closed' && (
          <p className="pending-score">
            <span />{' '}
            {ungraded || presenting
              ? `Fråga ${state.round.number} · ${teams.length > 5 ? 'övriga lag tillsammans, sedan topp 5' : 'poäng från sista till första plats'}`
              : 'Alla poäng är fördelade · frågan är klar'}
          </p>
        )}
        {!teams.length ? (
          <p className="empty-board">Här tar lagen plats när de ansluter.</p>
        ) : (
          <div className="board-teams">
            {teams.map((t, i) => (
              <div
                className={`board-row place-${i} ${t.roundResult?.active ? 'board-row-active' : ''}`}
                data-team={t.id}
                key={t.id}
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                <span className="board-rank">
                  {i === 0 ? <Crown /> : String(i + 1).padStart(2, '0')}
                </span>
                <div className="board-team">
                  <strong>{t.name}</strong>
                  {t.roundResult && (
                    <p
                      className={`board-answer ${t.roundResult.correct === true ? 'answer-correct' : t.roundResult.correct === false ? 'answer-incorrect' : ''}`}
                      title={t.roundResult.text ?? 'Inget svar'}
                    >
                      {t.roundResult.correct === true ? (
                        <Check aria-label="Rätt svar" />
                      ) : t.roundResult.correct === false ? (
                        <X aria-label="Fel svar" />
                      ) : null}
                      <span>{t.roundResult.text ?? 'Inget svar'}</span>
                    </p>
                  )}
                </div>
                <div className="board-score">
                  <span className="board-score-value">
                    <AnimatedPoints value={t.score} />
                  </span>
                  {t.roundResult?.delta != null && (
                    <span
                      className={`board-delta ${t.roundResult.delta < 0 ? 'negative' : ''}`}
                    >
                      {t.roundResult.delta < 0 ? '−' : '+'}
                      {Math.abs(t.roundResult.delta)}
                    </span>
                  )}
                  <small>POÄNG</small>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="board-bottom">
          <span>
            {state.branding.brandName}
            <span>.</span>
          </span>
          <p>
            {complete
              ? state.branding.closingText
              : state.branding.intermissionText}
          </p>
        </div>
      </section>
    </div>
  );
}
export function TimesUp({ branding }: { branding: Branding }) {
  return (
    <section className="times-up">
      <span className="times-up-label">{branding.timesUpLabel}</span>
      <div className="times-up-title">
        {branding.timesUpTitle.split('\n').map((line, index) => (
          <span key={index}>
            {line.endsWith('!') ? (
              <>
                {line.slice(0, -1)}
                <span className="times-up-dot">!</span>
              </>
            ) : (
              line
            )}
          </span>
        ))}
      </div>
      <p>Svaren är låsta.</p>
      <div className="times-up-line" />
    </section>
  );
}
