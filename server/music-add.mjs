import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export function createMusicAdder({ execute }) {
  const source = fileURLToPath(
    new URL('../scripts/music-add.swift', import.meta.url),
  );
  const directory = fileURLToPath(
    new URL('../.music-helper-build/', import.meta.url),
  );
  const binary = join(directory, 'music-add');
  let ready;
  async function build() {
    const hash = createHash('sha256')
      .update(await readFile(source))
      .digest('hex');
    if (
      (await readFile(join(directory, 'source.sha256'), 'utf8').catch(
        () => '',
      )) === hash
    ) {
      try {
        await access(binary);
        return;
      } catch {}
    }
    await mkdir(directory, { recursive: true });
    try {
      await execute('/usr/bin/xcrun', ['swiftc', '-O', source, '-o', binary], {
        timeout: 90000,
        maxBuffer: 512 * 1024,
      });
    } catch {
      throw new Error(
        'Kunde inte bygga Musik-hjälpen. Installera Apples Command Line Tools med xcode-select --install och försök igen.',
      );
    }
    await writeFile(join(directory, 'source.sha256'), hash);
  }
  return async (url) => {
    ready ||= build().catch((error) => {
      ready = null;
      throw error;
    });
    await ready;
    try {
      const { stdout } = await execute(binary, [url], {
        timeout: 45000,
        maxBuffer: 512 * 1024,
      });
      return JSON.parse(stdout.trim());
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT')
        throw new Error(
          'Tillägget tog för lång tid i Musik. Kontrollera biblioteket innan du försöker igen.',
        );
      throw new Error(
        String(error.stderr || error.message)
          .trim()
          .slice(0, 500),
      );
    }
  };
}
