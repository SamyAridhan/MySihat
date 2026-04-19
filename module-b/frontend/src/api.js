/**
 * api.js — All HTTP calls to the MySihat backend.
 *
 * No fetch() calls anywhere else in the frontend.
 * Every function takes the token as its first argument (except login).
 * On 401, throws an error with message 'UNAUTHORIZED' so App.jsx
 * can catch it and redirect to login.
 */

const BASE = '/api';  // proxied to localhost:3000 by Vite

async function request(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) throw new Error('UNAUTHORIZED');

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function login(username, password) {
  return request('POST', '/auth/login', null, { username, password });
}

export function logout(token) {
  return request('POST', '/auth/logout', token);
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function readCard(token) {
  return request('POST', '/card/read', token);
}

// ── Patient ───────────────────────────────────────────────────────────────────

export function getHistory(token, patientId) {
  return request('GET', `/patient/${patientId}/history`, token);
}

export function saveRecord(token, patientId, record) {
  return request('POST', `/patient/${patientId}/record`, token, record);
}

// ── Codebook ──────────────────────────────────────────────────────────────────

export function getCodebook(token) {
  return request('GET', '/codebook', token);
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export function getSyncStatus(token) {
  return request('GET', '/sync/status', token);
}