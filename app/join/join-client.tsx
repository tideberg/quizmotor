'use client';
import { QuizTheme, QuizSymbol } from '../quiz-branding';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  LockKeyhole,
  Send,
  Trophy,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuiz } from '@/lib/use-quiz';
import {
  clockText,
  kindLabel,
  remember,
  remainingTime,
  questionPoints,
} from '@/lib/quiz';
import { Brand, Connection, Leaderboard, Offline } from '../quiz-shared';
export default function Join() {
  const { state, online, command, elapsed, forget } = useQuiz('team');
  const [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState(''),
    [draft, setDraft] = useState(''),
    [bet, setBet] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const r = state?.round,
    q = r?.question,
    me = state?.me;
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) setCode(code);
  }, []);
  const roundId = r?.id;
  useEffect(() => {
    setDraft(roundId ? remember(`quiz-draft-${roundId}`) : '');
    setBet(0);
    setError('');
  }, [roundId]);
  const run = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await command(action, payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const locked = !!me?.answer,
    remaining = r ? remainingTime(r, elapsed) : 0;
  const points = r ? questionPoints(r, elapsed) : 0;
  return (
    <div className="mobile-shell">
      <QuizTheme branding={state?.branding} />
      <header className="mobile-header">
        <Brand branding={state?.branding} />
        <Connection online={online} />
      </header>
      <main>
        {state && !me ? (
          <>
            <div className="join-heading">
              <QuizSymbol branding={state?.branding} />
              <p className="eyebrow accent">
                {state?.branding.subtitle.toUpperCase()}
              </p>
              <h1>{state.branding.joinTitle}</h1>
              <p className="muted">{state.branding.joinText}</p>
            </div>
            <section className="panel">
              <Tabs defaultValue="join">
                <TabsList className="quiz-tabs">
                  <TabsTrigger value="join">Nytt lag</TabsTrigger>
                  <TabsTrigger value="recover">Återanslut</TabsTrigger>
                </TabsList>
                <TabsContent value="join">
                  <form
                    className="join-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('join', { name, code });
                    }}
                  >
                    <label className="field">
                      Spelkod
                      <input
                        required
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Koden på storbilden"
                      />
                    </label>
                    <label className="field">
                      Vad heter ert lag?
                      <input
                        required
                        maxLength={40}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={state.branding.teamPlaceholder}
                        autoComplete="organization"
                      />
                    </label>
                    <button className="button full" disabled={busy || !online}>
                      Vi är med <ArrowRight size={18} />
                    </button>
                  </form>
                </TabsContent>
                <TabsContent value="recover">
                  <form
                    className="join-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('recoverTeam', { code, recovery });
                    }}
                  >
                    <label className="field">
                      Spelkod
                      <input
                        required
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      Lagets återställningskod
                      <input
                        required
                        maxLength={40}
                        value={recovery}
                        onChange={(e) => setRecovery(e.target.value)}
                        placeholder="Till exempel: varm-jord"
                        autoCapitalize="none"
                      />
                    </label>
                    <p className="muted">
                      Koden visas när ni ansluter. Programledaren kan också
                      hjälpa er.
                    </p>
                    <button className="button full" disabled={busy || !online}>
                      Hitta vårt lag <ArrowRight size={18} />
                    </button>
                  </form>
                </TabsContent>
              </Tabs>
            </section>
          </>
        ) : state && me ? (
          <>
            <div className="team-header">
              <div>
                <p className="eyebrow accent">ERT LAG</p>
                <h1>{me.name}</h1>
              </div>
              <span className="team-score">
                <Trophy size={18} />
                {me.score}
                <small>poäng</small>
              </span>
            </div>
            <Offline online={online} />
            {state.view === 'timesup' ? (
              <section className="panel mobile-timesup">
                <LockKeyhole />
                <h2>{state.branding.timesUpTitle.replaceAll('\n', ' ')}</h2>
                <p>Svaren är låsta. Nu räknar vi.</p>
                {me.answer && <p>Ert svar är sparat.</p>}
              </section>
            ) : state.view === 'leaderboard' ? (
              <section className="panel">
                <Leaderboard state={state} />
                {r?.status === 'closed' && (
                  <p className="notice">
                    {state.teams.length > 5
                      ? 'Övriga lag uppdateras tillsammans. Sedan visas topp 5 från femte till första plats.'
                      : 'Poängen visas från sista till första plats på storbilden.'}
                  </p>
                )}
                {me.answer && (
                  <div className="receipt" role="status">
                    <p>Ert svar: {me.answer.text}</p>
                    <strong>
                      {me.answer.correct === null
                        ? 'Väntar på rättning'
                        : me.answer.correct
                          ? `Rätt svar! +${me.answer.points} poäng`
                          : q?.kind === 'wager'
                            ? `Fel svar. −${me.answer.points} poäng`
                            : 'Fel svar. 0 poäng'}
                    </strong>
                  </div>
                )}
              </section>
            ) : !r || state.view === 'lobby' ? (
              <section className="panel waiting">
                <div className="waiting-mark">
                  <QuizSymbol branding={state?.branding} />
                </div>
                <h2>Ni är med i matchen.</h2>
                <p className="muted">
                  Prata ihop er, hitta lagkänslan.
                  <br />
                  Första frågan kommer på storbilden.
                </p>
                <div className="rule-list">
                  <p>
                    <Check size={17} /> Tidsfrågor: snabbare svar ger fler
                    poäng.
                  </p>
                  <p>
                    <Check size={17} /> Bonus: fasta poäng, tänk efter.
                  </p>
                  <p>
                    <Check size={17} /> Final: satsa innan frågan visas.
                  </p>
                </div>
              </section>
            ) : r.status === 'betting' ? (
              <section className="panel">
                <p className="eyebrow accent">{q!.title}</p>
                <h2 className="question-title">Nu höjer vi insatsen.</h2>
                <p className="muted">
                  Rätt svar ger er satsning i plus. Fel eller inget svar ger
                  lika mycket i minus.
                </p>
                {me.bet ? (
                  <div className="receipt">
                    <LockKeyhole />
                    <h3>{me.bet.amount} poäng satsade.</h3>
                    <p>Frågan avslöjas strax.</p>
                  </div>
                ) : (
                  <form
                    className="join-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('bet', { roundId: r.id, amount: bet });
                    }}
                  >
                    <label className="field">
                      Satsa 0–{Math.max(0, me.score)} poäng
                      <input
                        type="number"
                        required
                        min={0}
                        max={Math.max(0, me.score)}
                        value={bet}
                        onChange={(e) => setBet(Number(e.target.value))}
                      />
                    </label>
                    <button className="button full" disabled={busy || !online}>
                      <LockKeyhole size={18} /> Lås satsningen
                    </button>
                    <small className="muted">
                      Satsningen kan inte ändras när den har låsts.
                    </small>
                  </form>
                )}
              </section>
            ) : r.status === 'ready' ? (
              <section className="panel waiting">
                <QuizSymbol branding={state?.branding} />
                <p className="eyebrow">
                  FRÅGA {r.number} · {kindLabel[q!.kind]}
                </p>
                <h2>{state.branding.readyTitle}</h2>
                <p className="muted">Programledaren startar strax.</p>
              </section>
            ) : r.status === 'revealed' || r.status === 'closed' ? (
              <section className="panel answer-reveal">
                <p className="eyebrow">FACIT · FRÅGA {r.number}</p>
                <h2>{q!.answer}</h2>
                <p>{q!.explanation}</p>
                <div className="result-line">
                  {r.status === 'closed' ? (
                    <span>Väntar på rättning.</span>
                  ) : me.answer ? (
                    <>
                      <span>
                        {me.answer.correct
                          ? 'Rätt svar!'
                          : 'Inte rätt den här gången.'}
                      </span>
                      <strong>
                        {me.answer.correct
                          ? `+${me.answer.points}`
                          : q!.kind === 'wager'
                            ? `−${me.answer.points}`
                            : '0'}{' '}
                        p
                      </strong>
                    </>
                  ) : (
                    <span>Inget svar den här frågan.</span>
                  )}
                </div>
                {me.answer && (
                  <p className="small">Ert svar: {me.answer.text}</p>
                )}
              </section>
            ) : (
              <section className="panel answer-panel">
                <div className="panel-heading">
                  <span className="eyebrow">
                    {kindLabel[q!.kind]} · FRÅGA {r.number}
                  </span>
                  <span className="pill">
                    {r.status === 'paused' ? 'PAUS' : clockText(remaining)}
                  </span>
                </div>
                <h2 className="question-title">{q!.prompt}</h2>
                {r.hintVisible && q!.hint && (
                  <p className="notice">{q!.hint}</p>
                )}
                {q!.picture && (
                  <img
                    className="clue-image"
                    src={q!.picture}
                    alt="Frågans bild"
                  />
                )}
                {r.visibleCues?.map((c) => (
                  <div className="phone-cue" key={c.id}>
                    {c.text && <p>{c.text}</p>}
                    {c.image && (
                      <img
                        className="clue-image"
                        src={c.image}
                        alt="Bildledtråd"
                      />
                    )}
                    {c.video && (
                      <video
                        className="clue-image"
                        src={c.video}
                        muted
                        controls
                        playsInline
                      />
                    )}
                  </div>
                ))}
                {r.hintVisible && q!.image && (
                  <img
                    className="clue-image"
                    src={q!.image}
                    alt="Bildledtråd"
                  />
                )}
                {locked ? (
                  <div className="receipt" role="status">
                    <CheckCheck />
                    <h3>Svaret är låst.</h3>
                    <p className="submitted-answer">{me.answer!.text}</p>
                    <strong>
                      {me.answer!.points} poäng{' '}
                      {q!.kind === 'wager' ? 'satsade' : 'vid rätt svar'}
                    </strong>
                    <small>
                      Kvittot betyder att svaret är sparat på quizdatorn.
                    </small>
                  </div>
                ) : (
                  <form
                    className="join-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('answer', { roundId: r.id, text: draft });
                    }}
                  >
                    <label className="field">
                      Ert svar
                      <textarea
                        required
                        maxLength={500}
                        rows={3}
                        value={draft}
                        disabled={busy}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          remember(`quiz-draft-${r.id}`, e.target.value);
                        }}
                        placeholder="Prata ihop er. Skriv ert svar här."
                      />
                    </label>
                    <button
                      className="button full"
                      disabled={
                        busy ||
                        !online ||
                        r.status !== 'running' ||
                        remaining <= 0 ||
                        !draft.trim()
                      }
                    >
                      <Send size={18} />
                      {busy
                        ? 'Väntar på kvitto…'
                        : r.status === 'paused'
                          ? 'Frågan är pausad'
                          : `Lås svar · ${q!.kind === 'wager' ? (me.bet?.amount ?? 0) : points} p`}
                    </button>
                    <small className="muted">
                      Ett låst svar kan inte ändras. Poängen bestäms när svaret
                      når quizdatorn.
                    </small>
                  </form>
                )}
              </section>
            )}
            <details className="recovery-details">
              <summary>Återanslutning & lagkod</summary>
              <p>Spara koden om ni behöver byta mobil:</p>
              <strong className="mono">{me.recovery}</strong>
              <p>Spelkod: {state.code}</p>
              <button className="button ghost" onClick={forget}>
                Till anslutningssidan
              </button>
            </details>
          </>
        ) : (
          <section className="loading-page">
            <QuizSymbol branding={state?.branding} />
            <h1>Hittar rummet…</h1>
            <p className="muted">
              Kontrollera att ni är på samma wifi som quizdatorn.
            </p>
          </section>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>{state?.branding.teamFooter}</span>
        </footer>
      </main>
    </div>
  );
}
