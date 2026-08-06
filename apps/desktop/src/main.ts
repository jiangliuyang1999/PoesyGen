import { stat } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron';

const scheme = 'poesygen';
const developmentUrl = process.env['DESKTOP_WEB_URL'] ?? 'http://localhost:5173';
const builtPreview = process.argv.includes('--built');

protocol.registerSchemesAsPrivileged([
  {
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

void app.whenReady().then(() => {
  if (app.isPackaged || builtPreview) {
    const webRoot = app.isPackaged
      ? join(process.resourcesPath, 'web')
      : resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    protocol.handle(scheme, (request) => handleApplicationRequest(request, webRoot));
  }

  createApplicationMenu();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1_440,
    height: 920,
    minWidth: 1_000,
    minHeight: 680,
    backgroundColor: '#eeeae1',
    title: 'PoesyGen',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin =
      app.isPackaged || builtPreview ? `${scheme}://app` : new URL(developmentUrl).origin;
    if (new URL(url).origin === allowedOrigin) return;
    event.preventDefault();
    if (isExternalUrl(url)) void shell.openExternal(url);
  });

  if (app.isPackaged || builtPreview) {
    void window.loadURL(`${scheme}://app/index.html?platform=desktop`);
  } else {
    loadDevelopmentUrl(window);
  }
  return window;
}

function loadDevelopmentUrl(window: BrowserWindow, retries = 40): void {
  const url = new URL(developmentUrl);
  url.searchParams.set('platform', 'desktop');
  void window.loadURL(url.toString()).catch(() => {
    if (window.isDestroyed() || retries <= 0) return;
    setTimeout(() => loadDevelopmentUrl(window, retries - 1), 500);
  });
}

async function handleApplicationRequest(request: Request, webRoot: string): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== 'app') return new Response('Not found', { status: 404 });

  const requestedPath = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname);
  const filePath = safeWebPath(webRoot, requestedPath);
  const existingPath = filePath === undefined ? undefined : await existingFile(filePath);
  const responsePath = existingPath ?? join(webRoot, 'index.html');
  return net.fetch(pathToFileURL(responsePath).toString());
}

function safeWebPath(webRoot: string, pathname: string): string | undefined {
  const candidate = normalize(join(webRoot, pathname.replace(/^\/+/u, '')));
  const relativePath = relative(webRoot, candidate);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !relativePath.includes(`..${sep}`))
    ? candidate
    : undefined;
}

async function existingFile(filePath: string): Promise<string | undefined> {
  try {
    return (await stat(filePath)).isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

function createApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
    ]),
  );
}
