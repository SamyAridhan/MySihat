import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, Activity, AlertCircle, CheckCircle, Database, CreditCard, User, FileText, Save } from 'lucide-react';

// Medical Code Dictionaries (ICD-10 & ATC simplified)
const ICD10_CODES = {
  'R50': 'Fever',
  'E11': 'Type 2 Diabetes Mellitus',
  'I10': 'Essential Hypertension',
  'J06.9': 'Upper Respiratory Infection',
  'M79.3': 'Myalgia',
  'K21.9': 'GERD',
  'E78.5': 'Hyperlipidemia',
  'R51': 'Headache',
  'J00': 'Common Cold'
};

const ATC_CODES = {
  'N02BE01': 'Paracetamol',
  'A10BA02': 'Metformin',
  'C09AA02': 'Enalapril',
  'J01CA04': 'Amoxicillin',
  'A02BC01': 'Omeprazole',
  'C10AA01': 'Simvastatin',
  'R06AE07': 'Cetirizine',
  'N02BA01': 'Aspirin'
};

// Simulated patient database
const PATIENT_DB = {
  '920815-01-5234': {
    name: 'Ahmad bin Abdullah',
    bloodType: 'O+',
    allergies: ['Penicillin'],
    chronic: ['E11', 'I10'],
    visits: [
      { date: '251105', diagnosis: 'E11', meds: 'A10BA02', compressedSize: 18 },
      { date: '251120', diagnosis: 'I10', meds: 'C09AA02', compressedSize: 18 },
      { date: '251201', diagnosis: 'R50', meds: 'N02BE01', compressedSize: 16 }
    ]
  },
  '880523-14-6789': {
    name: 'Siti binti Hassan',
    bloodType: 'A+',
    allergies: ['Sulfa drugs'],
    chronic: ['E78.5'],
    visits: [
      { date: '251015', diagnosis: 'J06.9', meds: 'J01CA04', compressedSize: 20 },
      { date: '251110', diagnosis: 'E78.5', meds: 'C10AA01', compressedSize: 20 }
    ]
  },
  '750310-03-4521': {
    name: 'Kumar a/l Ramasamy',
    bloodType: 'B+',
    allergies: [],
    chronic: [],
    visits: []
  }
};

const SmartIDDemo = () => {
  const [flowStage, setFlowStage] = useState('idle'); // idle, reading, loaded, diagnosing, writing, complete
  const [icNumber, setIcNumber] = useState('');
  const [patientData, setPatientData] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  
  const [newVisit, setNewVisit] = useState({
    diagnosis: '',
    medication: '',
    notes: ''
  });

  const [showSuccess, setShowSuccess] = useState(false);

  // Simulate IC card reading
  const handleReadIC = () => {
    if (!icNumber.trim()) {
      alert('Please enter IC number or simulate card scan');
      return;
    }

    setIsReading(true);
    setFlowStage('reading');

    // Simulate card reader delay
    setTimeout(() => {
      const patient = PATIENT_DB[icNumber];
      
      if (patient) {
        setPatientData(patient);
        setFlowStage('loaded');
      } else {
        alert('IC Number not found in database. Try: 920815-01-5234');
        setFlowStage('idle');
      }
      setIsReading(false);
    }, 1500);
  };

  // Handle writing new visit to chip
  const handleWriteToChip = () => {
    if (!newVisit.diagnosis || !newVisit.medication) {
      alert('Please select both diagnosis and medication');
      return;
    }

    setIsWriting(true);
    setFlowStage('writing');

    // Simulate writing to chip
    setTimeout(() => {
      const today = new Date();
      const dateCode = today.toISOString().slice(2,10).replace(/-/g,'').slice(0,6);
      
      const compressedSize = dateCode.length + newVisit.diagnosis.length + newVisit.medication.length + 2;

      const visit = {
        date: dateCode,
        diagnosis: newVisit.diagnosis,
        meds: newVisit.medication,
        compressedSize
      };

      // Update patient data
      const updatedVisits = [...patientData.visits, visit];
      if (updatedVisits.length > 200) {
        updatedVisits.shift(); // Circular buffer
      }

      setPatientData({
        ...patientData,
        visits: updatedVisits
      });

      setIsWriting(false);
      setFlowStage('complete');
      setShowSuccess(true);
      setNewVisit({ diagnosis: '', medication: '', notes: '' });

      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    }, 2000);
  };

  // Reset for new patient
  const handleNewPatient = () => {
    setFlowStage('idle');
    setIcNumber('');
    setPatientData(null);
    setNewVisit({ diagnosis: '', medication: '', notes: '' });
    setShowSuccess(false);
  };

  // Quick load demo patients
  const loadDemoPatient = (ic) => {
    setIcNumber(ic);
    setTimeout(() => {
      setIsReading(true);
      setFlowStage('reading');
      setTimeout(() => {
        const patient = PATIENT_DB[ic];
        if (patient) {
          setPatientData(patient);
          setFlowStage('loaded');
        }
        setIsReading(false);
      }, 1500);
    }, 100);
  };

  const calculateStorage = () => {
    if (!patientData) return { critical: 1024, history: 0, available: 29696, percentage: 3.3 };
    
    const criticalSize = 1024;
    const usedHistorySize = patientData.visits.reduce((acc, v) => acc + v.compressedSize, 0);
    const totalSize = 30720;
    
    return {
      critical: criticalSize,
      history: usedHistorySize,
      available: totalSize - criticalSize - usedHistorySize,
      percentage: ((criticalSize + usedHistorySize) / totalSize * 100).toFixed(1)
    };
  };

  const storage = calculateStorage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-800 flex items-center justify-center gap-2">
            <Heart className="text-red-500" />
            My Sihat: Smart ID Clinic System
          </h1>
          <p className="text-gray-600">Offline-First Medical Record Management</p>
        </div>

        {/* Flow Stage Indicator */}
        <div className="flex justify-center gap-2">
          <div className={`px-4 py-2 rounded-full text-sm font-semibold transition ${flowStage === 'idle' || flowStage === 'reading' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
            1. Read IC
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold transition ${flowStage === 'loaded' || flowStage === 'diagnosing' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
            2. View Records
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold transition ${flowStage === 'diagnosing' || flowStage === 'writing' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
            3. Diagnose
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold transition ${flowStage === 'complete' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
            4. Write to Chip
          </div>
        </div>

        {/* Stage 1: IC Card Reader */}
        {(flowStage === 'idle' || flowStage === 'reading') && (
          <Card className="border-2 border-blue-400">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CreditCard className="text-blue-600" />
                Step 1: IC Card Reader Interface
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Place IC card on reader or enter IC number manually
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter IC Number (e.g., 920815-01-5234)"
                  value={icNumber}
                  onChange={(e) => setIcNumber(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleReadIC()}
                  className="flex-1 border-2 border-gray-300 rounded-lg p-3 text-lg"
                  disabled={isReading}
                />
                <button 
                  onClick={handleReadIC}
                  disabled={isReading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
                >
                  {isReading ? 'Reading...' : 'Read IC Card'}
                </button>
              </div>

              {isReading && (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Reading IC chip data...</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-2">Quick Load Demo Patients:</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => loadDemoPatient('920815-01-5234')} className="text-xs bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">
                    Ahmad (Diabetic)
                  </button>
                  <button onClick={() => loadDemoPatient('880523-14-6789')} className="text-xs bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">
                    Siti (Hyperlipidemia)
                  </button>
                  <button onClick={() => loadDemoPatient('750310-03-4521')} className="text-xs bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">
                    Kumar (New Patient)
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stage 2 & 3: Patient Info Display + New Diagnosis */}
        {(flowStage === 'loaded' || flowStage === 'diagnosing' || flowStage === 'writing' || flowStage === 'complete') && patientData && (
          <>
            {/* Success Message */}
            {showSuccess && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <strong>Successfully written to IC chip!</strong> New medical record saved to patient's Smart ID.
                </AlertDescription>
              </Alert>
            )}

            {/* Patient Info & Storage */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="border-l-4 border-blue-500">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="text-blue-600" />
                    Patient Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>IC Number:</strong> {icNumber}</div>
                  <div><strong>Name:</strong> {patientData.name}</div>
                  <div><strong>Blood Type:</strong> <span className="bg-red-100 px-2 py-1 rounded">{patientData.bloodType}</span></div>
                  <div>
                    <strong>Allergies:</strong> 
                    {patientData.allergies.length > 0 ? (
                      <span className="bg-yellow-100 px-2 py-1 rounded ml-2">{patientData.allergies.join(', ')}</span>
                    ) : (
                      <span className="text-gray-500 ml-2">None</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-orange-500">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="text-orange-600" />
                    Chronic Conditions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {patientData.chronic.length > 0 ? (
                    patientData.chronic.map(code => (
                      <div key={code} className="bg-orange-100 px-3 py-2 rounded text-sm">
                        <strong>{code}</strong> - {ICD10_CODES[code]}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No chronic conditions</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-l-4 border-green-500">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Database className="text-green-600" />
                    Chip Storage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-gray-600">Usage: {storage.percentage}%</div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-green-500 h-4 rounded-full transition-all"
                      style={{width: `${storage.percentage}%`}}
                    />
                  </div>
                  <div className="text-xs space-y-1">
                    <div>History: {storage.history} bytes</div>
                    <div>Visits: {patientData.visits.length}</div>
                    <div className="text-green-600 font-semibold">Available: {(storage.available/1024).toFixed(1)}KB</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Medical History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="text-blue-600" />
                  Step 2: Medical History (from IC Chip)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {patientData.visits.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Diagnosis</th>
                          <th className="p-2 text-left">Medication</th>
                          <th className="p-2 text-left">Chip Data</th>
                          <th className="p-2 text-left">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...patientData.visits].reverse().map((visit, idx) => (
                          <tr key={idx} className="border-b hover:bg-blue-50">
                            <td className="p-2">{visit.date.slice(0,2)}/{visit.date.slice(2,4)}/{visit.date.slice(4,6)}</td>
                            <td className="p-2">
                              <div className="font-semibold">{ICD10_CODES[visit.diagnosis]}</div>
                              <div className="text-xs text-gray-500">{visit.diagnosis}</div>
                            </td>
                            <td className="p-2">
                              <div className="font-semibold">{ATC_CODES[visit.meds]}</div>
                              <div className="text-xs text-gray-500">{visit.meds}</div>
                            </td>
                            <td className="p-2 font-mono text-xs bg-gray-100">{visit.date}|{visit.diagnosis}|{visit.meds}</td>
                            <td className="p-2 text-green-600 font-semibold">{visit.compressedSize}B</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <p className="text-lg font-semibold">New Patient - No Previous Visits</p>
                    <p className="text-sm">Add first medical record below</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* New Visit Form */}
            {(flowStage !== 'complete') && (
              <Card className="border-2 border-green-400">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Activity className="text-green-600" />
                    Step 3: Today's Consultation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2">Diagnosis (ICD-10)</label>
                      <select 
                        className="w-full border-2 border-gray-300 rounded-lg p-3"
                        value={newVisit.diagnosis}
                        onChange={(e) => {
                          setNewVisit({...newVisit, diagnosis: e.target.value});
                          if (flowStage === 'loaded') setFlowStage('diagnosing');
                        }}
                        disabled={isWriting}
                      >
                        <option value="">Select diagnosis...</option>
                        {Object.entries(ICD10_CODES).map(([code, name]) => (
                          <option key={code} value={code}>{name} ({code})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">Medication (ATC)</label>
                      <select 
                        className="w-full border-2 border-gray-300 rounded-lg p-3"
                        value={newVisit.medication}
                        onChange={(e) => setNewVisit({...newVisit, medication: e.target.value})}
                        disabled={isWriting}
                      >
                        <option value="">Select medication...</option>
                        {Object.entries(ATC_CODES).map(([code, name]) => (
                          <option key={code} value={code}>{name} ({code})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Clinical Notes (Optional)</label>
                    <textarea 
                      className="w-full border-2 border-gray-300 rounded-lg p-3"
                      rows="3"
                      placeholder="Additional notes (not stored on chip, kept in clinic system)"
                      value={newVisit.notes}
                      onChange={(e) => setNewVisit({...newVisit, notes: e.target.value})}
                      disabled={isWriting}
                    />
                  </div>

                  <button 
                    onClick={handleWriteToChip}
                    disabled={isWriting || !newVisit.diagnosis || !newVisit.medication}
                    className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition disabled:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    {isWriting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Writing to IC Chip...
                      </>
                    ) : (
                      <>
                        <Save />
                        Step 4: Write to IC Chip & Complete Visit
                      </>
                    )}
                  </button>
                </CardContent>
              </Card>
            )}

            {/* Complete - New Patient Button */}
            {flowStage === 'complete' && (
              <Card className="border-2 border-green-500 bg-green-50">
                <CardContent className="py-6">
                  <div className="text-center space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
                    <h3 className="text-2xl font-bold text-green-800">Visit Complete!</h3>
                    <p className="text-gray-700">Medical record successfully saved to {patientData.name}'s IC chip</p>
                    <button 
                      onClick={handleNewPatient}
                      className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
                    >
                      Next Patient
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Technical Info Footer */}
        <Card className="bg-blue-50 border-blue-300">
          <CardContent className="py-4">
            <div className="grid md:grid-cols-3 gap-4 text-xs">
              <div>
                <strong className="text-blue-700">Compression Ratio:</strong>
                <p className="text-gray-700">Average 85% reduction using ICD-10/ATC codes</p>
              </div>
              <div>
                <strong className="text-blue-700">Storage Capacity:</strong>
                <p className="text-gray-700">~500-800 visits in 20KB circular buffer</p>
              </div>
              <div>
                <strong className="text-blue-700">Offline-First:</strong>
                <p className="text-gray-700">All data readable without internet connection</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SmartIDDemo;
