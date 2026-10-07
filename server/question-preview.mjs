// Called through the host queue so a delayed preview cannot stop live playback.
export function createQuestionPreview({
  music,
  resolveTrack,
  isLive,
  volume,
  now = Date.now,
}) {
  let active = null;
  async function stop() {
    if (!active) return;
    await music.pause(active.track.persistentId);
    active = null;
  }
  return {
    stop,
    async expire() {
      if (active && now() >= active.expires) await stop();
    },
    async command(body) {
      const { session, action } = body;
      if (typeof session !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(session))
        throw new Error('Ogiltig provspelning. Öppna provläget igen.');
      if (action === 'stop') {
        if (active?.session === session) await stop();
        return { ok: true };
      }
      if (action === 'ping') {
        if (active?.session !== session)
          throw new Error('Provspelningen har stannat. Tryck på Fortsätt.');
        active.expires = Math.min(active.ends, now() + 15000);
        return { ok: true };
      }
      if (action !== 'start') throw new Error('Ogiltig provspelningskontroll.');
      if (isLive())
        throw new Error(
          'Avsluta den pågående frågan innan du provspelar musik.',
        );
      if (active && active.session !== session)
        throw new Error('En annan provspelning är igång. Stäng den först.');
      if (
        !Number.isFinite(body.remaining) ||
        body.remaining <= 0 ||
        body.remaining > 600000
      )
        throw new Error('Ogiltig frågetid.');
      await stop();
      const track = await resolveTrack(body.track);
      await music.play({
        persistentId: track.persistentId,
        position: body.position,
        volume: volume(),
      });
      active = {
        session,
        track,
        expires: now() + Math.min(15000, body.remaining),
        ends: now() + body.remaining,
      };
      return { ok: true, track };
    },
  };
}
