'use client';
import {
  Check,
  Headphones,
  Maximize,
  Radio,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  QuizState,
  clockText,
  kindLabel,
  statusLabel,
  remainingTime,
  questionPoints,
} from '@/lib/quiz';
import { RoundMedia } from './round-media';
import { GameDashboard, TimesUp } from './game-dashboard';
import { WelcomeScreen } from './welcome-screen';
export { Brand } from './quiz-branding';
export function Connection({ online }: { online: boolean }) {
  return (
    <span className={`status ${online ? '' : 'offline'}`}>
      <span />
      {online ? 'Ansluten · sparas på datorn' : 'Återansluter…'}
    </span>
  );
}
export function Offline({ online }: { online: boolean }) {
  return online ? null : (
    <div className="notice error" role="alert">
      <WifiOff size={18} /> Kontakten är bruten. Vänta på anslutningen innan ni
      svarar. Sparade svar finns kvar.
    </div>
  );
}
export function Leaderboard({
  state,
  large = false,
}: {
  state: QuizState;
  large?: boolean;
}) {
  return (
    <div className={`scoreboard ${large ? 'large' : ''}`}>
      <div className="panel-heading">
        <h2>
          <Trophy size={22} />{' '}
          {state.completed
            ? 'Slutresultat'
            : large
              ? state.branding.leaderboardTitle
              : 'Ställningen'}
        </h2>
        <span className="muted">{state.playedCount} frågor avgjorda</span>
      </div>
      {!state.teams.length ? (
        <div className="empty-state">
          <Headphones />
          <h3>En scen som väntar på sina lag.</h3>
          <p>Anslut med mobilen för att vara med.</p>
        </div>
      ) : (
        state.teams.map((team, i) => (
          <div className="score-row" key={team.id}>
            <span className={`rank rank-${i}`}>{i + 1}</span>
            <strong>{team.name}</strong>
            <span className="score">
              {team.score}
              {team.roundResult?.delta != null && (
                <span className="mobile-score-delta">
                  {' '}
                  {team.roundResult.delta < 0 ? '−' : '+'}
                  {Math.abs(team.roundResult.delta)}
                </span>
              )}
              <small> p</small>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
export function Stage({
  state,
  elapsed,
  preview = false,
}: {
  state: QuizState;
  elapsed: number;
  preview?: boolean;
}) {
  const r = state.round,
    q = r?.question;
  const lobby = state.view === 'lobby' || !r;
  const hidden = r && ['ready', 'betting'].includes(r.status);
  const reveal = r?.status === 'revealed' || r?.status === 'closed';
  const remaining = r ? remainingTime(r, elapsed) : 120000;
  const points = r ? questionPoints(r, elapsed) : 100;
  if (state.view === 'timesup') return <TimesUp branding={state.branding} />;
  if (state.view === 'leaderboard') return <GameDashboard state={state} />;
  if (lobby) return <WelcomeScreen state={state} preview={preview} />;
  return (
    <section
      className={`stage ${r?.status === 'paused' ? 'paused' : ''} ${reveal ? 'reveal' : ''} ${r?.status === 'running' && remaining <= 10000 ? 'final-countdown' : ''}`}
    >
      <div className="stage-top">
        <span className="pill">
          <Radio size={14} />
          {statusLabel[r!.status].toUpperCase()}
        </span>
        <span className="eyebrow">
          {`${kindLabel[q!.kind]} · Fråga ${r!.number}`}
        </span>
      </div>
      <div className="stage-body">
        <p className="eyebrow">{q!.title}</p>
        <h2>
          {hidden
            ? r!.status === 'betting'
              ? 'Vad vågar ni satsa?'
              : state.branding.readyTitle
            : reveal
              ? q!.answer
              : q!.prompt}
        </h2>
        {hidden ? (
          <p>
            {r!.status === 'betting'
              ? 'Lås satsningen på mobilen. Frågan kommer strax.'
              : 'Frågan visas när programledaren trycker på play.'}
          </p>
        ) : reveal ? (
          <p>{q!.explanation}</p>
        ) : (
          <>
            <RoundMedia round={r!} elapsed={elapsed} />
            {r!.hintVisible && q!.hint && (
              <p className="clue">
                <span>LEDTRÅD</span>
                {q!.hint}
              </p>
            )}
            {r!.hintVisible && q!.image && (
              <img
                className="clue-image"
                src={q!.image}
                alt="Bildledtråd till frågan"
              />
            )}
            {r!.status === 'paused' && (
              <p>Tiden står still. Håll kvar era svar.</p>
            )}
            {r!.status === 'closed' && (
              <p>Håll i er. Programledaren rättar svaren.</p>
            )}
            {r!.status === 'running' && (
              <div className="sound-bars" aria-hidden="true">
                {[...Array(21)].map((_, i) => (
                  <i
                    key={i}
                    style={{
                      animationDelay: `${i * 0.08}s`,
                      height: `${12 + ((i * 17) % 35)}px`,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {r?.status === 'running' && remaining <= 10000 && remaining > 0 && (
        <div className="countdown-badge" key={Math.ceil(remaining / 1000)}>
          <strong>{Math.ceil(remaining / 1000)}</strong>
          <span>SEKUNDER KVAR</span>
        </div>
      )}
      <div className="stage-bottom">
        {lobby ? (
          <>
            <span>
              {state.teams.length} <small>lag i rummet</small>
            </span>
            <span className="mono">
              {state.code}
              <small>spelkod</small>
            </span>
          </>
        ) : hidden ? (
          <>
            <span>
              {r!.status === 'betting'
                ? state.teams.filter((t) => t.betLocked).length
                : state.teams.length}
              <small>
                {r!.status === 'betting' ? 'lag har satsat' : 'lag i rummet'}
              </small>
            </span>
            <span>
              {q!.kind === 'wager' ? '± er satsning' : `${q!.maxPoints} p`}
              <small>
                {q!.kind === 'bonus'
                  ? 'fasta poäng'
                  : q!.kind === 'wager'
                    ? 'rätt / fel'
                    : 'från start'}
              </small>
            </span>
          </>
        ) : reveal ? (
          <>
            <span>
              <Check size={26} /> Facit
            </span>
            <span>
              {state.teams.filter((t) => t.answered).length}
              <small>svar från lagen</small>
            </span>
          </>
        ) : (
          <>
            <span className="mono">
              {clockText(remaining)}
              <small>kvar</small>
            </span>
            <span>
              {q!.kind === 'wager' ? '± satsning' : `${points} p`}
              <small>
                {q!.kind === 'bonus' ? 'fast värde' : 'vid rätt svar'}
              </small>
            </span>
          </>
        )}
      </div>
      {!lobby && !hidden && !reveal && (
        <Progress
          aria-label="Tid kvar"
          value={(100 * remaining) / (q!.duration * 1000)}
          className="timer-progress"
        />
      )}
      {preview && (
        <span className="stage-caption">DET HÄR SER LAGEN PÅ STORBILDEN</span>
      )}
    </section>
  );
}
export function Fullscreen() {
  return (
    <button
      className="button ghost"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
    >
      <Maximize size={18} />
      <span>Helskärm</span>
    </button>
  );
}
