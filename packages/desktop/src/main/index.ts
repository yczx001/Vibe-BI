import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import * as net from 'net';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { format, promisify } from 'util';

// ES Module __dirname polyfill (relative to dist/main/index.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dotnetProcess: ChildProcess | null = null;
let apiPort: number = 0;
let agentProcess: ChildProcess | null = null;
let agentPort: number = 0;
let browserPreviewServer: Server | null = null;
let browserPreviewPort: number = 0;
const browserPreviewEntries = new Map<string, { payload: string; createdAt: number }>();
const execFileAsync = promisify(execFile);
const BROWSER_PREVIEW_TTL_MS = 30 * 60 * 1000;

function isIgnorablePipeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED';
}

function writeLog(stream: NodeJS.WriteStream | null | undefined, args: unknown[]) {
  if (!stream || stream.destroyed || !stream.writable) {
    return;
  }

  try {
    stream.write(`${format(...args)}\n`);
  } catch (error) {
    if (!isIgnorablePipeError(error)) {
      throw error;
    }
  }
}

function logInfo(...args: unknown[]) {
  writeLog(process.stdout, args);
}

function logError(...args: unknown[]) {
  writeLog(process.stderr, args);
}

function cleanupBrowserPreviewEntries(now = Date.now()) {
  for (const [key, entry] of browserPreviewEntries.entries()) {
    if (now - entry.createdAt > BROWSER_PREVIEW_TTL_MS) {
      browserPreviewEntries.delete(key);
    }
  }
}

process.stdout?.on('error', (error) => {
  if (!isIgnorablePipeError(error)) {
    throw error;
  }
});

process.stderr?.on('error', (error) => {
  if (!isIgnorablePipeError(error)) {
    throw error;
  }
});

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

type PythonLaunchConfig = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type PersistedAiSettings = {
  provider: 'anthropic' | 'openai';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxRepairRounds: number;
  traceVerbosity: 'summary' | 'detailed';
};

const defaultAiSettings: PersistedAiSettings = {
  provider: 'anthropic',
  baseUrl: '',
  apiKey: '',
  model: '',
  maxRepairRounds: 2,
  traceVerbosity: 'detailed',
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

function getAiSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'ai-settings.json');
}

function normalizeAiSettings(input: unknown): PersistedAiSettings {
  const record = input && typeof input === 'object'
    ? input as Partial<PersistedAiSettings>
    : {};

  const provider = record.provider === 'openai' ? 'openai' : 'anthropic';
  const traceVerbosity = record.traceVerbosity === 'summary' ? 'summary' : 'detailed';
  const maxRepairRoundsRaw = Number(record.maxRepairRounds);
  const maxRepairRounds = Number.isFinite(maxRepairRoundsRaw)
    ? Math.max(0, Math.min(6, Math.round(maxRepairRoundsRaw)))
    : defaultAiSettings.maxRepairRounds;

  return {
    provider,
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model: typeof record.model === 'string' ? record.model : '',
    maxRepairRounds,
    traceVerbosity,
  };
}

async function loadAiSettings(): Promise<PersistedAiSettings> {
  const settingsPath = getAiSettingsFilePath();

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    return normalizeAiSettings(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return { ...defaultAiSettings };
    }

    logError('[Electron] Failed to load AI settings:', error);
    return { ...defaultAiSettings };
  }
}

async function saveAiSettings(settings: unknown): Promise<PersistedAiSettings> {
  const normalized = normalizeAiSettings(settings);
  const settingsPath = getAiSettingsFilePath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
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

function resolveWorkspaceRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..', '..', '..');
}

async function findAvailablePort(preferredPort?: number): Promise<number> {
  const tryListen = (port: number) => new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(resolvedPort);
      });
    });
  });

  if (preferredPort && preferredPort > 0) {
    try {
      return await tryListen(preferredPort);
    } catch {
      // Fall back to dynamic port allocation.
    }
  }

  return tryListen(0);
}

async function resolveAgentLaunch(port: number): Promise<PythonLaunchConfig> {
  const workspaceRoot = resolveWorkspaceRoot();
  const agentDir = app.isPackaged
    ? path.join(process.resourcesPath, 'agents', 'langgraph_sidecar')
    : path.join(workspaceRoot, 'agents', 'langgraph_sidecar');
  const agentSourceDir = path.join(agentDir, 'src');
  const localVenvPython = process.platform === 'win32'
    ? path.join(agentDir, '.venv', 'Scripts', 'python.exe')
    : path.join(agentDir, '.venv', 'bin', 'python');
  const packagedPython = process.platform === 'win32'
    ? path.join(process.resourcesPath, 'python', 'python.exe')
    : path.join(process.resourcesPath, 'python', 'bin', 'python3');

  const candidateCommands = [
    process.env.VIBE_BI_PYTHON || '',
    localVenvPython,
    app.isPackaged ? packagedPython : '',
    'python',
    process.platform === 'win32' ? 'py' : '',
  ].filter(Boolean);

  let selectedCommand = candidateCommands[0];
  for (const candidate of candidateCommands) {
    if (candidate === 'python' || candidate === 'py') {
      selectedCommand = candidate;
      break;
    }

    try {
      await fs.access(candidate);
      selectedCommand = candidate;
      break;
    } catch {
      // Try next candidate.
    }
  }

  const baseArgs = selectedCommand === 'py' ? ['-3'] : [];
  const args = [
    ...baseArgs,
    '-m',
    'vibe_bi_agent.main',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];

  return {
    command: selectedCommand,
    args,
    cwd: agentDir,
    env: {
      ...process.env,
      PYTHONPATH: [agentSourceDir, process.env.PYTHONPATH || ''].filter(Boolean).join(path.delimiter),
    },
  };
}

async function waitForHttpHealthy(url: string, timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timeout waiting for service health at ${url}`);
}

function setBrowserPreviewCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Cache-Control', 'no-store');
}

function handleBrowserPreviewRequest(request: IncomingMessage, response: ServerResponse) {
  setBrowserPreviewCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  const previewMatch = requestUrl.pathname.match(/^\/api\/browser-preview\/([^/]+)$/);
  if (request.method === 'GET' && previewMatch) {
    cleanupBrowserPreviewEntries();
    const entry = browserPreviewEntries.get(previewMatch[1]);
    if (!entry) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Preview not found or expired.' }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(entry.payload);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
}

async function ensureBrowserPreviewServer(): Promise<number> {
  if (browserPreviewServer && browserPreviewPort) {
    return browserPreviewPort;
  }

  const port = await findAvailablePort();
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      try {
        handleBrowserPreviewRequest(request, response);
      } catch (error) {
        logError('[Electron] Browser preview request failed:', error);
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        response.end(JSON.stringify({ error: 'Internal preview error' }));
      }
    });

    server.once('error', (error) => {
      reject(error);
    });

    server.listen(port, '127.0.0.1', () => {
      browserPreviewServer = server;
      browserPreviewPort = port;
      logInfo('[Electron] Browser preview server started on port:', port);
      resolve(port);
    });
  });
}

function stopBrowserPreviewServer() {
  if (!browserPreviewServer) {
    browserPreviewPort = 0;
    browserPreviewEntries.clear();
    return;
  }

  try {
    browserPreviewServer.close();
  } catch (error) {
    logError('[Electron] Failed to stop browser preview server:', error);
  }

  browserPreviewServer = null;
  browserPreviewPort = 0;
  browserPreviewEntries.clear();
}

function buildBrowserPreviewDocumentUrl(previewId: string, previewPortValue: number): string {
  const previewDataUrl = `http://127.0.0.1:${previewPortValue}/api/browser-preview/${previewId}`;

  if (process.env.VITE_DEV_SERVER_URL) {
    const devUrl = new URL(process.env.VITE_DEV_SERVER_URL);
    devUrl.searchParams.set('browser-preview', '1');
    devUrl.searchParams.set('preview-url', previewDataUrl);
    return devUrl.toString();
  }

  const rendererIndexPath = path.join(__dirname, '../renderer/index.html');
  const fileUrl = pathToFileURL(rendererIndexPath);
  fileUrl.searchParams.set('browser-preview', '1');
  fileUrl.searchParams.set('preview-url', previewDataUrl);
  return fileUrl.toString();
}

async function openBrowserPreview(payload: unknown): Promise<string> {
  const serializedPayload = JSON.stringify(payload ?? {});
  const previewPortValue = await ensureBrowserPreviewServer();
  const previewId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  cleanupBrowserPreviewEntries();
  browserPreviewEntries.set(previewId, {
    payload: serializedPayload,
    createdAt: Date.now(),
  });

  const previewUrl = buildBrowserPreviewDocumentUrl(previewId, previewPortValue);
  await shell.openExternal(previewUrl);
  return previewUrl;
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
      logInfo('[.NET]', output);

      // Parse port from output
      const match = output.match(/Now listening on: http:\/\/127\.0\.0\.1:(\d+)/);
      if (match && !apiPort) {
        apiPort = Number.parseInt(match[1], 10);
        logInfo('[Electron] .NET backend started on port:', apiPort);
        finishResolve(apiPort);
      }
    });

    dotnetProcess.stderr?.on('data', (data: Buffer) => {
      logError('[.NET Error]', data.toString());
    });

    dotnetProcess.on('error', (err) => {
      logError('[Electron] Failed to start .NET:', err);
      finishReject(err instanceof Error ? err : new Error(String(err)));
    });

    dotnetProcess.on('exit', (code) => {
      logInfo(`[Electron] .NET process exited with code ${code}`);
      dotnetProcess = null;
      if (!settled && !apiPort) {
        finishReject(new Error(`.NET backend exited before startup completed (code: ${code ?? 'unknown'})`));
      }
    });
  });
}

function stopDotNetBackend() {
  if (dotnetProcess) {
    logInfo('[Electron] Stopping .NET backend...');
    dotnetProcess.kill();
    dotnetProcess = null;
  }
}

export function getAgentBaseUrl(): string {
  return agentPort > 0 ? `http://127.0.0.1:${agentPort}` : '';
}

async function startAgentSidecar(): Promise<string> {
  const port = await findAvailablePort(8797);
  const launch = await resolveAgentLaunch(port);
  agentPort = 0;

  logInfo('[Electron] Starting AI sidecar:', launch.command, launch.args.join(' '));
  agentProcess = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: launch.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  agentProcess.stdout?.on('data', (data: Buffer) => {
    logInfo('[AI Agent]', data.toString());
  });

  agentProcess.stderr?.on('data', (data: Buffer) => {
    logError('[AI Agent Error]', data.toString());
  });

  agentProcess.on('exit', (code) => {
    logInfo(`[Electron] AI sidecar exited with code ${code}`);
    agentProcess = null;
    agentPort = 0;
  });

  agentProcess.on('error', (error) => {
    logError('[Electron] Failed to start AI sidecar:', error);
  });

  await waitForHttpHealthy(`http://127.0.0.1:${port}/health`, 25000);
  agentPort = port;
  logInfo('[Electron] AI sidecar started on port:', agentPort);
  return getAgentBaseUrl();
}

function stopAgentSidecar() {
  if (agentProcess) {
    logInfo('[Electron] Stopping AI sidecar...');
    agentProcess.kill();
    agentProcess = null;
    agentPort = 0;
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
    logError('[Electron] Failed to start backend:', err);
    dialog.showErrorBox('启动失败', '无法启动后端服务，请检查 .NET 10 是否已安装。');
    app.quit();
    return;
  }

  try {
    await startAgentSidecar();
  } catch (err) {
    logError('[Electron] Failed to start AI sidecar:', err);
    agentProcess = null;
    agentPort = 0;
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
  logInfo('[Electron] Preload path:', preloadPath);

  if (process.env.VITE_DEV_SERVER_URL) {
    logInfo('[Electron] Loading dev server URL:', process.env.VITE_DEV_SERVER_URL);
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    logInfo('[Electron] Loading file:', htmlPath);
    await mainWindow.loadFile(htmlPath);
  }

  logInfo('[Electron] Window loaded successfully');

  // Log any console messages from renderer
  mainWindow.webContents.on('console-message', (details) => {
    logInfo(`[Renderer ${details.level}]`, details.message);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopBrowserPreviewServer();
  stopAgentSidecar();
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
  stopBrowserPreviewServer();
  stopAgentSidecar();
  stopDotNetBackend();
});

// IPC handlers
ipcMain.handle('get-api-url', () => {
  return getApiBaseUrl();
});

ipcMain.handle('get-agent-url', () => {
  return getAgentBaseUrl();
});

ipcMain.handle('load-ai-settings', async () => {
  return loadAiSettings();
});

ipcMain.handle('save-ai-settings', async (_, settings: unknown) => {
  return saveAiSettings(settings);
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

ipcMain.handle('open-browser-preview', async (_, payload: unknown) => {
  return openBrowserPreview(payload);
});
