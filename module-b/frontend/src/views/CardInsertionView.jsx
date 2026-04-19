import { useEffect, useState } from 'react';

/**
 * CardInsertionView
 *
 * Polls POST /api/card/read every 2 seconds.
 * On success: calls onCardRead(patientId) → App.jsx transitions to history view.
 *
 * In MOCK mode the backend responds immediately with the test patient ID.
 * In REAL mode (Module C) this waits until a physical card is inserted.
 */
export default function CardInsertionView({ onCardRead, onError }) {
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let interval = 2000; // start at 2s
    let timerId;

    async function poll() {
      try {
        const data = await onCardRead();
        if (!cancelled && data?.patientId) return; // success handled in App.jsx
      } catch (err) {
        if (err.message === 'UNAUTHORIZED') return; // App.jsx handles redirect
        // Card not present yet — keep polling with backoff
        if (!cancelled) {
          setAttempts(n => n + 1);
          interval = Math.min(interval * 1.5, 30000); // cap at 30s
          timerId = setTimeout(poll, interval);
        }
      }
    }

    timerId = setTimeout(poll, 500); // first attempt quickly
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="centered fade-in" style={{ flexDirection: 'column', gap: 24 }}>
      {/* Card icon */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: 16,
        background: 'var(--teal-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg className="pulse" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
          <line x1="6" y1="15" x2="10" y2="15"/>
        </svg>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
          Waiting for Patient Card
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 280 }}>
          Insert the patient's MySihat card into the reader to begin.
        </div>
      </div>

      {attempts > 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)'
        }}>
          Polling… attempt {attempts}
        </div>
      )}
    </div>
  );
}