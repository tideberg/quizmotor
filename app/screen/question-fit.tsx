'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit the question after cues, media, fonts or the projector size change. */
export function QuestionFit({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = viewport.current;
    const stage = frame?.querySelector<HTMLElement>('.stage');
    if (!frame || !stage) return;
    let disposed = false;
    let pending = 0;
    const fit = () => {
      if (disposed || !frame.clientHeight) return;
      stage.style.zoom = '1';
      stage.classList.remove('question-compact');
      const fits = (scale: number) =>
        Math.max(stage.offsetHeight, stage.scrollHeight) * scale <=
          frame.clientHeight - 2 &&
        Math.max(stage.offsetWidth, stage.scrollWidth) * scale <=
          frame.clientWidth + 1;
      if (!fits(1)) stage.classList.add('question-compact');
      if (!fits(1)) {
        let low = 0;
        let high = 1;
        for (let i = 0; i < 14; i++) {
          const scale = (low + high) / 2;
          stage.style.zoom = String(scale);
          if (fits(scale)) low = scale;
          else high = scale;
        }
        stage.style.zoom = String(low);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(fit);
    };
    fit();
    // Observe the allocated space, not the scaled stage, to avoid resize loops.
    const resize = new ResizeObserver(schedule);
    resize.observe(frame);
    const content = new MutationObserver(schedule);
    content.observe(stage, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    frame.addEventListener('load', schedule, true);
    frame.addEventListener('loadedmetadata', schedule, true);
    void document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(pending);
      resize.disconnect();
      content.disconnect();
      frame.removeEventListener('load', schedule, true);
      frame.removeEventListener('loadedmetadata', schedule, true);
      document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, []);
  return (
    <div className="question-fit" ref={viewport}>
      {children}
    </div>
  );
}
