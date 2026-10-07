'use client';
import { useState } from 'react';
import {
  Disc3,
  ImagePlus,
  LoaderCircle,
  Plus,
  Save,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuestionPreview } from './question-preview';
import { Question, Cue, QuizState, randomId } from '@/lib/quiz';
import { MediaInput } from './media-input';
import { AppleMusicPicker } from './apple-music-picker';
export function QuestionEditor({
  question,
  state,
  onClose,
  onSave,
  onDelete,
}: {
  question: Question | null;
  state: QuizState;
  onClose: () => void;
  onSave: (q: Question) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState<Question>(
    question || {
      id: '',
      title: '',
      prompt: '',
      answer: '',
      explanation: '',
      hint: '',
      kind: 'music',
      duration: 120,
      maxPoints: 100,
      offset: 0,
      audio: null,
      image: null,
      picture: null,
      video: null,
      cues: [],
      audioSource: 'local',
      appleMusic: null,
    },
  );
  const [preview, setPreview] = useState<Question | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [upload, setUpload] = useState('');
  const change = (key: keyof Question, value: unknown) =>
    setQ((prev) => ({ ...prev, [key]: value }));
  const changeCue = (id: string, patch: Partial<Cue>) =>
    setQ((prev) => ({
      ...prev,
      cues: (prev.cues || []).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  const uploadButton = (
    kind: 'audio' | 'image' | 'video',
    target: string,
    label: string,
    done: (url: string) => void,
  ) => (
    <MediaInput
      key={target}
      kind={kind}
      label={label}
      disabled={busy || !!upload}
      onBusyChange={(active) => setUpload(active ? target : '')}
      onSelect={done}
    />
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !upload) onClose();
      }}
    >
      <DialogContent className="quiz-dialog">
        <DialogHeader>
          <DialogTitle>
            {question ? 'Redigera fråga' : 'En ny fråga'}
          </DialogTitle>
          <DialogDescription>
            Bygg frågan och dess ledtrådar. Spara sedan quizprojektet inför
            spelkvällen.
          </DialogDescription>
        </DialogHeader>
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await onSave(q);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <button
            type="button"
            className="button secondary"
            disabled={busy || !!upload}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity())
                setPreview(structuredClone(q));
            }}
          >
            Prova frågan
          </button>
          <div className="form-grid">
            <label className="field">
              Rubrik / kategori
              <input
                required
                maxLength={100}
                value={q.title}
                onChange={(e) => change('title', e.target.value)}
                placeholder="Till exempel: En välkänd refräng"
              />
              <small>Syns före start. Skriv inte facit här.</small>
            </label>
            <label className="field" htmlFor="question-kind">
              Frågetyp
              <Select
                value={q.kind}
                onValueChange={(v) => {
                  if (v) change('kind', v);
                }}
              >
                <SelectTrigger id="question-kind" className="select-control">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">
                    Tidsfråga · fallande poäng
                  </SelectItem>
                  <SelectItem value="bonus">Bonus · fasta poäng</SelectItem>
                  <SelectItem value="wager">Final · satsade poäng</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="field">
            Frågetext · valfri
            <textarea
              maxLength={1000}
              rows={2}
              value={q.prompt}
              onChange={(e) => change('prompt', e.target.value)}
              placeholder="Visa text direkt, eller låt musiken och bilderna tala."
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Facit
              <textarea
                required
                maxLength={1000}
                rows={2}
                value={q.answer}
                onChange={(e) => change('answer', e.target.value)}
              />
            </label>
            <label className="field">
              Text vid avslöjandet
              <textarea
                rows={2}
                maxLength={2000}
                value={q.explanation}
                onChange={(e) => change('explanation', e.target.value)}
                placeholder="En rolig anekdot eller lite bakgrund…"
              />
            </label>
          </div>
          <div className="form-grid thirds">
            <label className="field">
              Tid (sekunder)
              <input
                type="number"
                required
                min={10}
                max={600}
                value={q.duration}
                onChange={(e) => change('duration', Number(e.target.value))}
              />
            </label>
            <label className="field">
              {q.kind === 'bonus' ? 'Fasta poäng' : 'Maxpoäng'}
              <input
                type="number"
                required
                min={1}
                max={10000}
                disabled={q.kind === 'wager'}
                value={q.maxPoints}
                onChange={(e) => change('maxPoints', Number(e.target.value))}
              />
            </label>
            <label className="field">
              Ljudets start (sekunder)
              <input
                type="number"
                required
                min={0}
                max={7200}
                value={q.offset}
                onChange={(e) => change('offset', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="editor-section">
            <div className="panel-heading">
              <h2>
                <Disc3 size={18} />
                Ljudet
              </h2>
              <Select
                value={q.audioSource || 'local'}
                onValueChange={(v) => change('audioSource', v)}
              >
                <SelectTrigger className="select-control">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Lokalt ljud / video</SelectItem>
                  <SelectItem value="appleMusic">Apple Music</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {q.audioSource === 'appleMusic' ? (
              <AppleMusicPicker
                key={q.id}
                offset={q.offset}
                value={q.appleMusic || null}
                onChange={(track) => change('appleMusic', track)}
              />
            ) : (
              <>
                {q.audio ? (
                  <div className="asset-preview">
                    {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Music playback/preview; the quiz displays question text and answers separately. */}
                    <audio controls src={q.audio} preload="metadata" />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Ta bort ljudfil"
                      onClick={() => change('audio', null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <p className="muted small">
                    Lägg till ett ljudklipp, använd videons ljud eller spela
                    frågan tyst. WAV, MP3, M4A, OGG, AAC, FLAC · max 250 MB.
                  </p>
                )}
                {uploadButton(
                  'audio',
                  'audio',
                  q.audio ? 'Byt ljudfil' : 'Välj ljudfil',
                  (url) => change('audio', url),
                )}
              </>
            )}
          </div>
          <div className="editor-section">
            <div className="panel-heading">
              <h2>
                <ImagePlus size={18} />
                På skärmen från start
              </h2>
              <span className="eyebrow muted">VALFRITT</span>
            </div>
            <div className="initial-media">
              <div>
                {q.picture && (
                  <div className="asset-preview">
                    <img src={q.picture} alt="Bild från start" />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Ta bort startbild"
                      onClick={() => change('picture', null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {uploadButton(
                  'image',
                  'picture',
                  q.picture ? 'Byt bild' : 'Välj bild',
                  (url) => change('picture', url),
                )}
              </div>
              <div>
                {q.video && (
                  <div className="asset-preview">
                    <video src={q.video} muted controls playsInline />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Ta bort video"
                      onClick={() => change('video', null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {uploadButton(
                  'video',
                  'video',
                  q.video ? 'Byt video' : 'Välj video',
                  (url) => change('video', url),
                )}
              </div>
            </div>
            <p className="muted small">
              Videon visas på storbilden och tar bildens plats. Dess ljud spelas
              från programledarvyn om du inte valt något annat musikspår. MP4,
              WebM, MOV · max 750 MB.
            </p>
          </div>
          <div className="editor-section timeline-editor">
            <div className="panel-heading">
              <div>
                <h2>
                  <Timer size={18} />
                  Ledtrådarnas tidslinje
                </h2>
                <p className="muted small section-description">
                  Sekunder från frågans start. Musikens startpunkt påverkar inte
                  tiderna.
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={(q.cues?.length || 0) >= 30}
                onClick={() =>
                  change('cues', [
                    ...(q.cues || []),
                    {
                      id: randomId(),
                      at: Math.min(
                        q.duration - 1,
                        (q.cues?.at(-1)?.at || 0) + 20,
                      ),
                      text: '',
                      image: null,
                      video: null,
                    },
                  ])
                }
              >
                <Plus size={17} />
                Ny ledtråd
              </button>
            </div>
            {!q.cues?.length && (
              <p className="timeline-empty">
                Till exempel: text efter 20 sekunder, en bild efter 40 och en
                film efter 60.
              </p>
            )}
            {q.cues?.map((cue, i) => (
              <div className="cue-editor" key={cue.id}>
                <div className="cue-time">
                  <label className="field">
                    Efter
                    <input
                      type="number"
                      required
                      min={0}
                      max={q.duration - 1}
                      value={cue.at}
                      onChange={(e) =>
                        changeCue(cue.id, { at: Number(e.target.value) })
                      }
                    />
                  </label>
                  <span>sekunder</span>
                </div>
                <div className="cue-content">
                  <div className="panel-heading">
                    <strong>Ledtråd {i + 1}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Ta bort ledtråd ${i + 1}`}
                      onClick={() =>
                        change(
                          'cues',
                          q.cues?.filter((c) => c.id !== cue.id),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <label className="field">
                    Text · valfri
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={cue.text}
                      onChange={(e) =>
                        changeCue(cue.id, { text: e.target.value })
                      }
                    />
                  </label>
                  <div className="cue-attachments">
                    {cue.image && (
                      <div className="asset-preview">
                        <img
                          src={cue.image}
                          alt={`Bild för ledtråd ${i + 1}`}
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Ta bort ledtrådsbild"
                          onClick={() => changeCue(cue.id, { image: null })}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {cue.video && (
                      <div className="asset-preview">
                        <video src={cue.video} muted controls playsInline />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Ta bort ledtrådsfilm"
                          onClick={() => changeCue(cue.id, { video: null })}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {uploadButton(
                      'image',
                      cue.id + 'image',
                      cue.image ? 'Byt bild' : 'Bild',
                      (url) => changeCue(cue.id, { image: url }),
                    )}
                    {uploadButton(
                      'video',
                      cue.id + 'video',
                      cue.video ? 'Byt film' : 'Film',
                      (url) => changeCue(cue.id, { video: url }),
                    )}
                  </div>
                </div>
              </div>
            ))}
            <p className="muted small">
              Texter läggs till efter hand. Den senaste bilden eller filmen
              ersätter den föregående. Ledtrådsfilmer är ljudlösa. Du kan även
              visa nästa ledtråd manuellt.
            </p>
          </div>
          <details className="legacy-hint">
            <summary>Extra ledtråd som bara visas manuellt</summary>
            <label className="field">
              Text
              <textarea
                maxLength={1000}
                rows={2}
                value={q.hint}
                onChange={(e) => change('hint', e.target.value)}
              />
            </label>
            <div className="image-upload">
              {q.image && <img src={q.image} alt="Extra bildledtråd" />}
              {uploadButton(
                'image',
                'image',
                q.image ? 'Byt extrabild' : 'Välj extrabild',
                (url) => change('image', url),
              )}
              {q.image && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => change('image', null)}
                >
                  Ta bort bild
                </button>
              )}
            </div>
          </details>
          {q.kind === 'wager' && (
            <p className="notice">
              Lagen satsar mellan 0 och hela sin poäng. Rätt svar ger
              satsningen, fel eller uteblivet svar drar av den. Lag utan
              satsning får 0 när du börjar.
            </p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <div className="form-actions">
            {question && (
              <button
                type="button"
                className="button danger"
                disabled={busy || !!upload}
                onClick={() => setDeleteOpen(true)}
              >
                Ta bort fråga
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={busy || !!upload}
              onClick={onClose}
            >
              Avbryt
            </button>
            <button className="button" disabled={busy || !!upload}>
              {busy ? <LoaderCircle size={18} /> : <Save size={18} />}Spara
              fråga
            </button>
          </div>
        </form>
        {preview && (
          <QuestionPreview
            question={preview}
            state={state}
            onClose={() => setPreview(null)}
          />
        )}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Ta bort frågan?</AlertDialogTitle>
            <AlertDialogDescription>
              Frågan tas bort ur körschemat. Uppladdade filer finns kvar på
              datorn.
            </AlertDialogDescription>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setDeleteOpen(false)}
              >
                Avbryt
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete(q.id);
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                    setDeleteOpen(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Ta bort
              </button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
