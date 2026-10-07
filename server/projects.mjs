import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
  lstatSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeQuestion, normalizeShow, text, fail } from './model.mjs';
import { migratedBranding, normalizeBranding } from './branding.mjs';
import { projectSchema, validateProject } from './project-schema.mjs';
const validId = (id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
export function mapAssets(project, fn) {
  const copy = structuredClone(project);
  for (const q of copy.questions) {
    for (const key of ['audio', 'image', 'picture', 'video'])
      if (q[key]) q[key] = fn(q[key]);
    for (const cue of q.cues || [])
      for (const key of ['image', 'video'])
        if (cue[key]) cue[key] = fn(cue[key]);
  }
  if (copy.show?.bedTracks) copy.show.bedTracks = copy.show.bedTracks.map(fn);
  for (const key of ['bedAudio', 'closingAudio'])
    if (copy.show?.[key]) copy.show[key] = fn(copy.show[key]);
  for (const key of ['logo', 'backdrop'])
    if (copy.branding?.[key]) copy.branding[key] = fn(copy.branding[key]);
  return copy;
}
function atomicWrite(path, data) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  const fd = openSync(tmp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
export function createProjects(dataDir) {
  const root = join(dataDir, 'projects');
  mkdirSync(root, { recursive: true });
  const writeSchema = (folder) =>
    atomicWrite(
      join(folder, 'quiz-project.schema.json'),
      JSON.stringify(projectSchema, null, 2) + '\n',
    );
  const directory = (id) =>
    validId(id) ? join(root, id) : fail('Ogiltigt projekt-id.');
  const read = (id) => {
    const path = join(directory(id), 'quiz.json');
    if (!existsSync(path)) fail('Projektet finns inte.', 404);
    let p;
    try {
      p = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      fail('Projektets JSON-fil går inte att läsa.');
    }
    try {
      validateProject(p);
    } catch (error) {
      fail(error.message);
    }
    if (p.version === 2)
      p = {
        ...p,
        format: 'quiz-project',
        version: 3,
        branding: migratedBranding(p.name),
      };
    return p;
  };
  return {
    directory,
    list() {
      return readdirSync(root)
        .filter(validId)
        .flatMap((id) => {
          try {
            const p = read(id);
            return [
              {
                id,
                name: p.name,
                savedAt: p.savedAt,
                questionCount: p.questions.length,
              },
            ];
          } catch {
            return [];
          }
        })
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    save(state, { name, id } = {}) {
      id = id || randomUUID();
      const folder = directory(id);
      const assets = join(folder, 'assets');
      mkdirSync(assets, { recursive: true });
      const project = {
        $schema: 'quiz-project.schema.json',
        format: 'quiz-project',
        version: 3,
        id,
        name: text(name || state.title, 100, 'Projektnamnet'),
        savedAt: Date.now(),
        branding: normalizeBranding(
          state.branding || migratedBranding(state.title),
        ),
        questions: state.questions.map((q) =>
          normalizeQuestion(q, { keepExample: true }),
        ),
        show: { ...normalizeShow(state.show), talking: false },
      };
      const portable = mapAssets(project, (url) => {
        if (!/^\/media\/[a-f0-9-]+\.[a-z0-9]+$/.test(url))
          fail('Ogiltig filreferens.');
        const name = basename(url),
          source = join(dataDir, 'media', name),
          dest = join(assets, name);
        if (!existsSync(source) || !lstatSync(source).isFile())
          fail(`En tillhörande fil saknas: ${name}`);
        if (!existsSync(dest)) {
          const tmp = dest + '.tmp';
          copyFileSync(source, tmp);
          const fd = openSync(tmp, 'r');
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
          renameSync(tmp, dest);
        }
        return 'assets/' + name;
      });
      try {
        validateProject(portable);
      } catch (error) {
        fail(error.message);
      }
      // Old versions remain readable if saving is interrupted before this atomic rename.
      const previous = join(folder, 'quiz.json');
      if (existsSync(previous)) {
        mkdirSync(join(folder, 'history'), { recursive: true });
        copyFileSync(
          previous,
          join(
            folder,
            'history',
            `quiz-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
          ),
        );
      }
      writeSchema(folder);
      atomicWrite(previous, JSON.stringify(portable, null, 2) + '\n');
      return {
        id,
        name: project.name,
        savedAt: project.savedAt,
        questionCount: project.questions.length,
      };
    },
    load(id) {
      const p = read(id),
        folder = directory(id);
      // Validate every reference before copying anything or replacing the active quiz.
      const mapped = mapAssets(p, (url) => {
        if (!/^assets\/[a-f0-9-]+\.[a-z0-9]+$/.test(url))
          fail('Projektet innehåller en otillåten sökväg.');
        const path = join(folder, url);
        if (!existsSync(path) || !lstatSync(path).isFile())
          fail(`Projektet saknar filen ${url}.`);
        return '/media/' + basename(url);
      });
      const questions = mapped.questions.map((q) =>
          normalizeQuestion(q, { keepExample: true }),
        ),
        show = normalizeShow(mapped.show);
      if (new Set(questions.map((q) => q.id)).size !== questions.length)
        fail('Projektet innehåller dubbla fråge-id.');
      const title = text(p.name, 100, 'Projektnamnet');
      mapAssets(p, (url) => {
        const target = join(dataDir, 'media', basename(url));
        if (!existsSync(target)) {
          mkdirSync(join(dataDir, 'media'), { recursive: true });
          copyFileSync(join(folder, url), target);
        }
        return url;
      });
      return {
        id,
        title,
        savedAt: p.savedAt,
        questions,
        show,
        branding: normalizeBranding(mapped.branding),
      };
    },
    writeSchema(id) {
      const folder = directory(id),
        path = join(folder, 'quiz.json');
      const previous = JSON.parse(readFileSync(path, 'utf8'));
      const migrated = read(id);
      if (previous.version === 2) {
        mkdirSync(join(folder, 'history'), { recursive: true });
        copyFileSync(
          path,
          join(
            folder,
            'history',
            `quiz-v2-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
          ),
        );
        atomicWrite(path, JSON.stringify(migrated, null, 2) + '\n');
      }
      writeSchema(folder);
    },
  };
}
