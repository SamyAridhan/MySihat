import { useState } from 'react';

const TODAY = new Date().toISOString().split('T')[0];

export default function NewRecordForm({ patientId, codebook, onSave, onCancel }) {
  const [diagnosis,  setDiagnosis]  = useState('');
  const [medication, setMedication] = useState('');
  const [date,       setDate]       = useState(TODAY);
  const [status,     setStatus]     = useState('Active');
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  // Find the selected diagnosis entry to show its ICD-10 code live
  const selectedDiag = codebook.diagnosis.find(d => d.text === diagnosis);

  async function handleSave() {
    if (!diagnosis || !medication || !date || !status) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ diagnosis, medication, date, status });
      setSaved(true);
      setTimeout(() => onCancel(), 1200); // brief success flash then back to history
    } catch (err) {
      setError(err.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 560 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
          New Record
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500 }}>
          {patientId}
        </div>
      </div>

      <div className="card">
        {saved ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--green)', fontWeight: 600 }}>
            ✓ Record saved successfully
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && <div className="error-banner">{error}</div>}

            {/* Diagnosis */}
            <div>
              <label className="label">Diagnosis</label>
              <select className="select" value={diagnosis} onChange={e => setDiagnosis(e.target.value)}>
                <option value="">Select diagnosis…</option>
                {codebook.diagnosis.map(d => (
                  <option key={d.intId} value={d.text}>
                    {d.text} ({d.icd10})
                  </option>
                ))}
              </select>
              {selectedDiag && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ICD-10:</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    background: 'var(--teal-light)',
                    color: 'var(--teal-dark)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontWeight: 500
                  }}>
                    {selectedDiag.icd10}
                  </span>
                </div>
              )}
            </div>

            {/* Medication */}
            <div>
              <label className="label">Medication</label>
              <select className="select" value={medication} onChange={e => setMedication(e.target.value)}>
                <option value="">Select medication…</option>
                {codebook.medication.map(m => (
                  <option key={m.intId} value={m.text}>{m.text}</option>
                ))}
              </select>
            </div>

            {/* Date + Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="label">Visit Date</label>
                <input
                  className="input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving to card…' : 'Save to Card'}
              </button>
              <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Record will be compressed to 6 bytes and written to card + local queue
      </div>
    </div>
  );
}