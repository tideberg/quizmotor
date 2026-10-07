'use client';
import { useEffect, useMemo } from 'react';
import { AudioLines, Compass, Leaf, Snowflake, Star } from 'lucide-react';
import { defaultBranding } from '@/lib/branding.mjs';
import type { Branding } from '@/lib/quiz';
export function QuizSymbol({
  branding,
  className,
}: {
  branding?: Branding;
  className?: string;
}) {
  const Icon = {
    audio: AudioLines,
    compass: Compass,
    leaf: Leaf,
    snowflake: Snowflake,
    star: Star,
  }[branding?.theme.symbol || 'audio'];
  return <Icon className={className} aria-hidden="true" />;
}
export function Brand({ branding }: { branding?: Branding }) {
  const b = branding || defaultBranding();
  return (
    <a className="brand" href="/">
      {b.logo ? (
        <img className="brand-logo" src={b.logo} alt="" />
      ) : (
        <QuizSymbol branding={branding} />
      )}
      <span>
        {b.brandName}
        <span className="brand-dot">.</span>
      </span>
    </a>
  );
}
export function QuizTheme({ branding }: { branding?: Branding }) {
  const serialized = JSON.stringify(branding);
  const identity = useMemo(
    () => (serialized ? (JSON.parse(serialized) as Branding) : undefined),
    [serialized],
  );
  useEffect(() => {
    const branding = identity;
    if (!branding) return;
    const root = document.documentElement,
      t = branding.theme;
    const values: Record<string, string> = {
      background: t.background,
      foreground: t.foreground,
      card: t.surface,
      'card-foreground': t.foreground,
      popover: t.surface,
      'popover-foreground': t.foreground,
      primary: t.accent,
      accent: t.accent,
      ring: t.accent,
      'primary-foreground': '#171d10',
      'accent-foreground': '#171d10',
      'muted-foreground': t.muted,
      'quiz-board': t.board,
      'quiz-alert': t.alert,
      'quiz-backdrop': branding.backdrop
        ? `url("${branding.backdrop}")`
        : 'none',
      'quiz-heading-font':
        t.typography === 'serif'
          ? 'Georgia, serif'
          : t.typography === 'mono'
            ? "'SFMono-Regular', Consolas, monospace"
            : "'Helvetica Neue', Helvetica, Arial, sans-serif",
    };
    for (const [key, value] of Object.entries(values))
      root.style.setProperty(`--${key}`, value);
    // Preserve the legacy stage palette exactly; alternate themes replace every major surface.
    root.dataset.quizStyle =
      t.pattern === 'diagonal' && t.board === '#202079' ? 'stage' : 'custom';
    root.dataset.quizPattern = t.pattern;
    root.dataset.quizTypography = t.typography;
    const previousIcon =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const icon = previousIcon || document.createElement('link');
    const oldHref = icon.getAttribute('href');
    icon.rel = 'icon';
    const letter = branding.brandName.slice(0, 1).replace(/[<>&"']/g, '');
    icon.href =
      branding.logo ||
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="${t.accent}"/><text x="32" y="47" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="bold" fill="#101214">${letter}</text></svg>`)}`;
    if (!previousIcon) document.head.appendChild(icon);
    document.title = `${branding.brandName}. — ${branding.subtitle}`;
    return () => {
      if (!previousIcon) icon.remove();
      else if (oldHref) icon.href = oldHref;
      for (const key of Object.keys(values))
        root.style.removeProperty(`--${key}`);
      delete root.dataset.quizStyle;
      delete root.dataset.quizPattern;
      delete root.dataset.quizTypography;
    };
  }, [identity]);
  return null;
}
