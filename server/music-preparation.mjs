import { normalizeAppleTrack, fail } from './model.mjs';
import { matchingLibraryTracks } from './music-catalog.mjs';

// Only invoked by an explicit host action, never by search, playback or health checks.
export function createMusicPreparation({
  music,
  catalog,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  const pending = new Map();
  async function find(track) {
    const matches = matchingLibraryTracks(
      track,
      (await music.search(track.name)).tracks,
    );
    if (matches.length > 1)
      fail(
        'Flera bibliotekslåtar matchar. Välj rätt version under Mitt bibliotek.',
      );
    return matches[0];
  }
  async function prepare(input) {
    const track = normalizeAppleTrack(input);
    if (track.persistentId) {
      const checked = (await music.check([track.persistentId])).tracks;
      if (matchingLibraryTracks(track, checked).length === 1) return track;
      if (!track.url)
        fail(
          'Den kopplade låten saknas eller har ändrats. Välj en låt från Apples katalog.',
        );
    }
    const selected = await catalog.lookup(track.url);
    let match = await find(selected);
    if (match) {
      pending.delete(selected.url);
      return { ...selected, persistentId: match.persistentId };
    }
    // A retry during Music's sync must not enqueue another library mutation.
    if (
      !pending.has(selected.url) ||
      now() - pending.get(selected.url) > 120000
    ) {
      await music.add(selected.url);
      if (pending.size >= 200) pending.delete(pending.keys().next().value);
      pending.set(selected.url, now());
    }
    for (let i = 0; i < 30; i++) {
      match = await find(selected);
      if (match) {
        pending.delete(selected.url);
        return { ...selected, persistentId: match.persistentId };
      }
      await sleep(1000);
    }
    fail(
      'Tillägget skickades till Musik, men låten syns ännu inte i biblioteket. Kontrollera dialoger och Fönster → Aktivitet i Musik. Vänta på synkroniseringen och försök igen; tillägget skickas inte på nytt inom två minuter.',
    );
  }
  return {
    prepare,
    async prepareQuestion(store, { sessionId, projectId, questionId, track }) {
      const state = store.export();
      if (
        state.id !== sessionId ||
        (state.projectId || null) !== (projectId || null)
      )
        fail(
          'Quizet har bytts. Avbryt och starta tillägget igen i rätt projekt.',
        );
      const question = state.questions.find((q) => q.id === questionId);
      if (
        !question ||
        question.audioSource !== 'appleMusic' ||
        JSON.stringify(question.appleMusic) !== JSON.stringify(track)
      )
        fail('Frågans låt har ändrats. Starta tillägget igen.');
      if (
        state.finalQuestionId === questionId ||
        state.rounds.some((r) => r.question.id === questionId)
      )
        fail(
          'Frågan är redan förberedd eller spelad. Kopplingen kan inte ändras.',
        );
      const linked = await prepare(question.appleMusic);
      // The caller holds the host queue throughout this operation.
      store.command('saveQuestion', { ...question, appleMusic: linked });
      return { track: linked };
    },
  };
}
