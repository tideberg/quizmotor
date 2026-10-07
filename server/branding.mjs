import { defaultBranding, brandingTextFields } from '../lib/branding.mjs';
import { asset, text, fail } from './model.mjs';

export function migratedBranding(title = '') {
  return defaultBranding(title || 'Quizkväll');
}

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function normalizeBranding(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('Ogiltig quizidentitet.');
  const output = {};
  for (const [key, field] of Object.entries(brandingTextFields))
    output[key] = text(input[key], field.max, field.label);
  const theme = input.theme;
  if (!theme || typeof theme !== 'object') fail('Quizet behöver ett färgtema.');
  output.theme = {};
  for (const key of [
    'background',
    'surface',
    'foreground',
    'muted',
    'accent',
    'board',
    'alert',
  ]) {
    if (typeof theme[key] !== 'string' || !/^#[a-f0-9]{6}$/i.test(theme[key]))
      fail('Färger anges som sexsiffriga hexkoder.');
    output.theme[key] = theme[key];
  }
  for (const [key, values] of Object.entries({
    symbol: ['audio', 'leaf', 'snowflake', 'compass', 'star'],
    typography: ['sans', 'serif', 'mono'],
    pattern: ['diagonal', 'dots', 'stars', 'grid', 'none'],
  })) {
    if (!values.includes(theme[key])) fail('Ogiltigt temaval.');
    output.theme[key] = theme[key];
  }
  if (
    ['background', 'surface', 'board'].some(
      (key) => contrast(theme.foreground, theme[key]) < 4.5,
    )
  )
    fail(
      'Textfärgen behöver tydligare kontrast mot bakgrund, paneler och poängtavla.',
    );
  if (
    ['background', 'surface'].some(
      (key) => contrast(theme.muted, theme[key]) < 4.5,
    )
  )
    fail(
      'Den sekundära texten behöver tydligare kontrast mot bakgrund och paneler.',
    );
  if (
    contrast(theme.accent, '#18230c') < 4.5 ||
    contrast(theme.alert, '#291328') < 4.5
  )
    fail(
      'Välj ljusare accent och tidsslutsfärg så att den mörka texten går att läsa.',
    );
  output.logo = asset(input.logo, 'image');
  output.backdrop = asset(input.backdrop, 'image');
  return output;
}
