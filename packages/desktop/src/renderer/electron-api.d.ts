type PowerBiScanItem = {
  id: string;
  processId: number;
  windowTitle: string;
  port: number;
  connectionTarget: string;
  label: string;
};

type SelectFileOptions = {
  title?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
};

interface ElectronApi {
  getApiUrl: () => Promise<string>;
  selectFile: (options?: SelectFileOptions) => Promise<string | null>;
  readTextFile: (filePath: string) => Promise<string | null>;
  saveFile: (defaultName: string) => Promise<string | null>;
  scanPowerBiInstances: () => Promise<PowerBiScanItem[]>;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}

export {};
