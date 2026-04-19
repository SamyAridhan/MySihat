export default function PatientHistoryView({ patientId, records, onAddRecord, onEndSession }) {
  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 24,
        gap: 16
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Patient Record
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>
            {patientId}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {records.length} record{records.length !== 1 ? 's' : ''} on file
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={onAddRecord}>
            + Add Record
          </button>
          <button className="btn btn-secondary" onClick={onEndSession}>
            End Session
          </button>
        </div>
      </div>

      {/* Records table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {records.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No records found for this patient.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Diagnosis</th>
                  <th>ICD-10</th>
                  <th>Medication</th>
                  <th>Status</th>
                  <th>Hex</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {r.date}
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.diagnosisText}</td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        background: 'var(--teal-light)',
                        color: 'var(--teal-dark)',
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontWeight: 500
                      }}>
                        {r.diagnosisIcd10}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.medicationText}</td>
                    <td>
                      <span className={`badge badge-${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>
                        {r.compressedHex}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync note */}
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {records.filter(r => !r.synced).length > 0
          ? `${records.filter(r => !r.synced).length} record(s) pending cloud sync`
          : 'All records synced'}
      </div>
    </div>
  );
}