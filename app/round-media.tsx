'use client';
import { useEffect, useRef } from 'react';
import { Round } from '@/lib/quiz';
export function RoundVideo({
  src,
  elapsed,
  start = 0,
  running,
}: {
  src: string;
  elapsed: number;
  start?: number;
  running: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sync = () => {
      const desired = Math.max(0, elapsed / 1000 - start);
      if (video.readyState >= 1) {
        const position = Number.isFinite(video.duration)
          ? Math.min(desired, Math.max(0, video.duration - 0.05))
          : desired;
        if (Math.abs(video.currentTime - position) > 0.8)
          video.currentTime = position;
      }
      if (running && !video.ended) void video.play().catch(() => {});
      else video.pause();
    };
    sync();
    video.addEventListener('loadedmetadata', sync, { once: true });
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [src, elapsed, start, running]);
  return (
    <video
      ref={ref}
      className="round-video"
      src={src}
      muted
      playsInline
      preload="auto"
    />
  );
}
export function RoundMedia({
  round,
  elapsed,
}: {
  round: Round;
  elapsed: number;
}) {
  const q = round.question,
    cues = round.visibleCues || [];
  const visual = [
    ...(q.picture || q.video
      ? [{ id: 'initial', at: 0, shownAt: 0, image: q.picture, video: q.video }]
      : []),
    ...cues.filter((c) => c.image || c.video),
  ].at(-1);
  return (
    <div className={`round-media ${visual ? 'has-visual' : ''}`}>
      <div className="cue-stack">
        {cues
          .filter((c) => c.text)
          .map((c, i) => (
            <div className="timed-clue" key={c.id}>
              <span>LEDTRÅD {i + 1}</span>
              <p>{c.text}</p>
            </div>
          ))}
      </div>
      {visual && (
        <div className="visual-clue" key={visual.id}>
          {visual.video ? (
            <RoundVideo
              src={visual.video}
              elapsed={elapsed}
              start={visual.shownAt ?? visual.at}
              running={round.status === 'running'}
            />
          ) : visual.image ? (
            <img src={visual.image} alt="Bildledtråd till frågan" />
          ) : null}
        </div>
      )}
    </div>
  );
}
