import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);

test(
  'native selector ignores hidden unrelated menus, rejects ambiguity and matches exact catalog IDs',
  { skip: process.platform !== 'darwin' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quiz-music-menu-'));
    try {
      const binary = join(directory, 'test-menu');
      await exec(
        '/usr/bin/xcrun',
        [
          'swiftc',
          '-module-cache-path',
          join(directory, 'module-cache'),
          '-D',
          'MUSIC_MENU_TEST',
          'scripts/music-add.swift',
          '-o',
          binary,
        ],
        { timeout: 90000 },
      );
      const { stdout } = await exec(binary);
      assert.match(stdout, /Music menu checks passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
