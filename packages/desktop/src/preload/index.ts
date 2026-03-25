try {
  const { contextBridge, ipcRenderer } = require('electron');

  // Expose APIs to renderer process
  contextBridge.exposeInMainWorld('electronAPI', {
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
    saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
    scanPowerBiInstances: () => ipcRenderer.invoke('scan-powerbi-instances'),
  });
} catch (err) {
  console.error('[Preload] Error:', err);
}
