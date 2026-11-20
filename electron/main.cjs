const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const SERVER_PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.focus();
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });
}

function getAppIconPath() {
  return path.join(__dirname, 'icon.png');
}

function getDistDir() {
  return path.join(__dirname, '..', 'dist');
}

async function startEmbeddedServer() {
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(SERVER_PORT);
  process.env.SHOP_MANUAL_START = '1';
  process.env.SHOP_DATA_DIR = path.join(app.getPath('userData'), 'shop-data');
  process.env.SHOP_DIST_DIR = getDistDir();

  const bundledServerPath = path.join(__dirname, '..', 'electron-dist', 'local-server.mjs');
  const mod = await import(pathToFileURL(bundledServerPath).href);
  if (typeof mod.startShopServer === 'function') {
    await mod.startShopServer();
  }
}

function waitForServerReady(timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`${BASE_URL}/api/track-url`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Embedded local server startup timeout'));
        return;
      }
      setTimeout(ping, 250);
    };

    ping();
  });
}

function triggerBackgroundSyncFromTray() {
  const req = http.request(
    `${BASE_URL}/api/scheduler/trigger-now`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    (res) => {
      res.resume();
    }
  );
  req.on('error', () => {});
  req.end();
}

function createTray() {
  const icon = nativeImage.createFromPath(getAppIconPath());
  tray = new Tray(icon.isEmpty() ? undefined : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('سامانه پایش قیمت فروشگاه (فعال در پس‌زمینه — پایش ۳ ساعته)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'نمایش پنجره برنامه',
      click: () => {
        focusMainWindow();
      },
    },
    {
      label: 'استعلام فوری همه کالاها (پایش ۳ ساعته)',
      click: () => {
        triggerBackgroundSyncFromTray();
      },
    },
    { type: 'separator' },
    {
      label: 'خروج کامل و توقف سرویس پس‌زمینه',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    focusMainWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#020617',
    title: 'سامانه استعلام و پایش قیمت فروشگاه کامپیوتر',
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.once('ready-to-show', () => {
    focusMainWindow();
  });

  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep local 3-hour background scheduler alive in System Tray when closing window
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(async () => {
  try {
    await startEmbeddedServer();
    await waitForServerReady();
  } catch (err) {
    console.error('[Electron] Local server startup warning:', err);
  }
  createTray();
  createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  focusMainWindow();
});
