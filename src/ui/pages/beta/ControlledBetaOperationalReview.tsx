import React, { useState } from 'react';
import { 
  evaluateOperationalReviewReadiness, 
  createOperationalReview, 
  getOperationalReviewScore, 
  getExpansionRecommendation 
} from '../../api/controlledBetaOperationalReviewClient';

const ControlledBetaOperationalReview: React.FC = () => {
  const [activationId, setActivationId] = useState('');
  const [readiness, setReadiness] = useState<any>(null);

  const handleCheck = async () => {
    try {
      const data = await evaluateOperationalReviewReadiness(activationId);
      setReadiness(data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: '#3b0000', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <strong>WARNING:</strong> Operational review only. This does not enable FULL_PUBLIC, open marketplace, public signup, payment execution, provider submission, tax/accounting submission, source mutation, automatic invites or automatic cohort expansion.
      </div>
      
      <h1>Controlled Beta Operational Review</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          value={activationId} 
          onChange={(e) => setActivationId(e.target.value)} 
          placeholder="Activation ID" 
          style={{ padding: '8px', marginRight: '10px', width: '300px' }}
        />
        <button onClick={handleCheck} style={{ padding: '8px 16px', cursor: 'pointer' }}>Check Readiness</button>
      </div>

      {readiness && (
        <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
          <h2>Review Readiness</h2>
          <p>Status: <strong>{readiness.readiness_status}</strong></p>
          
          {readiness.blocked_reasons && readiness.blocked_reasons.length > 0 && (
            <div>
              <h3 style={{ color: 'red' }}>Blocked Reasons:</h3>
              <ul>
                {readiness.blocked_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          
          <h3>Review Period & Exit Criteria</h3>
          <p><em>Check phase 130 evidence, runtime health, operational risk, incident summary, and access stability.</em></p>
          
          <h3>Operational Scores & Expansion Recommendation</h3>
          <p><em>(Mocked UI placeholders for scores and recommendations)</em></p>
          
          <h3>Decision Draft & Approval Workflow</h3>
          <p><em>Create decision drafts to Remain, Pause, or Recommend Expansion.</em></p>
        </div>
      )}
    </div>
  );
};

export default ControlledBetaOperationalReview;
