import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';

export function StartupDiagnostics() {
  const { instance, accounts, inProgress } = useMsal();
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const addLog = (message: string) => {
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    };

    addLog('Component mounted');
    addLog(`MSAL inProgress: ${inProgress}`);
    addLog(`Accounts found: ${accounts.length}`);
    addLog(`Current URL: ${window.location.href}`);
    addLog(`Origin: ${window.location.origin}`);

    if (accounts.length > 0) {
      addLog(`User account: ${accounts[0].username}`);
    }

    // Listen for MSAL events
    const callbackId = instance.addEventCallback((event) => {
      addLog(`MSAL Event: ${event.eventType} - ${event.error ? 'ERROR: ' + event.error.message : 'SUCCESS'}`);
    });

    return () => {
      instance.removeEventCallback(callbackId);
    };
  }, [instance, accounts, inProgress]);

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      right: 0, 
      width: '400px', 
      height: '300px', 
      background: 'rgba(0,0,0,0.9)', 
      color: 'white', 
      padding: '10px', 
      fontSize: '12px', 
      zIndex: 9999,
      overflow: 'auto'
    }}>
      <h3>🔍 Startup Diagnostics</h3>
      <button 
        onClick={() => setLogs([])}
        style={{ marginBottom: '10px', padding: '2px 6px' }}
      >
        Clear
      </button>
      <div>
        {logs.map((log, i) => (
          <div key={i} style={{ borderBottom: '1px solid #333', padding: '2px 0' }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}