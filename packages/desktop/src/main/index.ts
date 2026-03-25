import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

// ES Module __dirname polyfill (relative to dist/main/index.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dotnetProcess: ChildProcess | null = null;
let apiPort: number = 0;
const execFileAsync = promisify(execFile);

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

type PowerBiScanItem = {
  id: string;
  processId: number;
  windowTitle: string;
  port: number;
  connectionTarget: string;
  label: string;
};

type OpenDialogFilter = {
  name: string;
  extensions: string[];
};

type SelectFileOptions = {
  title?: string;
  filters?: OpenDialogFilter[];
};

type BackendLaunchConfig = {
  command: string;
  args: string[];
  cwd: string;
};

function decodeTextFile(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8', 3);
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le', 2);
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }

  return buffer.toString('utf8');
}

async function resolveBackendLaunch(): Promise<BackendLaunchConfig> {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', '..', '..', '..', 'server', 'src', 'VibeBi.Api', 'bin', 'Debug', 'net10.0');

  const exePath = path.join(backendDir, 'VibeBi.Api.exe');
  const dllPath = path.join(backendDir, 'VibeBi.Api.dll');

  if (process.platform === 'win32') {
    try {
      await fs.access(exePath);
      return {
        command: exePath,
        args: ['--urls', 'http://127.0.0.1:0'],
        cwd: backendDir,
      };
    } catch {
      // Fall back to dotnet + dll in dev when the exe hasn't been produced yet.
    }
  }

  await fs.access(dllPath);
  return {
    command: 'dotnet',
    args: [dllPath, '--urls', 'http://127.0.0.1:0'],
    cwd: backendDir,
  };
}

async function startDotNetBackend(): Promise<number> {
  apiPort = 0;
  const launch = await resolveBackendLaunch();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timeout waiting for .NET backend to start'));
      }
    }, 30000);

    const finishResolve = (port: number) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(port);
    };

    const finishReject = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    dotnetProcess = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    dotnetProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[.NET]', output);

      // Parse port from output
      const match = output.match(/Now listening on: http:\/\/127\.0\.0\.1:(\d+)/);
      if (match && !apiPort) {
        apiPort = Number.parseInt(match[1], 10);
        console.log('[Electron] .NET backend started on port:', apiPort);
        finishResolve(apiPort);
      }
    });

    dotnetProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[.NET Error]', data.toString());
    });

    dotnetProcess.on('error', (err) => {
      console.error('[Electron] Failed to start .NET:', err);
      finishReject(err instanceof Error ? err : new Error(String(err)));
    });

    dotnetProcess.on('exit', (code) => {
      console.log(`[Electron] .NET process exited with code ${code}`);
      dotnetProcess = null;
      if (!settled && !apiPort) {
        finishReject(new Error(`.NET backend exited before startup completed (code: ${code ?? 'unknown'})`));
      }
    });
  });
}

function stopDotNetBackend() {
  if (dotnetProcess) {
    console.log('[Electron] Stopping .NET backend...');
    dotnetProcess.kill();
    dotnetProcess = null;
  }
}

export function getApiBaseUrl(): string {
  return `http://localhost:${apiPort}`;
}

async function scanPowerBiInstances(): Promise<PowerBiScanItem[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$pbis = Get-Process -Name PBIDesktop -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle } |
  Select-Object Id, MainWindowTitle, StartTime
$engines = Get-CimInstance Win32_Process -Filter "Name = 'msmdsrv.exe'" -ErrorAction SilentlyContinue |
  Select-Object ProcessId, ParentProcessId
$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') } |
  Select-Object LocalPort, OwningProcess
$result = foreach ($pbi in $pbis) {
  $children = @($engines | Where-Object { $_.ParentProcessId -eq $pbi.Id })
  $childPorts = @($ports |
    Where-Object { $children.ProcessId -contains $_.OwningProcess } |
    Select-Object -ExpandProperty LocalPort -Unique |
    Sort-Object)

foreach ($port in $childPorts) {
    [PSCustomObject]@{
      processId = $pbi.Id
      windowTitle = $pbi.MainWindowTitle
      port = $port
      connectionTarget = "localhost:$port"
    }
  }
}
$json = $result | ConvertTo-Json -Depth 4 -Compress
if ($null -eq $json) {
  ''
} else {
  [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
}
`.trim();

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  const trimmed = String(stdout).trim();
  if (!trimmed || trimmed === 'null') {
    return [];
  }

  const json = Buffer.from(trimmed, 'base64').toString('utf8');

  const parsed = JSON.parse(json) as Array<{
    processId: number;
    windowTitle: string;
    port: number;
    connectionTarget: string;
  }> | {
    processId: number;
    windowTitle: string;
    port: number;
    connectionTarget: string;
  };

  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter((item) => Boolean(item.processId && item.port && item.connectionTarget))
    .map((item) => ({
      id: `${item.processId}-${item.port}`,
      processId: item.processId,
      windowTitle: item.windowTitle || `Power BI Desktop ${item.processId}`,
      port: item.port,
      connectionTarget: item.connectionTarget,
      label: `${item.windowTitle || `Power BI Desktop ${item.processId}`} (${item.connectionTarget})`,
    }));
}

async function createWindow() {
  // Start .NET backend first
  try {
    await startDotNetBackend();
  } catch (err) {
    console.error('[Electron] Failed to start backend:', err);
    dialog.showErrorBox('启动失败', '无法启动后端服务，请检查 .NET 10 是否已安装。');
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Vibe BI',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../dist-electron/index.js'),
    },
  });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  // Load URL based on environment
  const preloadPath = path.join(__dirname, '../../dist-electron/index.js');
  console.log('[Electron] Preload path:', preloadPath);

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Electron] Loading dev server URL:', process.env.VITE_DEV_SERVER_URL);
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    console.log('[Electron] Loading file:', htmlPath);
    await mainWindow.loadFile(htmlPath);
  }

  console.log('[Electron] Window loaded successfully');

  // Log any console messages from renderer
  mainWindow.webContents.on('console-message', (details) => {
    console.log(`[Renderer ${details.level}]`, details.message);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopDotNetBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopDotNetBackend();
});

// IPC handlers
ipcMain.handle('get-api-url', () => {
  return getApiBaseUrl();
});

ipcMain.handle('select-file', async (_, options?: SelectFileOptions) => {
  const result = await dialog.showOpenDialog({
    title: options?.title,
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'Vibe BI Reports', extensions: ['vbi'] },
      { name: 'Power BI', extensions: ['pbix'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('read-text-file', async (_, filePath: string) => {
  if (!filePath) {
    return null;
  }

  const buffer = await fs.readFile(filePath);
  return decodeTextFile(buffer);
});

ipcMain.handle('save-file', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Vibe BI Report', extensions: ['vbi'] }],
  });
  return result.filePath || null;
});

ipcMain.handle('scan-powerbi-instances', async () => {
  return scanPowerBiInstances();
});
