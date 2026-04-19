import { useEffect, useState } from 'react';
import { getSyncStatus } from '../api';

/**
 * SyncStatusBar — always visible at the bottom of the shell.
 * Polls GET /api/sync/status every 15 seconds.
 */
export default function SyncStatusBar({ token }) {
  const [status, setStatus] = useState(null);

  async function refresh() {
    try {
      const data = await getSyncStatus(token);
      setStatus(data);
    } catch {
      // Silently ignore — bar just stays stale
    }
  }

  useEffect(() => {
    if (!token) return;
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [token]);

  if (!token || !status) return null;

  const online  = status.networkStatus === 'online';
  const queued  = status.queuedRecords;
  const color   = !online ? 'var(--red)' : queued > 0 ? 'var(--amber)' : 'var(--green)';
  const bgColor = !online ? 'var(--red-light)' : queued > 0 ? 'var(--amber-light)' : 'var(--green-light)';
  const label   = !online
    ? `Offline — ${queued} record${queued !== 1 ? 's' : ''} queued`
    : queued > 0
      ? `Online — ${queued} record${queued !== 1 ? 's' : ''} syncing`
      : 'Online — all records synced';

  return (
    <div style={{
      height: 34,
      background: bgColor,
      borderTop: `1px solid ${color}22`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 8,
      flexShrink: 0
    }}>
      <span style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0
      }} />
      <span style={{ fontSize: 11, color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
        {label}
      </span>
      {status.lastSyncSuccess && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          Last sync: {new Date(status.lastSyncSuccess).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}