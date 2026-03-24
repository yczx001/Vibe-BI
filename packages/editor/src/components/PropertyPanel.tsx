import { useEditorStore } from '../store/editorStore';

export function PropertyPanel() {
  const { selectedComponent } = useEditorStore();

  return (
    <div
      className="property-panel"
      style={{
        width: 280,
        background: '#0F172A',
        borderLeft: '1px solid #334155',
        padding: 16,
      }}
    >
      <h3 style={{ margin: '0 0 16px', color: '#F8FAFC' }}>Properties</h3>
      {selectedComponent ? (
        <div style={{ color: '#94A3B8' }}>
          <p>Component: {selectedComponent}</p>
        </div>
      ) : (
        <p style={{ color: '#64748B' }}>Select a component to edit</p>
      )}
    </div>
  );
}
