import { useState } from 'react';

export function AIChatPanel() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    // TODO: Call backend API
    setTimeout(() => setIsGenerating(false), 1000);
  };

  return (
    <div
      className="ai-chat-panel"
      style={{
        width: 320,
        background: '#0F172A',
        borderLeft: '1px solid #334155',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h3 style={{ margin: '0 0 16px', color: '#F8FAFC' }}>AI Assistant</h3>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the report you want..."
        style={{
          flex: 1,
          background: '#1E293B',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 12,
          color: '#F8FAFC',
          resize: 'none',
          minHeight: 120,
        }}
      />
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        style={{
          marginTop: 12,
          padding: '12px 24px',
          background: isGenerating ? '#475569' : '#6366F1',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
        }}
      >
        {isGenerating ? 'Generating...' : 'Generate Report'}
      </button>
    </div>
  );
}
