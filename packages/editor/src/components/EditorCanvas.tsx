import { useEditorStore } from '../store/editorStore';

export function EditorCanvas() {
  const { selectedComponent } = useEditorStore();

  return (
    <div className="editor-canvas" style={{ flex: 1, padding: 20 }}>
      <div
        style={{
          background: '#1E293B',
          borderRadius: 12,
          minHeight: '100%',
          padding: 20,
        }}
      >
        <h2>Editor Canvas</h2>
        {selectedComponent ? (
          <p>Selected: {selectedComponent}</p>
        ) : (
          <p>Drag components here or use AI to generate a report</p>
        )}
      </div>
    </div>
  );
}
