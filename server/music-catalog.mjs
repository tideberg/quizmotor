import { fail, text } from './model.mjs';

export function parseMusicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('Ange en komplett låtlänk från Apple Music.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'music.apple.com' ||
    url.username ||
    url.password ||
    url.port
  )
    fail('Ange en https-länk från music.apple.com.');
  const parts = url.pathname.split('/').filter(Boolean);
  const country = parts[0];
  const catalogId =
    url.searchParams.get('i') || (parts[1] === 'song' ? parts.at(-1) : '');
  if (
    !/^[a-z]{2}$/.test(country || '') ||
    !/^[1-9][0-9]{0,19}$/.test(catalogId || '')
  )
    fail(
      'Länken behöver peka på en låt. I Musik: välj låtens meny → Dela → Kopiera länk.',
    );
  return {
    country,
    catalogId,
    url: `https://music.apple.com/${country}/song/${catalogId}`,
  };
}
export function createMusicCatalog({ fetcher = fetch } = {}) {
  const cache = new Map();
  async function request(path, params) {
    const url = new URL(path, 'https://itunes.apple.com');
    url.search = new URLSearchParams(params).toString();
    const cached = cache.get(url.href);
    if (cached && Date.now() - cached.at < 300000) return cached.data;
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
        break;
      } catch {
        if (attempt === 1)
          fail('Apples sökning svarar inte just nu. Försök igen om en stund.');
      }
    }
    if (!response.ok)
      fail('Apples sökning svarar inte just nu. Försök igen om en stund.');
    const data = await response.json();
    if (!Array.isArray(data.results)) fail('Apple gav ett oväntat söksvar.');
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    cache.set(url.href, { at: Date.now(), data: data.results });
    return data.results;
  }
  function track(t, country) {
    if (
      t.kind !== 'song' ||
      !t.trackId ||
      !t.trackName ||
      !Number.isFinite(t.trackTimeMillis)
    )
      return null;
    return {
      persistentId: '',
      catalogId: String(t.trackId),
      url: `https://music.apple.com/${country}/song/${t.trackId}`,
      name: t.trackName,
      artist: t.artistName || '',
      album: t.collectionName || '',
      duration: t.trackTimeMillis / 1000,
    };
  }
  return {
    async search(query) {
      query = text(query, 200, 'Sökningen');
      const results = await request('/search', {
        term: query,
        country: 'se',
        entity: 'song',
        limit: '200',
      });
      const tracks = results.map((t) => track(t, 'se')).filter(Boolean);
      return { tracks, limited: results.length >= 200 };
    },
    async lookup(value) {
      const parsed = parseMusicUrl(value);
      const results = await request('/lookup', {
        id: parsed.catalogId,
        country: parsed.country,
        entity: 'song',
      });
      const result = results.find(
        (t) => String(t.trackId) === parsed.catalogId && t.kind === 'song',
      );
      const found = result && track(result, parsed.country);
      if (!found)
        fail(
          'Låten hittades inte i Apples söktjänst för landet i länken. Prova att välja den via Musik-biblioteket.',
        );
      return found;
    },
  };
}

export function matchingLibraryTracks(catalog, tracks) {
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[’‘]/g, "'")
      .trim();
  return tracks.filter(
    (t) =>
      normalize(t.name) === normalize(catalog.name) &&
      normalize(t.artist) === normalize(catalog.artist) &&
      normalize(t.album) === normalize(catalog.album) &&
      Math.abs(t.duration - catalog.duration) < 2,
  );
}
