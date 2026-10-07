import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createQuizStore } from '../server/engine.mjs';
import { createProjects } from '../server/projects.mjs';
import { defaultBranding, themePresets } from '../lib/branding.mjs';
import { migratedBranding, normalizeBranding } from '../server/branding.mjs';
import { validateProject } from '../server/project-schema.mjs';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-brand-'));
  mkdirSync(join(dir, 'media'));
  const store = createQuizStore(join(dir, 'quiz.sqlite'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store, projects: createProjects(dir) };
}

test('brand follows saved project, public snapshots, session switching and reset without leaking future clues', (t) => {
  const { dir, store, projects } = fixture(t);
  const { label: _label, ...theme } = themePresets.autumn;
  const brand = {
    ...defaultBranding('Oktoberquiz'),
    theme,
    brandName: 'OKTOBER',
    logo: '/media/abc.png',
    backdrop: '/media/def.jpg',
  };
  writeFileSync(join(dir, 'media/abc.png'), 'logo');
  writeFileSync(join(dir, 'media/def.jpg'), 'backdrop');
  store.command('branding', brand);
  assert.deepEqual(store.snapshot().branding, brand);
  const saved = projects.save(store.export(), { name: 'Oktoberquiz' });
  store.command('projectSaved', saved);
  const portable = JSON.parse(
    readFileSync(join(projects.directory(saved.id), 'quiz.json')),
  );
  validateProject(portable);
  assert.equal(portable.version, 3);
  assert.equal(portable.branding.logo, 'assets/abc.png');
  assert.equal(portable.branding.backdrop, 'assets/def.jpg');
  assert.equal(
    readFileSync(join(projects.directory(saved.id), 'assets/def.jpg'), 'utf8'),
    'backdrop',
  );
  const example = JSON.parse(
    readFileSync(new URL('../examples/demo/quiz.json', import.meta.url)),
  );
  store.command('loadProject', {
    id: example.id,
    title: example.name,
    questions: [],
    show: store.export().show,
    branding: example.branding,
  });
  assert.deepEqual(store.snapshot().branding, example.branding);
  assert.notEqual(
    store.snapshot().branding.theme.background,
    brand.theme.background,
  );
  store.command('loadProject', projects.load(saved.id));
  assert.deepEqual(store.snapshot().branding, brand);
  store.command('reset', { confirm: 'NY OMGÅNG' });
  assert.deepEqual(store.snapshot().branding, brand);
  store.command('prepare', { id: store.export().questions[0].id });
  assert.throws(
    () => store.command('branding', defaultBranding()),
    /Avsluta frågan/,
  );
  assert.equal(store.snapshot().round.question.answer, undefined);
  assert.equal(store.snapshot().questions, undefined);
});

test('legacy database migration assigns generic branding and preserves teams and questions across restart', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-migration-')),
    path = join(dir, 'quiz.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let store = createQuizStore(path);
  store.command('rename', { title: 'Fredagsquiz' });
  store.command('join', { name: 'Laget', code: store.snapshot().code });
  const before = store.export();
  store.close();
  delete before.branding;
  const db = new DatabaseSync(path);
  db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(before));
  db.close();
  store = createQuizStore(path);
  assert.deepEqual(store.snapshot().branding, defaultBranding('Fredagsquiz'));
  assert.deepEqual(store.export().questions, before.questions);
  assert.deepEqual(store.export().teams, before.teams);
  assert.equal(store.snapshot({ host: true }).projectDirty, true);
  store.close();
  store = createQuizStore(path);
  assert.deepEqual(store.snapshot().branding, defaultBranding('Fredagsquiz'));
  store.close();
});

test('v2 projects migrate on read and export; v3 rejects invalid identity and asset paths', (t) => {
  const { projects, store } = fixture(t),
    saved = projects.save(store.export(), { name: 'Fredagsquiz' }),
    path = join(projects.directory(saved.id), 'quiz.json');
  const p = JSON.parse(readFileSync(path));
  p.version = 2;
  p.format = 'perfekt-quiz';
  delete p.branding;
  writeFileSync(path, JSON.stringify(p));
  assert.deepEqual(
    projects.load(saved.id).branding,
    defaultBranding('Fredagsquiz'),
  );
  projects.writeSchema(saved.id);
  const exported = JSON.parse(readFileSync(path));
  validateProject(exported);
  assert.equal(exported.version, 3);
  assert.deepEqual(exported.branding, defaultBranding('Fredagsquiz'));
  assert.ok(readdirSync(join(projects.directory(saved.id), 'history')).length);
  exported.branding.logo = 'https://example.com/logo.png';
  assert.throws(() => validateProject(exported), /schemat/);
  assert.throws(
    () =>
      normalizeBranding({
        ...defaultBranding(),
        theme: { ...defaultBranding().theme, accent: 'red;url(x)' },
      }),
    /hexkoder/,
  );
  assert.throws(
    () =>
      normalizeBranding({ ...defaultBranding(), brandName: ' '.repeat(10) }),
    /tecken/,
  );
  assert.equal(migratedBranding('Julquiz').brandName, 'QUIZ');
  const example = JSON.parse(
    readFileSync(new URL('../examples/demo/quiz.json', import.meta.url)),
  );
  validateProject(example);
});

test('all built-in themes meet text contrast requirements; unreadable custom palettes are rejected', () => {
  for (const { label: _label, ...theme } of Object.values(themePresets))
    normalizeBranding({ ...defaultBranding(), theme });
  assert.throws(
    () =>
      normalizeBranding({
        ...defaultBranding(),
        theme: { ...defaultBranding().theme, foreground: '#191c1f' },
      }),
    /kontrast/,
  );
});
