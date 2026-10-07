/* macOS JavaScript for Automation. Input is JSON passed as argv, never executable source. */
function run(argv) {
  var action = argv[0],
    data = JSON.parse(argv[1] || '{}'),
    music = Application('Music');
  function info(t) {
    return {
      persistentId: t.persistentID(),
      name: t.name(),
      artist: t.artist(),
      duration: t.duration(),
      album: t.album(),
    };
  }
  function current() {
    try {
      return info(music.currentTrack());
    } catch (e) {
      return null;
    }
  }
  function fadeVolume(target) {
    var from = music.soundVolume();
    var started = Date.now();
    while (from !== target && Date.now() - started < 350) {
      var progress = Math.min(1, (Date.now() - started) / 350);
      var eased = progress * progress * (3 - 2 * progress);
      music.soundVolume = Math.round(from + (target - from) * eased);
      delay(0.02);
    }
    music.soundVolume = target;
  }
  if (action === 'status')
    return JSON.stringify({
      available: true,
      running: music.running(),
      ...(music.running()
        ? {
            state: music.playerState(),
            volume: music.soundVolume(),
            position: music.playerPosition(),
            track: current(),
          }
        : {}),
    });
  if (!music.running())
    throw new Error('Öppna Musik-appen och logga in på Apple Music först.');
  if (action === 'check') {
    var checked = [];
    for (var id of data.ids) {
      var found = music.libraryPlaylists[0].tracks.whose({persistentID: id})();
      if (found.length) checked.push(info(found[0]));
    }
    return JSON.stringify({tracks: checked});
  }
  if (action === 'selection') {
    var selected = music.selection();
    if (!selected || !selected.length)
      throw new Error('Markera en låt i ditt bibliotek i Musik-appen först.');
    var chosen = info(selected[0]);
    var library = music.libraryPlaylists[0].tracks.whose({
      persistentID: chosen.persistentId,
    })();
    if (!library.length)
      throw new Error('Lägg till låten i ditt Apple Music-bibliotek först.');
    return JSON.stringify(chosen);
  }
  if (action === 'search') {
    var results = music.search(music.libraryPlaylists[0], {
        for: data.query,
        only: 'all',
      }),
      tracks = [];
    for (var i = 0; i < Math.min(results.length, 200); i++)
      tracks.push(info(results[i]));
    return JSON.stringify({ tracks: tracks, limited: results.length >= 200 });
  }
  if (action === 'volume') {
    fadeVolume(data.volume);
    return JSON.stringify({ ok: true, volume: music.soundVolume() });
  }
  if (action === 'pause') {
    if (!data.persistentId || current()?.persistentId === data.persistentId)
      music.pause();
    return JSON.stringify({ ok: true });
  }
  if (action === 'play' || action === 'preview') {
    var tracks = music.libraryPlaylists[0].tracks.whose({
      persistentID: data.persistentId,
    })();
    if (!tracks.length)
      throw new Error(
        'Låten hittades inte i Musik-biblioteket på den här datorn.',
      );
    var duration = tracks[0].duration();
    if (data.position >= duration)
      throw new Error('Startpunkten ligger efter låtens slut.');
    var previousVolume = music.soundVolume();
    try {
      music.soundVolume = 0;
      music.stop();
      music.play(tracks[0], { once: true });
      var ready = false,
        initialPosition = null;
      for (var n = 0; n < 250; n++) {
        if (
          music.playerState() === 'playing' &&
          current()?.persistentId === data.persistentId
        ) {
          var observedPosition = music.playerPosition();
          if (
            initialPosition !== null &&
            observedPosition > initialPosition + 0.15
          ) {
            ready = true;
            break;
          }
          if (initialPosition === null) initialPosition = observedPosition;
        }
        delay(0.1);
      }
      if (!ready) {
        music.pause();
        throw new Error(
          'Musik kom inte igång inom 25 sekunder. Öppna låten direkt i Musik och kontrollera felmeddelandet. För tidigare köp kan du behöva välja Konto → Auktoriseringar → Auktorisera den här datorn.',
        );
      }
      music.playerPosition = data.position;
      delay(0.15);
      if (Math.abs(music.playerPosition() - data.position) > 2) {
        music.pause();
        throw new Error('Musik kunde inte söka till rätt position i låten.');
      }
      {
        var startPosition = music.playerPosition();
        var progressing = false;
        // Music can briefly report the pre-seek position before applying a
        // streaming seek. Allow buffering and rebase when that position drops.
        for (var attempt = 0; attempt < 50; attempt++) {
          delay(0.1);
          if (current()?.persistentId !== data.persistentId) break;
          var position = music.playerPosition();
          startPosition = Math.min(startPosition, position);
          if (
            music.playerState() === 'playing' &&
            position > startPosition + 0.15
          ) {
            progressing = true;
            break;
          }
        }
        if (!progressing)
          throw new Error(
            'Låten startade men uppspelningen gick inte framåt. Prova låten direkt i Musik-appen.',
          );
      }
      // The sought position is progressing: fade in without seeking again,
      // which could trigger another silent streaming buffer.
      fadeVolume(data.volume);
      if (action === 'preview') {
        var previewPosition = music.playerPosition();
        delay(
          Math.min(
            3,
            Math.max(0.3, duration - previewPosition - 0.2),
          ),
        );
        if (
          current()?.persistentId !== data.persistentId ||
          music.playerPosition() <= previewPosition + 0.1
        )
          throw new Error(
            'Låten startade men uppspelningen gick inte framåt. Prova låten direkt i Musik-appen.',
          );
      }
      return JSON.stringify({
        ok: true,
        track: info(tracks[0]),
        position: music.playerPosition(),
      });
    } catch (error) {
      if (current()?.persistentId === data.persistentId) music.pause();
      music.soundVolume = previousVolume;
      throw error;
    } finally {
      if (action === 'preview') {
        if (current()?.persistentId === data.persistentId) music.pause();
        music.soundVolume = previousVolume;
      }
    }
  }
  throw new Error('Okänd musikkontroll.');
}
