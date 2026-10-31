import React, { useState } from 'react';
import { liveOrdersClient } from '../../api/liveOrdersClient';

export const LiveOrderOperationsPage: React.FC = () => {
    const [liveOrderId, setLiveOrderId] = useState('');
    const [status, setStatus] = useState<any>(null);

    const handleAction = async (action: string) => {
        if (!liveOrderId) return;
        try {
            let res;
            switch(action) {
                case 'evaluate': res = await liveOrdersClient.evaluateLiveOrder(liveOrderId); break;
                case 'enterQueue': res = await liveOrdersClient.enterQueue(liveOrderId); break;
                case 'start': res = await liveOrdersClient.startProduction(liveOrderId); break;
                case 'handoff': res = await liveOrdersClient.generateHandoff(liveOrderId); break;
                case 'send': res = await liveOrdersClient.sendToPrinthouse(liveOrderId); break;
                case 'complete': res = await liveOrdersClient.complete(liveOrderId, { checked: true }); break;
            }
            setStatus(`Success: ${action}`);
        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
        }
    };

    return (
        <div className="live-order-operations">
            <h1>Live Order Operations Console</h1>
            <p className="warning">CAUTION: This console controls limited commercial live pilot orders.</p>
            
            <div className="control-group">
                <input 
                    type="text" 
                    placeholder="Live Order ID" 
                    value={liveOrderId} 
                    onChange={e => setLiveOrderId(e.target.value)} 
                />
            </div>

            <div className="actions" style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => handleAction('evaluate')}>Evaluate Gates</button>
                <button onClick={() => handleAction('enterQueue')}>Enter Queue</button>
                <button onClick={() => handleAction('start')}>Start Production</button>
                <button onClick={() => handleAction('handoff')}>Generate Handoff</button>
                <button onClick={() => handleAction('send')}>Send to Printhouse</button>
                <button onClick={() => handleAction('complete')}>Complete Order</button>
            </div>

            {status && <div className="status-message" style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0' }}>{status}</div>}
        </div>
    );
};
