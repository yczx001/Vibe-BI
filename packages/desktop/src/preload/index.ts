try {
  const { contextBridge, ipcRenderer } = require('electron');
  type AiAgentSettings = {
    provider: 'anthropic' | 'openai';
    baseUrl: string;
    apiKey: string;
    model: string;
    maxRepairRounds: number;
    traceVerbosity: 'summary' | 'detailed';
  };
  type SelectFileOptions = {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  };

  // Expose APIs to renderer process
  contextBridge.exposeInMainWorld('electronAPI', {
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    getAgentUrl: () => ipcRenderer.invoke('get-agent-url'),
    loadAiSettings: () => ipcRenderer.invoke('load-ai-settings') as Promise<AiAgentSettings>,
    saveAiSettings: (settings: AiAgentSettings) => ipcRenderer.invoke('save-ai-settings', settings) as Promise<AiAgentSettings>,
    openBrowserPreview: (payload: unknown) => ipcRenderer.invoke('open-browser-preview', payload) as Promise<string>,
    selectFile: (options: SelectFileOptions) => ipcRenderer.invoke('select-file', options),
    readTextFile: (filePath: string) => ipcRenderer.invoke('read-text-file', filePath),
    saveFile: (defaultName: string) => ipcRenderer.invoke('save-file', defaultName),
    scanPowerBiInstances: () => ipcRenderer.invoke('scan-powerbi-instances'),
  });
} catch (err) {
  console.error('[Preload] Error:', err);
}
