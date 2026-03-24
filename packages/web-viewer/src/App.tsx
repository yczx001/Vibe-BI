import { useState } from 'react';
import { ThemeProvider } from '@vibe-bi/renderer';

function App() {
  const [connectionString, setConnectionString] = useState('');

  return (
    <ThemeProvider>
      <div style={{ padding: 40 }}>
        <h1 style={{ marginBottom: 24 }}>Vibe BI Viewer</h1>
        <div style={{ maxWidth: 600 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#94A3B8' }}>
            Power BI / SSAS Connection String
          </label>
          <input
            type="text"
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="Data Source=localhost:port;..."
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#F8FAFC',
              fontSize: 14,
            }}
          />
          <button
            style={{
              marginTop: 16,
              padding: '12px 24px',
              background: '#6366F1',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => console.log('Connecting to:', connectionString)}
          >
            Connect
          </button>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
