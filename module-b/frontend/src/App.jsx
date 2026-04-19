import { useState, useEffect } from 'react';
import * as api from './api';

import LoginView          from './views/LoginView.jsx';
import CardInsertionView  from './views/CardInsertionView.jsx';
import PatientHistoryView from './views/PatientHistoryView.jsx';
import NewRecordForm      from './views/NewRecordForm.jsx';
import SyncStatusBar      from './components/SyncStatusBar.jsx';

/**
 * App.jsx — root component
 *
 * Owns all application state. Views are dumb — they receive props and
 * call handler functions. No view fetches data on its own.
 *
 * State machine:
 *   'login'    → doctor not authenticated
 *   'card'     → authenticated, waiting for card
 *   'history'  → card read, showing patient history
 *   'new'      → doctor clicked Add New Record
 */
export default function App() {
  const [view,      setView]      = useState('login');
  const [token,     setToken]     = useState(null);
  const [username,  setUsername]  = useState('');
  const [patientId, setPatientId] = useState(null);
  const [records,   setRecords]   = useState([]);
  const [codebook,  setCodebook]  = useState({ diagnosis: [], medication: [] });

  // ── Auth handlers ───────────────────────────────────────────────────────────

  async function handleLogin(user, password) {
    const data = await api.login(user, password);
    setToken(data.token);
    setUsername(data.username);

    // Load codebook immediately after login — needed for the New Record form
    const cb = await api.getCodebook(data.token);
    setCodebook(cb);

    setView('card');
  }

  async function handleLogout() {
    try { await api.logout(token); } catch { /* ignore */ }
    setToken(null);
    setUsername('');
    setPatientId(null);
    setRecords([]);
    setView('login');
  }

  // ── Card handler ────────────────────────────────────────────────────────────

  // Called by CardInsertionView on each poll tick.
  // Returns the raw API response so the view can detect success.
  async function handleCardRead() {
    const data = await api.readCard(token);
    if (data.patientId) {
      setPatientId(data.patientId);
      // Immediately fetch history
      const history = await api.getHistory(token, data.patientId);
      setRecords(history.records);
      setView('history');
    }
    return data;
  }

  // ── Record handlers ─────────────────────────────────────────────────────────

  async function handleSaveRecord(record) {
    await api.saveRecord(token, patientId, record);
    // Refresh history from backend so new record appears with correct data
    const history = await api.getHistory(token, patientId);
    setRecords(history.records);
  }

  function handleEndSession() {
    setPatientId(null);
    setRecords([]);
    setView('card');
  }

  // ── Global 401 handler ──────────────────────────────────────────────────────
  // If any API call returns UNAUTHORIZED, drop back to login.
  // This is handled by api.js throwing Error('UNAUTHORIZED').
  // Views catch it and propagate — App catches it here.

  function wrapHandler(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        if (err.message === 'UNAUTHORIZED') {
          handleLogout();
          return;
        }
        throw err; // re-throw for the view to handle
      }
    };
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Login view has no shell (full-screen centered)
  if (view === 'login') {
    return <LoginView onLogin={wrapHandler(handleLogin)} />;
  }

  return (
    <div className="shell">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-brand">MySihat</div>
        <div className="topbar-meta">
          <span>{username}</span>
          <button
            className="btn btn-secondary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === 'card' && (
          <CardInsertionView
            onCardRead={wrapHandler(handleCardRead)}
            onError={console.error}
          />
        )}

        {view === 'history' && (
          <PatientHistoryView
            patientId={patientId}
            records={records}
            onAddRecord={() => setView('new')}
            onEndSession={handleEndSession}
          />
        )}

        {view === 'new' && (
          <NewRecordForm
            patientId={patientId}
            codebook={codebook}
            onSave={wrapHandler(handleSaveRecord)}
            onCancel={() => setView('history')}
          />
        )}
      </div>

      {/* Sync status bar — always at bottom */}
      <SyncStatusBar token={token} />
    </div>
  );
}