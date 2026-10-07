'use client';
import { QuizTheme } from './quiz-branding';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CircleHelp,
  Download,
  Eye,
  FileAudio,
  Flag,
  FolderOpen,
  Timer,
  Lightbulb,
  ListMusic,
  LockKeyhole,
  Monitor,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Square,
  Trophy,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  api,
  kindLabel,
  Question,
  QuizState,
  randomId,
  Round,
} from '@/lib/quiz';
import { useQuiz } from '@/lib/use-quiz';
import { Brand, Connection, Leaderboard, Offline, Stage } from './quiz-shared';
import { QuestionEditor } from './question-editor';
import { SoundControl, QuickTalk } from './sound-control';
import { ConnectionSettings } from './connection-settings';
import { ProjectLibrary } from './project-library';
import { useShowAudio } from '@/lib/use-show-audio';
import { cancelVolumeFade, setSmoothVolume } from '@/lib/audio-volume';

function Review({
  round,
  state,
  onGrade,
  busy,
}: {
  round: Round;
  state: QuizState;
  onGrade: (roundId: string, teamId: string, correct: boolean) => void;
  busy: boolean;
}) {
  const ordered = [...(round.answers || [])].sort(
    (a, b) => a.submittedAt - b.submittedAt,
  );
  const accepting = ['running', 'paused'].includes(round.status);
  const next =
    round.status !== 'revealed'
      ? ordered.find((a) => a.correct === null)
      : null;
  const reviewAnswer = (a: (typeof ordered)[number]) => (
    <div
      className={`review-row ${a === next ? 'review-next' : ''}`}
      key={a.teamId}
    >
      <div>
        <strong>{state.teams.find((t) => t.id === a.teamId)?.name}</strong>
        <p>{a.text}</p>
        <small className="muted">
          {a.automatic
            ? 'Inget svar · '
            : `${(a.elapsedMs / 1000).toFixed(1)} s · `}
          {a.points} poäng{' '}
          {round.question.kind === 'wager' ? 'satsade' : 'vid rätt svar'}
        </small>
      </div>
      <div className="grade-buttons">
        <button
          className={`button ${a.correct === true ? '' : 'secondary'}`}
          disabled={busy || a.automatic}
          aria-pressed={a.correct === true}
          aria-label={`Godkänn svaret från ${state.teams.find((t) => t.id === a.teamId)?.name}`}
          onClick={() => onGrade(round.id, a.teamId, true)}
        >
          <Check size={18} /> Rätt
        </button>
        <button
          className={`button ${a.correct === false ? 'danger' : 'secondary'}`}
          disabled={busy || a.automatic}
          aria-pressed={a.correct === false}
          aria-label={`Underkänn svaret från ${state.teams.find((t) => t.id === a.teamId)?.name}`}
          onClick={() => onGrade(round.id, a.teamId, false)}
        >
          <X size={18} /> Fel
        </button>
      </div>
    </div>
  );
  return (
    <section className="panel below">
      <div className="panel-heading">
        <h2>
          <Check size={19} /> Rätta svar · {round.question.title}
        </h2>
        <span className="counter">
          {round.answers?.filter((a) => a.correct !== null).length} /{' '}
          {round.answers?.length}
        </span>
      </div>
      <div className="host-answer">
        <span className="eyebrow">FACIT · BARA FÖR DIG</span>
        <strong>{round.question.answer}</strong>
      </div>
      {round.status !== 'revealed' && (
        <p className="muted review-instruction">
          Rätta svaren i takt med att de kommer in, i valfri ordning. Du avgör
          vilka stavningar och svar som godkänns. Poängen visas först när svaren
          är stängda och du öppnar poängtavlan.
        </p>
      )}
      {next && (
        <div className="next-to-grade">
          <span className="eyebrow accent">NÄSTA LAG ATT RÄTTA</span>
          {reviewAnswer(next)}
        </div>
      )}
      {!round.answers?.length ? (
        <p className="muted">
          {accepting
            ? 'Väntar på de första svaren.'
            : 'Inga svar kom in på den här frågan.'}
        </p>
      ) : (
        <details className="review-all" open={!next}>
          <summary>Alla svar · ändra en rättning</summary>
          {ordered.filter((a) => a !== next).map(reviewAnswer)}
        </details>
      )}
      {state.teams
        .filter((t) => !round.answers?.some((a) => a.teamId === t.id))
        .map((t) => (
          <p className="missed-answer" key={t.id}>
            {t.name} · {accepting ? 'har inte svarat än' : 'inget svar'}
          </p>
        ))}
    </section>
  );
}

export default function Home() {
  const quiz = useQuiz('host');
  const { state, online, elapsed, command, refresh, controller } = quiz;
  const [tab, setTab] = useState('live'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<{ q: Question | null } | null>(null),
    [help, setHelp] = useState(false),
    [reset, setReset] = useState(false),
    [removeTeam, setRemoveTeam] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [removeError, setRemoveError] = useState(''),
    [adjustTeam, setAdjustTeam] = useState(''),
    [delta, setDelta] = useState(0),
    [reason, setReason] = useState(''),
    [adjustId, setAdjustId] = useState('');
  const [reviewRound, setReviewRound] = useState(''),
    [controlError, setControlError] = useState('');
  const projectPickerRequested = useRef(false);
  useEffect(() => {
    if (tab === 'projects' && projectPickerRequested.current) {
      document.getElementById('project-picker')?.focus();
      projectPickerRequested.current = false;
    }
  }, [tab]);
  const audio = useRef<HTMLAudioElement | null>(null),
    current = useRef(state),
    hasControl = useRef(false),
    claimStarted = useRef(false);
  current.current = state;
  const r = state?.round,
    q = r?.question;
  const showAudio = useShowAudio(state, online, setError);
  useEffect(() => {
    if (audio.current && state?.show)
      setSmoothVolume(
        audio.current,
        (state.show.talking ? state.show.talkVolume : state.show.musicVolume) /
          100,
      );
  }, [state?.show]);
  useEffect(
    () => () => {
      if (audio.current) cancelVolumeFade(audio.current);
    },
    [],
  );
  const claim = useCallback(
    async (takeover = false) => {
      try {
        await api('/api/control', {
          method: 'POST',
          headers: { 'X-Quiz-Controller': controller.current },
          body: JSON.stringify({ claim: true, takeover }),
        });
        hasControl.current = true;
        setControlError('');
        await refresh();
      } catch (e) {
        hasControl.current = false;
        setControlError((e as Error).message);
      }
    },
    [controller, refresh],
  );
  useEffect(() => {
    if (state?.host && !claimStarted.current) {
      claimStarted.current = true;
      void claim();
    }
  }, [state?.host, claim]);
  useEffect(() => {
    const pulse = setInterval(async () => {
      if (!hasControl.current) return;
      try {
        await api('/api/control', {
          method: 'POST',
          headers: { 'X-Quiz-Controller': controller.current },
          body: '{}',
          signal: AbortSignal.timeout(3500),
        });
      } catch (e) {
        hasControl.current = false;
        audio.current?.pause();
        setControlError((e as Error).message);
      }
    }, 2000);
    return () => clearInterval(pulse);
  }, [controller]);
  useEffect(() => {
    if (!online || !state?.controller || r?.status !== 'running') {
      audio.current?.pause();
    }
    if (!online && state?.controller && r?.status === 'running')
      void command('pause').catch(() => {});
    if (!state?.controller) hasControl.current = false;
  }, [online, state?.controller, r?.status, command]);
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      await command(action, payload);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function start(resume = false) {
    if (!r) return;
    setBusy(true);
    setError('');
    try {
      await showAudio.unlock(true);
      if (!hasControl.current) await claim();
      if (!hasControl.current)
        throw new Error('Aktivera ljudkontrollen och försök igen.');
      const a = audio.current;
      if (q?.audioSource !== 'appleMusic' && (q?.audio || q?.video) && a) {
        if (a.readyState < 1)
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              clearTimeout(timer);
              a.removeEventListener('loadedmetadata', ok);
              a.removeEventListener('error', bad);
            };
            const ok = () => {
              done();
              resolve();
            };
            const bad = () => {
              done();
              reject(
                new Error(
                  'Ljudfilen kan inte spelas. Kontrollera filen före start.',
                ),
              );
            };
            const timer = setTimeout(bad, 8000);
            a.addEventListener('loadedmetadata', ok, { once: true });
            a.addEventListener('error', bad, { once: true });
            a.load();
          });
        const at = (q.audio ? q.offset : 0) + (resume ? r.elapsedMs / 1000 : 0);
        if (Number.isFinite(a.duration) && at >= a.duration)
          throw new Error(
            'Startpunkten ligger efter ljudets slut. Stäng frågan eller välj en längre fil inför nästa omgång.',
          );
        a.currentTime = at;
        await a.play();
      }
      await command(resume ? 'resume' : 'start');
    } catch (e) {
      audio.current?.pause();
      await command('pause').catch(() => {});
      setError((e as Error).message);
    } finally {
      showAudio.finishStart();
      setBusy(false);
    }
  }
  // Optional browser-agent interface: same authenticated actions as the UI, no extra authority.
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_quiz_status',
      title: 'Läs quizets status',
      description:
        'Läs aktuell fråga, anslutna lag och ställning i programledarvyn.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => {
        const s = await refresh();
        return { view: s.view, round: s.round, teams: s.teams };
      },
    });
    register({
      name: 'save_quiz_question',
      title: 'Spara en quizfråga',
      description:
        'Skapa eller uppdatera en ospelad fråga i det aktuella quizet. Samma validering och sparning som frågeredigeraren.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          kind: { type: 'string', enum: ['music', 'bonus', 'wager'] },
          duration: { type: 'integer', minimum: 10, maximum: 600 },
          maxPoints: { type: 'integer', minimum: 1, maximum: 10000 },
          hint: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: [
          'title',
          'prompt',
          'answer',
          'kind',
          'duration',
          'maxPoints',
        ],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: Record<string, unknown>) => {
        const result = await command('saveQuestion', input);
        return { id: result.question!.id, title: result.question!.title };
      },
    });
    return () => lifecycle.abort();
  }, [command, refresh]);
  if (!state)
    return (
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <span className="eyebrow">PROGRAMLEDARE</span>
        </header>
        <main className="workspace loading-page">
          <h1>Snart kör vi.</h1>
          <p className="muted">
            {quiz.error || 'Öppnar den sparade tävlingen…'}
          </p>
          <p>
            Programledaren öppnar{' '}
            <a href="http://localhost:4318/">localhost:4318</a> på quizdatorn.
          </p>
          <a className="button" href="/join/">
            Jag är med i ett lag <ArrowUpRight size={17} />
          </a>
        </main>
      </div>
    );
  const remaining =
    state.questions?.filter(
      (q) => !state.rounds?.some((r) => r.question.id === q.id),
    ) || [];
  const final = remaining.find((q) => q.kind === 'wager');
  const finalPending = !!state.finalQuestionId && q?.kind !== 'wager';
  const next =
    state.completed || q?.kind === 'wager'
      ? undefined
      : state.finalQuestionId
        ? remaining.find((q) => q.id === state.finalQuestionId)
        : remaining.find((q) => q.kind !== 'wager') || final;
  const canPrepare = !r || r.status === 'revealed';
  const reviewed = state.rounds?.find((r) => r.id === reviewRound);
  const joinUrl = state.joinUrls?.[0] || '';
  const answers = state.teams.filter((t) => t.answered).length;
  const showDemoGuide =
    !state.playedCount &&
    !r &&
    !!state.questions?.length &&
    state.questions.every((question) => question.example);
  return (
    <div className="app-shell">
      <QuizTheme branding={state?.branding} />
      <header className="topbar">
        <Brand branding={state?.branding} />
        <span className="eyebrow">
          {state.branding.subtitle.toUpperCase()} · PROGRAMLEDARE
        </span>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => {
              if (tab === 'projects')
                document.getElementById('project-picker')?.focus();
              else {
                projectPickerRequested.current = true;
                setTab('projects');
              }
            }}
          >
            <FolderOpen size={18} /> Byt quiz
          </button>
          <button
            className="icon-button"
            aria-label="Kom igång och testa anslutningen"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={22} />
          </button>
          <a
            className="button secondary"
            href="/screen/"
            target="_blank"
            rel="noreferrer"
          >
            <Monitor size={18} /> Öppna storbild <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow accent">{state.branding.hostEyebrow}</p>
            <h1>{state.branding.hostTitle}</h1>
            <p className="muted">
              {state.title} <span className="separator">/</span>{' '}
              {state.playedCount} av {state.questionCount} frågor spelade
            </p>
          </div>
          <Connection online={online} />
        </div>
        <Offline online={online} />
        {!!(
          (state.mediaHealth?.issues.length || 0) +
          (state.mediaHealth?.music.issues.length || 0)
        ) && (
          <div className="notice error">
            <span>Media behöver kontrolleras före spel.</span>
            <button className="button ghost" onClick={() => setTab('projects')}>
              Visa mediestatus
            </button>
          </div>
        )}
        {state.recovered && (
          <div className="notice">
            Tävlingen har återställts efter en omstart. Alla sparade svar finns
            kvar. Kontrollera ljudet och fortsätt när du är redo.
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Stäng felmeddelandet"
              onClick={() => setError('')}
            >
              <X size={17} />
            </button>
          </div>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList className="quiz-tabs main-tabs">
            <TabsTrigger value="live">
              <Radio size={17} /> Regi
            </TabsTrigger>
            <TabsTrigger value="questions">
              <ListMusic size={17} /> Frågorna{' '}
              <span className="tab-count">{state.questionCount}</span>
            </TabsTrigger>
            <TabsTrigger value="projects">
              <FolderOpen size={17} />
              Quizprojekt
            </TabsTrigger>
            <TabsTrigger value="sound">
              <Volume2 size={17} />
              Showljud
            </TabsTrigger>
            <TabsTrigger value="scores">
              <Trophy size={17} /> Poäng & säkerhet
            </TabsTrigger>
          </TabsList>
          <TabsContent value="live">
            {showDemoGuide && (
              <section className="panel" aria-labelledby="demo-guide-title">
                <div className="panel-heading">
                  <h2 id="demo-guide-title">
                    <CircleHelp size={20} /> Tre frågor. Klart att prova.
                  </h2>
                  <span className="example-badge">DEMO</span>
                </div>
                <p className="muted">
                  Demoquizet fungerar direkt, utan ljudfiler eller
                  musikabonnemang. Du är i programledarvyn och styr hela
                  omgången härifrån.
                </p>
                <ol className="help-steps">
                  <li>
                    Öppna <strong>storbilden</strong> på projektorn eller i en
                    egen flik. Där ser lagen frågorna, QR-koden och poängen.
                  </li>
                  <li>
                    Lagen ansluter med en mobil per lag på samma wifi. Provar du
                    ensam kan du öppna en lagflik med knappen nedan.
                  </li>
                  <li>
                    Välj <strong>Förbered första frågan</strong> och sedan{' '}
                    <strong>Spela & starta frågan</strong>. Rätta svaren, stäng
                    dem och visa poängen innan du går vidare.
                  </li>
                </ol>
                <div className="control-buttons">
                  <a
                    className="button secondary"
                    href={`/join/?code=${state.code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Smartphone size={17} /> Prova som lag
                  </a>
                  <button
                    className="button secondary"
                    onClick={() => setTab('questions')}
                  >
                    <ListMusic size={17} /> Se exempelfrågorna
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => setTab('projects')}
                  >
                    <FolderOpen size={17} /> Skapa eget quiz
                  </button>
                </div>
              </section>
            )}
            <div className={`host-grid ${showDemoGuide ? 'below' : ''}`}>
              <div>
                <Stage state={state} elapsed={elapsed} preview />
                <section className="panel control-panel">
                  <div className="panel-heading">
                    <h2>
                      <Volume2 size={19} /> Du håller i taktpinnen
                    </h2>
                    <span
                      className={`status ${state.controller ? '' : 'offline'}`}
                    >
                      <span />
                      {state.controller
                        ? 'Ljudkontroll aktiv'
                        : 'Ljudkontroll inaktiv'}
                    </span>
                  </div>
                  {!state.controller && (
                    <div className="notice">
                      <span>
                        {controlError ||
                          'Aktivera ljudkontrollen i den här fliken.'}
                      </span>
                      <button
                        className="button secondary"
                        onClick={() => {
                          void showAudio.unlock();
                          void claim(true);
                        }}
                      >
                        Ta över ljudet
                      </button>
                    </div>
                  )}
                  {q && (
                    <p className="track-status">
                      <FileAudio size={17} />
                      {q.audioSource === 'appleMusic'
                        ? `Apple Music · ${q.appleMusic?.name || ''}`
                        : q.audio
                          ? 'Lokal ljudfil redo'
                          : q.video
                            ? 'Videons ljud'
                            : 'Ingen ljudfil · frågan spelas utan musik'}
                      {q.audio && q.offset > 0 && ` · start vid ${q.offset} s`}
                    </p>
                  )}
                  {state.show && (
                    <SoundControl
                      settings={state.show}
                      disabled={!online || busy}
                      onChange={(p) => command('showSettings', p)}
                    />
                  )}
                  {state.musicIntegration?.fault && (
                    <p className="notice error">
                      {state.musicIntegration.fault}
                    </p>
                  )}
                  <div className="control-buttons">
                    {canPrepare && next && (
                      <button
                        className="button"
                        disabled={busy || !online}
                        onClick={() => void run('prepare', { id: next.id })}
                      >
                        <Play size={18} />
                        {next.kind === 'wager'
                          ? 'Gå till final'
                          : r
                            ? 'Förbered nästa fråga'
                            : 'Förbered första frågan'}
                      </button>
                    )}
                    {canPrepare && !next && (
                      <button
                        className="button"
                        disabled={busy || !online}
                        onClick={() => void run('leaderboard')}
                      >
                        <Trophy size={18} />
                        Visa slutresultatet
                      </button>
                    )}
                    {r && ['ready', 'betting'].includes(r.status) && (
                      <button
                        className="button"
                        disabled={busy || !online}
                        onClick={() => void start()}
                      >
                        <Play size={18} />
                        {r.status === 'betting'
                          ? 'Stäng satsningar & starta'
                          : 'Spela & starta frågan'}
                      </button>
                    )}
                    {r && ['ready', 'betting'].includes(r.status) && (
                      <button
                        className="button ghost"
                        disabled={busy || !online || !!r.bets?.length}
                        onClick={() => void run('unprepare')}
                      >
                        Avbryt förberedelse
                      </button>
                    )}
                    {r?.status === 'running' && (
                      <button
                        className="button"
                        disabled={busy || !online}
                        onClick={() => {
                          audio.current?.pause();
                          void run('pause');
                        }}
                      >
                        <Pause size={18} />
                        Pausa musik & tid
                      </button>
                    )}
                    {r?.status === 'paused' && (
                      <button
                        className="button"
                        disabled={busy || !online}
                        onClick={() => void start(true)}
                      >
                        <Play size={18} />
                        Fortsätt musik & tid
                      </button>
                    )}
                    {r && ['running', 'paused'].includes(r.status) && (
                      <>
                        <button
                          className="button secondary"
                          disabled={busy || !online}
                          onClick={() => {
                            audio.current?.pause();
                            void run('close');
                          }}
                        >
                          <Square size={16} />
                          Stäng svaren
                        </button>
                        <button
                          className="button countdown-button"
                          disabled={
                            busy ||
                            !online ||
                            (r.limitMs ?? q!.duration * 1000) - elapsed <= 10000
                          }
                          onClick={() => void run('countdown')}
                        >
                          <Timer size={18} />
                          Sista 10 sekunderna
                        </button>
                        {!!q?.cues?.length && (
                          <button
                            className="button secondary"
                            disabled={
                              busy ||
                              !online ||
                              (r.visibleCues?.length || 0) >= q.cues.length
                            }
                            onClick={() => void run('nextCue')}
                          >
                            <Lightbulb size={18} />
                            Nästa ledtråd
                          </button>
                        )}
                        {(q?.hint || q?.image) && (
                          <button
                            className="button ghost"
                            disabled={busy || !online}
                            onClick={() => void run('hint')}
                          >
                            <Lightbulb size={18} />
                            {r.hintVisible ? 'Dölj ledtråd' : 'Visa ledtråd'}
                          </button>
                        )}
                      </>
                    )}
                    {r?.status === 'closed' && state.view !== 'leaderboard' && (
                      <button
                        className="button"
                        disabled={busy || !online || state.view === 'timesup'}
                        onClick={() => void run('leaderboard')}
                      >
                        <Trophy size={18} />
                        Gå till rättning och poäng
                      </button>
                    )}
                    {r?.status === 'closed' && state.view === 'leaderboard' && (
                      <button
                        className="button"
                        disabled={
                          busy ||
                          !online ||
                          r.answers?.some((a) => a.correct === null) ||
                          (r.scorePresentationEndsAt ?? 0) > state.serverNow
                        }
                        onClick={() => void run('reveal')}
                      >
                        <Eye size={18} />
                        Avsluta frågan
                      </button>
                    )}
                    {canPrepare && state.teams.length > 0 && (
                      <button
                        className="button secondary"
                        disabled={busy || !online}
                        onClick={() => void run('leaderboard')}
                      >
                        <Trophy size={18} />
                        Visa ställningen
                      </button>
                    )}
                    {canPrepare && state.view !== 'lobby' && (
                      <button
                        className="button ghost"
                        disabled={busy || !online}
                        onClick={() => void run('lobby')}
                      >
                        Visa startsidan
                      </button>
                    )}
                  </div>
                  {!state.completed && q?.kind !== 'wager' && (
                    <div className="final-control">
                      <div>
                        <strong>
                          <Flag size={17} />{' '}
                          {finalPending
                            ? 'Finalen står på tur'
                            : 'Redo för final?'}
                        </strong>
                        <p className="muted small">
                          {finalPending
                            ? canPrepare
                              ? 'Välj Gå till final när lagen är redo att satsa.'
                              : 'Avsluta och rätta aktuell fråga först. Välj sedan Gå till final.'
                            : final
                              ? `${final.title}. Resten av frågorna kan sparas till nästa gång.`
                              : 'Lägg till en fråga av typen Final under Frågorna.'}
                        </p>
                      </div>
                      {finalPending ? (
                        <button
                          className="button ghost"
                          disabled={busy || !online}
                          onClick={() => void run('cancelFinal')}
                        >
                          Fortsätt med frågorna
                        </button>
                      ) : (
                        !(canPrepare && next?.kind === 'wager') && (
                          <button
                            className="button secondary"
                            disabled={busy || !online || !final}
                            onClick={() => void run('goToFinal')}
                          >
                            <Flag size={17} />
                            {r &&
                            ['running', 'paused', 'closed'].includes(r.status)
                              ? 'Final efter den här frågan'
                              : 'Gå till final'}
                          </button>
                        )
                      )}
                    </div>
                  )}
                  {r?.status === 'betting' && (
                    <p className="muted small">
                      {state.teams.filter((t) => t.betLocked).length} /{' '}
                      {state.teams.length} lag har satsat. Lag som inte har
                      satsat får 0 när frågan börjar.
                    </p>
                  )}
                  {r?.status === 'closed' && (
                    <p className="muted small">
                      Facit visas efter TIME’S UP. Öppna poängtavlan för att
                      visa poängen: övriga lag tillsammans, sedan topp 5 från
                      femte till första plats. Rätta eventuella återstående svar
                      nedanför och avsluta när alla poäng har räknats ihop.
                    </p>
                  )}
                </section>
                {r &&
                  ['running', 'paused', 'closed', 'revealed'].includes(
                    r.status,
                  ) && (
                    <Review
                      round={r}
                      state={state}
                      busy={busy || !online}
                      onGrade={(roundId, teamId, correct) =>
                        void run('grade', { roundId, teamId, correct })
                      }
                    />
                  )}
              </div>
              <aside className="side-stack">
                <section className="panel join-panel">
                  <div className="panel-heading">
                    <h2>
                      <Smartphone size={19} /> Samla lagen
                    </h2>
                    <span className="counter">{state.teams.length}</span>
                  </div>
                  <p className="muted">
                    En mobil per lag på {state.connection?.ssid || 'samma wifi'}
                    . Startsidan visar instruktioner och QR-koder.
                  </p>
                  {state.connection?.preferredUnavailable && (
                    <p className="notice error">
                      Den valda adressen är inte längre tillgänglig. En ny
                      adress visas nu. Prova den på en mobil.
                    </p>
                  )}
                  {joinUrl ? (
                    <a
                      className="join-url mono"
                      href={`${joinUrl}?code=${state.code}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {joinUrl.replace('http://', '')}
                    </a>
                  ) : (
                    <p className="notice error">
                      Inget nätverk hittades. Anslut datorn till wifi.
                    </p>
                  )}
                  {(state.joinUrls?.length ?? 0) > 1 && (
                    <details className="network-options">
                      <summary>Fler nätverksadresser</summary>
                      {state.joinUrls?.slice(1).map((url) => (
                        <a
                          className="join-url mono"
                          key={url}
                          href={`${url}?code=${state.code}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {url.replace('http://', '')}
                        </a>
                      ))}
                    </details>
                  )}
                  <div className="empty-state compact">
                    <h3>Genrep med testlag</h3>
                    <p>
                      Fem eller sex lag svarar automatiskt i olika tempo. Cirka
                      80 % rätt, varierade finalsatsningar och ibland ett
                      uteblivet svar. Du rättar som vanligt.
                    </p>
                    {state.rehearsal?.count ? (
                      <>
                        <output>
                          {state.rehearsal.count} testlag ·{' '}
                          {state.rehearsal.enabled
                            ? 'simuleringen är igång'
                            : 'simuleringen är stoppad'}
                        </output>
                        <button
                          className="button secondary"
                          disabled={busy || !online}
                          onClick={() =>
                            run('rehearsal', {
                              enabled: !state.rehearsal?.enabled,
                            })
                          }
                        >
                          {state.rehearsal.enabled
                            ? 'Stoppa testsvaren'
                            : 'Återuppta testsvaren'}
                        </button>
                        <p>
                          Stoppa testsvaren och ta bort testlagen med
                          papperskorgen i laglistan nedan. Välj sedan Rensa
                          resultat och börja om under Poäng & säkerhet.
                        </p>
                      </>
                    ) : (
                      <div className="control-buttons">
                        {[5, 6].map((count) => (
                          <button
                            key={count}
                            className="button secondary"
                            disabled={busy || !online || !!state.round}
                            onClick={() =>
                              run('rehearsal', { enabled: true, count })
                            }
                          >
                            Starta {count} testlag
                          </button>
                        ))}
                        {!!state.round && (
                          <p>
                            Rensa resultat och börja om för att lägga till
                            testlag.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <ConnectionSettings
                    state={state}
                    online={online}
                    onSaved={refresh}
                  />
                  <div className="room-code">
                    <span className="eyebrow">SPELKOD</span>
                    <strong className="mono">{state.code}</strong>
                  </div>
                  {!state.teams.length ? (
                    <div className="empty-state compact">
                      <Radio />
                      <h3>Snart fylls rummet.</h3>
                      <p>Lagen dyker upp här när de ansluter.</p>
                    </div>
                  ) : (
                    <div className="team-list">
                      {state.teams.map((t) => (
                        <div className="team-line" key={t.id}>
                          <span
                            className={`team-indicator ${t.answered ? 'done' : ''}`}
                          >
                            {t.answered ? (
                              <Check size={14} />
                            ) : (
                              <Users size={14} />
                            )}
                          </span>
                          <strong>{t.name}</strong>
                          <small className={t.answered ? 'accent' : 'muted'}>
                            {r?.status === 'betting'
                              ? t.betLocked
                                ? 'Satsat'
                                : 'Väntar'
                              : t.answered
                                ? 'Svar inne'
                                : `${t.score} p`}
                          </small>
                          <button
                            className="icon-button"
                            aria-label={`Ta bort ${t.name}`}
                            title={`Ta bort ${t.name}`}
                            disabled={busy || !online || !state.controller}
                            onClick={() => {
                              setRemoveError('');
                              setRemoveTeam(t);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {r && (
                    <div className="answers-count">
                      <strong>
                        {answers} / {state.teams.length}
                      </strong>
                      <span>svar inne</span>
                    </div>
                  )}
                  <button className="text-button" onClick={() => setHelp(true)}>
                    Hjälp att komma igång <ArrowUpRight size={15} />
                  </button>
                </section>
                <section className="panel">
                  <h2>
                    <ShieldCheck size={19} /> Sparat, på riktigt.
                  </h2>
                  <p className="muted">
                    Svar, tider och poäng sparas på disk. Efter en omstart
                    fortsätter ni från pausat läge.
                  </p>
                  <a className="text-button" href="/api/backup">
                    <Download size={16} />
                    Hämta säkerhetskopia
                  </a>
                </section>
              </aside>
            </div>
            <section className="panel below">
              <div className="panel-heading">
                <h2>
                  <ListMusic size={20} /> Härnäst i körschemat
                </h2>
                <button
                  className="text-button"
                  onClick={() => setTab('questions')}
                >
                  Alla frågor <ArrowUpRight size={16} />
                </button>
              </div>
              {next ? (
                <div className="next-question">
                  <span className="question-number">
                    {String((state.questions?.indexOf(next) ?? 0) + 1).padStart(
                      2,
                      '0',
                    )}
                  </span>
                  <div>
                    <h3>{next.title}</h3>
                    <p className="muted">
                      {kindLabel[next.kind]} · {next.duration} sekunder ·{' '}
                      {next.kind === 'wager'
                        ? 'Satsade poäng'
                        : `${next.maxPoints} poäng`}
                      {next.example ? ' · Exempelfråga' : ''}
                    </p>
                  </div>
                  <span className="pill">
                    {next.audioSource === 'appleMusic'
                      ? 'APPLE MUSIC'
                      : next.audio
                        ? 'LJUD KLART'
                        : next.video
                          ? 'VIDEO'
                          : 'UTAN LJUD'}
                  </span>
                </div>
              ) : (
                <p className="muted">
                  {state.completed
                    ? `Quizet är avslutat. ${state.branding.closingText}`
                    : q?.kind === 'wager'
                      ? 'Finalen pågår. Därefter visas slutresultatet.'
                      : 'Inga fler frågor i körschemat.'}
                </p>
              )}
            </section>
          </TabsContent>
          <TabsContent value="questions">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <ListMusic size={20} /> Kvällens körschema
                  </h2>
                  <p className="muted section-description">
                    {state.branding.questionsText}
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() => setEditor({ q: null })}
                >
                  <Plus size={18} />
                  Ny fråga
                </button>
              </div>
              {state.questions?.some((q) => q.example) && (
                <p className="notice">
                  De tre startfrågorna är exempel. Byt till kvällens innehåll
                  och lägg in dina ljudfiler före fredag. Du kan provspela
                  exemplen utan musik.
                </p>
              )}
              <div className="question-list">
                {state.questions?.map((question, i) => {
                  const played = state.rounds?.some(
                    (r) => r.question.id === question.id,
                  );
                  const reservedFinal = state.finalQuestionId === question.id;
                  return (
                    <div className="question-row" key={question.id}>
                      <span className="question-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="question-info">
                        <h3>
                          {question.title}{' '}
                          {question.example && (
                            <span className="example-badge">EXEMPEL</span>
                          )}
                        </h3>
                        <p className="muted">
                          {kindLabel[question.kind]} · {question.duration} s ·{' '}
                          {question.kind === 'wager'
                            ? 'Satsade poäng'
                            : `${question.maxPoints} p`}{' '}
                          ·{' '}
                          {question.audioSource === 'appleMusic'
                            ? 'Apple Music'
                            : question.audio
                              ? 'Ljudfil klar'
                              : question.video
                                ? 'Video'
                                : 'Utan ljud'}{' '}
                          · {question.cues?.length || 0} tidsstyrda ledtrådar
                        </p>
                        <p className="question-prompt">{question.prompt}</p>
                      </div>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Flytta ${question.title} uppåt`}
                          disabled={busy || i === 0 || !online}
                          onClick={() =>
                            void run('moveQuestion', {
                              id: question.id,
                              direction: 'up',
                            })
                          }
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Flytta ${question.title} nedåt`}
                          disabled={
                            busy || i === state.questionCount - 1 || !online
                          }
                          onClick={() =>
                            void run('moveQuestion', {
                              id: question.id,
                              direction: 'down',
                            })
                          }
                        >
                          <ArrowDown size={17} />
                        </button>
                        {played ? (
                          <span className="pill">
                            {r?.question.id === question.id &&
                            r.status !== 'revealed'
                              ? 'AKTUELL'
                              : 'SPELAD'}
                          </span>
                        ) : (
                          <>
                            <button
                              className="button secondary"
                              disabled={busy || !online || reservedFinal}
                              onClick={() => setEditor({ q: question })}
                            >
                              <Pencil size={16} />
                              Redigera
                            </button>
                            <button
                              className="button ghost"
                              disabled={
                                busy ||
                                !canPrepare ||
                                !online ||
                                state.completed ||
                                (!!state.finalQuestionId && !reservedFinal)
                              }
                              onClick={async () => {
                                if (await run('prepare', { id: question.id }))
                                  setTab('live');
                              }}
                            >
                              <Play size={16} />
                              Välj
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </TabsContent>
          <TabsContent value="projects">
            <ProjectLibrary
              state={state}
              onReset={() => setReset(true)}
              onRefresh={refresh}
              onBranding={(branding) => command('branding', branding)}
              disabled={!online || busy}
            />
          </TabsContent>
          <TabsContent value="sound">
            <section className="panel show-sound-panel">
              <div className="panel-heading">
                <h2>
                  <Volume2 size={21} />
                  Musik, mikrofon & mellanspel
                </h2>
                <button
                  className="button secondary"
                  onClick={() => void showAudio.unlock()}
                >
                  Aktivera showljud
                </button>
              </div>
              <p className="muted section-description">
                Växla till pratnivå när du använder mikrofonen. Mixern och
                mikrofonens nivå påverkas inte.
              </p>
              <SoundControl
                settings={state.show}
                disabled={!online || busy}
                onChange={(p) => command('showSettings', p)}
                expanded
              />
            </section>
          </TabsContent>
          <TabsContent value="scores">
            <div className="host-grid">
              <div>
                <section className="panel">
                  <Leaderboard state={state} />
                  <p className="muted small">
                    Här visas totalsummorna direkt. På storbilden räknas poängen
                    ihop i turordning.
                  </p>
                </section>
                <section className="panel below">
                  <h2>
                    <Pencil size={19} /> Justera ett lags poäng
                  </h2>
                  <form
                    className="adjust-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const requestId = adjustId || randomId();
                      setAdjustId(requestId);
                      if (
                        await run('adjust', {
                          teamId: adjustTeam,
                          delta,
                          reason,
                          requestId,
                        })
                      ) {
                        setReason('');
                        setDelta(0);
                        setAdjustId('');
                      }
                    }}
                  >
                    <label className="field" htmlFor="adjust-team">
                      Lag
                      <Select
                        value={adjustTeam}
                        onValueChange={(v) => {
                          setAdjustTeam(v || '');
                          setAdjustId('');
                        }}
                      >
                        <SelectTrigger
                          id="adjust-team"
                          className="select-control"
                        >
                          <SelectValue placeholder="Välj lag" />
                        </SelectTrigger>
                        <SelectContent>
                          {state.teams.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="field">
                      Lägg till / dra av
                      <input
                        type="number"
                        min={-100000}
                        max={100000}
                        required
                        value={delta}
                        onChange={(e) => {
                          setDelta(Number(e.target.value));
                          setAdjustId('');
                        }}
                      />
                    </label>
                    <label className="field wide">
                      Anledning
                      <input
                        required
                        maxLength={300}
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          setAdjustId('');
                        }}
                        placeholder="Till exempel: godkänd alternativ stavning"
                      />
                    </label>
                    <button
                      className="button"
                      disabled={
                        busy || !online || !adjustTeam || !reason.trim()
                      }
                    >
                      Spara justering
                    </button>
                  </form>
                  {!!state.adjustments?.length && (
                    <div className="adjustment-list">
                      {state.adjustments
                        .slice()
                        .reverse()
                        .map((a) => (
                          <p key={a.id}>
                            <strong>
                              {a.delta >= 0 ? '+' : ''}
                              {a.delta} p
                            </strong>{' '}
                            {state.teams.find((t) => t.id === a.teamId)?.name}
                            <span className="muted"> · {a.reason}</span>
                          </p>
                        ))}
                    </div>
                  )}
                </section>
                <section className="panel below">
                  <h2>
                    <RotateCcw size={19} /> Ändra en tidigare rättning
                  </h2>
                  <Select
                    value={reviewRound}
                    onValueChange={(v) => setReviewRound(v || '')}
                  >
                    <SelectTrigger className="select-control below">
                      <SelectValue placeholder="Välj spelad fråga" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.rounds
                        ?.filter((r) =>
                          ['closed', 'revealed'].includes(r.status),
                        )
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.number}. {r.question.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </section>
                {reviewed && (
                  <Review
                    round={reviewed}
                    state={state}
                    busy={busy || !online}
                    onGrade={(roundId, teamId, correct) =>
                      void run('grade', { roundId, teamId, correct })
                    }
                  />
                )}
              </div>
              <aside className="side-stack">
                <section className="panel">
                  <h2>
                    <ShieldCheck size={19} /> Säkerhet under kvällen
                  </h2>
                  <p className="muted">
                    Tävlingen sparas automatiskt på den här datorn. Hämta gärna
                    en extra kopia före start och efter finalen.
                  </p>
                  <div className="stack-actions">
                    <a className="button secondary" href="/api/backup">
                      <Download size={18} />
                      Hämta databasbackup
                    </a>
                    <a className="button ghost" href="/api/export">
                      <Download size={18} />
                      Exportera svar & resultat
                    </a>
                  </div>
                  <p className="small muted">
                    Databasbackupen innehåller allt utom själva ljud- och
                    bildfilerna. De ligger kvar i datamappen.
                  </p>
                </section>
                <section className="panel">
                  <h2>
                    <LockKeyhole size={19} /> Hjälp ett lag att återansluta
                  </h2>
                  <p className="muted">
                    Dela endast respektive kod med rätt lag. Laget väljer
                    Återanslut på mobilen.
                  </p>
                  {state.teams.map((t) => (
                    <div className="recovery-row" key={t.id}>
                      <span>{t.name}</span>
                      <strong className="mono">{t.recovery}</strong>
                    </div>
                  ))}
                </section>
                <section className="panel">
                  <h2>
                    <Flag size={19} /> Klart med repetitionen?
                  </h2>
                  <p className="muted">
                    Börja om med samma lag och frågor, men med noll poäng. Svar
                    och satsningar rensas.
                  </p>
                  <button
                    className="button danger below"
                    onClick={() => {
                      setReset(true);
                    }}
                  >
                    Rensa resultat och börja om
                  </button>
                </section>
              </aside>
            </div>
          </TabsContent>
        </Tabs>
        <footer>
          <span>{state.branding.footer}</span>
          <span>{state.branding.intermissionText}</span>
        </footer>
      </main>
      {state.show && (
        <QuickTalk
          settings={state.show}
          disabled={!online || busy}
          onChange={(talking) => {
            void command('showSettings', { talking }).catch((e) =>
              setError(e.message),
            );
          }}
        />
      )}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Music playback/preview; the quiz displays question text and answers separately. */}
      <audio
        ref={audio}
        src={
          q?.audioSource === 'appleMusic'
            ? undefined
            : q?.audio || q?.video || undefined
        }
        preload="auto"
        onEnded={() => {
          if (
            current.current?.round?.status === 'running' &&
            hasControl.current
          )
            void run('close');
        }}
        onError={() => {
          if (
            current.current?.round?.status === 'running' &&
            hasControl.current
          ) {
            void run('pause');
            setError(
              'Ljudet kunde inte spelas. Tiden har pausats. Kontrollera filen och fortsätt när du är redo.',
            );
          }
        }}
      />
      {editor && (
        <QuestionEditor
          state={state}
          question={editor.q}
          onClose={() => setEditor(null)}
          onSave={async (q) => {
            await command('saveQuestion', q);
          }}
          onDelete={async (id) => {
            await command('deleteQuestion', { id });
          }}
        />
      )}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>Kom igång med ert quiz</DialogTitle>
          <DialogDescription>
            En dator styr quizet, storbilden visar frågorna och varje lag svarar
            från en mobil.
          </DialogDescription>
          <ol className="help-steps">
            <li>
              Anslut quizdatorn och mobilerna till samma wifi. Behåll den här
              programledarvyn på datorn och öppna storbilden på projektorn.
            </li>
            <li>
              Öppna{' '}
              <strong className="mono">
                {joinUrl || 'adressen som visas i programledarvyn'}
              </strong>{' '}
              på mobilen. Ange spelkod <strong>{state.code}</strong> och skapa
              ett testlag.
            </li>
            <li>
              Välj Förbered första frågan och sedan Spela & starta frågan. Lås
              ett svar på mobilen och kontrollera att det syns under laget.
            </li>
            <li>
              Rätta svaret och stäng svaren. Välj Gå till rättning och poäng och
              sedan Avsluta frågan. Fortsätt med nästa fråga; inför finalen får
              lagen satsa poäng.
            </li>
            <li>
              Rensa resultat och börja om under Poäng & säkerhet när testet är
              klart. Lag och frågor behålls. Ta bort eventuella testlag med
              papperskorgen under Samla lagen.
            </li>
          </ol>
          <p className="notice">
            Om mobilen inte hittar sidan kan nätet blockera trafik mellan
            enheter. Prova ett nät där enheterna kan nå varandra. Adressen
            localhost fungerar bara på själva quizdatorn.
          </p>
          <p className="muted">
            Använd ett utökat skrivbord: storbildsvyn på projektorn och den här
            programledarvyn på datorn. Endast programledarvyn spelar ljud.
          </p>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removeTeam}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoveTeam(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Ta bort {removeTeam?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Laget kopplas från quizet. Lagets svar, satsningar och poäng tas
            bort. Det går inte att ångra. Laget kan anmäla sig på nytt om det
            vill delta igen.
          </AlertDialogDescription>
          {removeError && (
            <p role="alert" className="notice">
              {removeError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRemoveTeam(null)}
            >
              Avbryt
            </button>
            <button
              className="button danger"
              disabled={busy || !online || !state.controller}
              onClick={async () => {
                if (!removeTeam) return;
                setBusy(true);
                setRemoveError('');
                try {
                  await command('removeTeam', {
                    teamId: removeTeam.id,
                    confirm: true,
                  });
                  if (adjustTeam === removeTeam.id) setAdjustTeam('');
                  setRemoveTeam(null);
                } catch (e) {
                  setRemoveError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ta bort lag
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent>
          <AlertDialogTitle>Rensa resultat och börja om?</AlertDialogTitle>
          <AlertDialogDescription>
            Svar, satsningar och poäng rensas i det öppna projektet. Lag,
            spelkod, frågor och ljudfiler behålls. Övriga projekt påverkas inte.
          </AlertDialogDescription>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReset(false)}
            >
              Avbryt
            </button>
            <button
              className="button danger"
              disabled={busy || !online}
              onClick={async () => {
                audio.current?.pause();
                if (await run('resetResults', { confirm: true })) {
                  setReset(false);
                  setTab('live');
                  setReviewRound('');
                }
              }}
            >
              Rensa och börja om
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
