console.log('[Preload] Starting preload script...');

try {
  const { contextBridge, ipcRenderer } = require('electron');
  console.log('[Preload] Electron modules loaded');

  // Expose APIs to renderer process
  contextBridge.exposeInMainWorld('electronAPI', {
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    selectFile: () => ipcRenderer.invoke('select-file'),
    saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
  });

  console.log('[Preload] electronAPI exposed successfully');
} catch (err) {
  console.error('[Preload] Error:', err);
}
