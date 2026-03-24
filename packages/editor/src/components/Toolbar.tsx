export function Toolbar() {
  return (
    <div
      className="toolbar"
      style={{
        height: 48,
        background: '#0F172A',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
      }}
    >
      <span style={{ color: '#6366F1', fontWeight: 600 }}>Vibe BI</span>
      <div style={{ flex: 1 }} />
      <button
        style={{
          padding: '6px 12px',
          background: '#1E293B',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#F8FAFC',
        }}
      >
        Save
      </button>
      <button
        style={{
          padding: '6px 12px',
          background: '#6366F1',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
        }}
      >
        Publish
      </button>
    </div>
  );
}
