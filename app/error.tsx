'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="workspace loading-page">
      <p className="eyebrow accent">QUIZ.</p>
      <h1>Vi tappade takten.</h1>
      <p>
        Sidan behöver laddas om. Svar som fått kvitto är sparade på quizdatorn.
      </p>
      <button className="button" onClick={reset}>
        Försök igen
      </button>
      <button
        className="button secondary"
        onClick={() => window.location.reload()}
      >
        Ladda om sidan
      </button>
    </main>
  );
}
