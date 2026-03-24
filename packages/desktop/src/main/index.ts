import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

// ES Module __dirname polyfill (relative to dist/main/index.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dotnetProcess: ChildProcess | null = null;
let apiPort: number = 0;

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

async function startDotNetBackend(): Promise<number> {
  // In dev: dist/main/index.js -> ../../server/src/VibeBi.Api/...
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'VibeBi.Api.exe')
    : path.join(__dirname, '..', '..', '..', '..', 'server', 'src', 'VibeBi.Api', 'bin', 'Debug', 'net10.0', 'VibeBi.Api.exe');

  return new Promise((resolve, reject) => {
    dotnetProcess = spawn(exePath, ['--urls', 'http://127.0.0.1:0'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    dotnetProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[.NET]', output);

      // Parse port from output
      const match = output.match(/Now listening on: http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        apiPort = parseInt(match[1]);
        console.log('[Electron] .NET backend started on port:', apiPort);
        resolve(apiPort);
      }
    });

    dotnetProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[.NET Error]', data.toString());
    });

    dotnetProcess.on('error', (err) => {
      console.error('[Electron] Failed to start .NET:', err);
      reject(err);
    });

    dotnetProcess.on('exit', (code) => {
      console.log(`[Electron] .NET process exited with code ${code}`);
      dotnetProcess = null;
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!apiPort) {
        reject(new Error('Timeout waiting for .NET backend to start'));
      }
    }, 30000);
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

  // Check if preload loaded correctly
  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Electron] DOM ready, checking electronAPI...');
    setTimeout(() => {
      mainWindow?.webContents.executeJavaScript('typeof window.electronAPI').then((result) => {
        console.log('[Electron] window.electronAPI type:', result);
      }).catch((err) => {
        console.error('[Electron] Failed to check electronAPI:', err);
      });
    }, 1000);
  });

  console.log('[Electron] Window loaded successfully');

  // Log any console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelName = ['debug', 'info', 'warning', 'error'][level] || 'unknown';
    console.log(`[Renderer ${levelName}]`, message);
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

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Vibe BI Reports', extensions: ['vbi'] },
      { name: 'Power BI', extensions: ['pbix'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('save-file', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Vibe BI Report', extensions: ['vbi'] }],
  });
  return result.filePath || null;
});
