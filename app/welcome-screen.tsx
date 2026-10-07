'use client';
import { Smartphone, Users, Wifi } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { QuizSymbol } from './quiz-branding';
import { QuizState } from '@/lib/quiz';

export function WelcomeScreen({
  state,
  preview = false,
}: {
  state: QuizState;
  preview?: boolean;
}) {
  const connection = state.connection;
  const url = connection?.joinUrl;
  const screen = useRef<HTMLElement>(null);
  useEffect(() => {
    let visible = false;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!visible || document.visibilityState !== 'visible' || pending) return;
      pending = true;
      try {
        await fetch('/api/connection/current', {
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch {
        // The regular quiz poll owns connectivity errors; try again next time.
      } finally {
        pending = false;
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) void refresh();
    });
    if (screen.current) observer.observe(screen.current);
    const onVisible = () => {
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, 30000);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
      controller.abort();
    };
  }, []);
  return (
    <section
      ref={screen}
      className={`welcome-screen ${preview ? 'welcome-preview' : ''}`}
      aria-label="Välkommen till quizet"
    >
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">
            <QuizSymbol branding={state.branding} />{' '}
            {state.branding.subtitle.toUpperCase()}
          </p>
          <h2>{state.branding.welcomeTitle}</h2>
        </div>
        <span className="welcome-count">
          <Users size={20} /> {state.teams.length} lag på plats
        </span>
      </div>
      <ol className="welcome-steps">
        <li>
          <div className="welcome-step-title">
            <span>1</span>
            <h3>Bilda ett lag</h3>
          </div>
          <p>{state.branding.welcomeText}</p>
          <div className="welcome-team-note">
            <Users aria-hidden="true" />
            <strong>
              Ett lag.
              <br />
              En mobil.
              <br />
              Ett gemensamt svar.
            </strong>
          </div>
        </li>
        <li>
          <div className="welcome-step-title">
            <span>2</span>
            <h3>Anslut till wifi</h3>
          </div>
          <p>Lagets mobil ska vara på samma nätverk som quizdatorn.</p>
          <strong className="welcome-ssid">
            <Wifi size={22} />{' '}
            {connection?.ssid || 'Se nätverket hos programledaren'}
          </strong>
          {connection?.wifiQr ? (
            <>
              <Image
                unoptimized
                loading="eager"
                className="welcome-qr"
                src={connection.wifiQr}
                alt={`QR-kod för att ansluta till ${connection.ssid}`}
                width={240}
                height={240}
              />
              <p className="welcome-caption">
                Skanna med mobilkameran för att ansluta.
              </p>
            </>
          ) : (
            <div className="welcome-manual">
              <Wifi aria-hidden="true" />
              <p>
                Öppna mobilens wifi-inställningar och välj nätverket. Fråga
                programledaren om inloggningen.
              </p>
            </div>
          )}
        </li>
        <li>
          <div className="welcome-step-title">
            <span>3</span>
            <h3>Gå med i quizet</h3>
          </div>
          <p>När wifi är anslutet: skanna koden och skriv in ert lagnamn.</p>
          <p className="welcome-code">
            Spelkod <strong className="mono">{state.code}</strong>
          </p>
          {connection?.joinQr && url ? (
            <>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label="Öppna quizets laganmälan"
              >
                <Image
                  unoptimized
                  loading="eager"
                  className="welcome-qr"
                  src={connection.joinQr}
                  alt="QR-kod till quizet med spelkoden ifylld"
                  width={240}
                  height={240}
                />
              </a>
              <a
                className="welcome-url mono"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {state.joinUrls?.[0]?.replace('http://', '').replace(/\/$/, '')}
              </a>
            </>
          ) : (
            <p className="welcome-manual">
              Programledaren visar anslutningsadressen strax.
            </p>
          )}
        </li>
      </ol>
      <div className="welcome-rules">
        <Smartphone aria-hidden="true" />
        <p>
          <strong>Prata ihop er och lås svaret på mobilen.</strong> Tidsfrågor:
          snabbare rätt svar ger fler poäng. Bonus: fasta poäng. Final: satsa
          innan frågan visas.
        </p>
      </div>
      {preview && (
        <span className="welcome-preview-label">
          DET HÄR SER LAGEN PÅ STORBILDEN
        </span>
      )}
    </section>
  );
}
