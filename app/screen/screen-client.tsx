'use client';
import { QuizTheme } from '../quiz-branding';
import { QuestionFit } from './question-fit';
import { Users } from 'lucide-react';
import { useQuiz } from '@/lib/use-quiz';
import { Brand, Connection, Fullscreen, Offline, Stage } from '../quiz-shared';
export default function Screen() {
  const { state, online, elapsed } = useQuiz('screen');
  return (
    <div className="screen-shell">
      <QuizTheme branding={state?.branding} />
      <header className="topbar">
        <Brand branding={state?.branding} />
        <span className="eyebrow">
          {state?.branding.subtitle.toUpperCase()}
        </span>
        <Fullscreen />
      </header>
      <main className="screen-main">
        {state ? (
          <>
            <Offline online={online} />
            {state.round &&
            !['lobby', 'leaderboard', 'timesup'].includes(state.view) ? (
              <QuestionFit key={state.round.number}>
                <Stage state={state} elapsed={elapsed} />
              </QuestionFit>
            ) : (
              <Stage state={state} elapsed={elapsed} />
            )}
            {state.view !== 'lobby' && (
              <div className="screen-footer">
                <span>
                  <Users size={20} />
                  {state.teams.length} lag ·{' '}
                  {state.teams.filter((t) => t.answered).length} svar inne
                </span>
                <span>
                  Anslut på{' '}
                  <strong>
                    {state.joinUrls?.[0]
                      ?.replace('http://', '')
                      .replace(/\/$/, '') || 'Adressen hos programledaren'}
                  </strong>
                </span>
                <span>
                  Spelkod <strong className="mono">{state.code}</strong>
                </span>
              </div>
            )}
            {state.view === 'lobby' && state.teams.length > 0 && (
              <div className="team-pills">
                {state.teams.map((t) => (
                  <span key={t.id}>{t.name}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="loading-page">
            <h1>Snart är det dags.</h1>
            <p>Hämtar kvällens quiz…</p>
          </div>
        )}
      </main>
      <div className="screen-status">
        <Connection online={online} />
      </div>
    </div>
  );
}
