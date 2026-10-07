// A shuffle bag plays every track before refilling, avoiding repeats at its boundary.
export function createBedPlaylist(random = Math.random) {
  let current = null;
  let boundary;
  let remaining = [];
  let signature = '';
  return (tracks, nextBoundary) => {
    const nextSignature = JSON.stringify(tracks);
    if (signature !== nextSignature) {
      signature = nextSignature;
      remaining = [];
      if (!tracks.includes(current)) current = null;
    }
    if (!tracks.length) return (current = null);
    if (current && boundary === nextBoundary) return current;
    boundary = nextBoundary;
    if (!remaining.length) {
      remaining = [...tracks];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining[0] === current)
        [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
    }
    current = remaining.shift();
    return current;
  };
}
