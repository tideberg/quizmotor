const fades = new WeakMap<
  HTMLMediaElement,
  { target: number; frame: number }
>();

export async function fadeOutAndPause(audio: HTMLMediaElement) {
  if (!audio.paused && audio.volume > 0) {
    setSmoothVolume(audio, 0);
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
  }
  cancelVolumeFade(audio);
  audio.volume = 0;
  audio.pause();
}

export function cancelVolumeFade(audio: HTMLMediaElement) {
  const fade = fades.get(audio);
  if (fade) cancelAnimationFrame(fade.frame);
  fades.delete(audio);
}

// Retarget from the current level, without restarting on each server snapshot.
export function setSmoothVolume(audio: HTMLMediaElement, target: number) {
  if (fades.get(audio)?.target === target && !audio.paused) return;
  cancelVolumeFade(audio);
  if (audio.paused || audio.volume === target) {
    audio.volume = target;
    return;
  }
  const from = audio.volume;
  const started = performance.now();
  const fade = { target, frame: 0 };
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / 350);
    const eased = progress * progress * (3 - 2 * progress);
    audio.volume = from + (target - from) * eased;
    if (progress < 1) fade.frame = requestAnimationFrame(step);
    else fades.delete(audio);
  };
  fades.set(audio, fade);
  fade.frame = requestAnimationFrame(step);
}
