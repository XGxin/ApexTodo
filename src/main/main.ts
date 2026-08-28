import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppSettings, AppState, CaptureResult, TodoItem, WebDavConfig, WindowBoundsState } from '../shared/types';
import { createTaskFromText } from './markdown';
import { getCodexUsage } from './codexUsage';
import { StorageService } from './storage';
import { WebDavSyncService } from './sync';

const execFileAsync = promisify(execFile);
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+A';
const DESKTOP_INTERACT_SHORTCUT = 'CommandOrControl+Shift+Z';

let mainWindow: BrowserWindow | null = null;
let settings: AppSettings;
let tasks: TodoItem[] = [];
let lastSyncTime: string | undefined;
let syncMessage: string | undefined;
let saveWindowBoundsTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;

const storage = new StorageService((nextTasks) => {
  tasks = normalizeTaskOrder(nextTasks);
  broadcastState();
});

const syncService = new WebDavSyncService(
  () => settings,
  (status) => {
    lastSyncTime = status.time;
    syncMessage = status.message;
    broadcastState();
  }
);

function mergeWebdav(prev: WebDavConfig, next?: Partial<WebDavConfig>): WebDavConfig {
  return {
    ...prev,
    ...(next || {})
  };
}

function normalizeWebdavConfig(webdav: WebDavConfig): WebDavConfig {
  return {
    ...webdav,
    remotePath: webdav.remotePath || '/todo.md',
    intervalMinutes: Math.max(1, Number(webdav.intervalMinutes) || 60)
  };
}

function normalizeAccelerator(input: string) {
  const raw = (input || '').trim();
  if (!raw) {
    return DEFAULT_SHORTCUT;
  }

  const tokens = raw
    .replace(/\s+/g, '')
    .split('+')
    .filter(Boolean)
    .map((token) => token.toLowerCase());

  const mapped = tokens.map((token) => {
    if (token === 'ctrl' || token === 'control' || token === 'commandorcontrol') {
      return 'CommandOrControl';
    }
    if (token === 'cmd' || token === 'command') {
      return 'Command';
    }
    if (token === 'alt' || token === 'option') {
      return 'Alt';
    }
    if (token === 'shift') {
      return 'Shift';
    }
    if (token === 'super' || token === 'win' || token === 'windows') {
      return 'Super';
    }
    if (/^f\d{1,2}$/i.test(token)) {
      return token.toUpperCase();
    }
    if (token.length === 1) {
      return token.toUpperCase();
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
  });

  return mapped.join('+');
}

function normalizeOpacity(input: number | undefined) {
  if (typeof input !== 'number' || Number.isNaN(input)) {
    return 0.96;
  }
  return Math.min(1, Math.max(0.35, input));
}

function normalizeTaskOrder(allTasks: TodoItem[]) {
  const openTasks = allTasks.filter((task) => !task.completed);
  const completedTasks = allTasks.filter((task) => task.completed);
  return [...openTasks, ...completedTasks];
}

function currentState(): AppState {
  return {
    tasks,
    settings,
    lastSyncTime,
    syncMessage
  };
}

function broadcastState() {
  updateTrayMenu();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('state:updated', currentState());
}

async function persistTasksAndBroadcast(showToastText?: string, withSystemNotification = false) {
  tasks = normalizeTaskOrder(tasks);
  await storage.writeTasks(settings.todoFilePath, tasks);
  broadcastState();

  if (showToastText) {
    const at = new Date().toISOString();
    mainWindow?.webContents.send('task:saved-toast', { text: showToastText, at });
    if (withSystemNotification) {
      pushNotification(showToastText);
    }
  }
}

function pushNotification(text: string) {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title: 'ApexTodo',
    body: text,
    silent: true
  }).show();
}

function applyLoginItemSetting() {
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup,
    args: ['--hidden']
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

async function setDesktopMouseThrough(nextValue: boolean, openSettingsAfterShow = false) {
  settings.desktopMouseThrough = nextValue;
  await storage.saveSettings(settings);
  applyWindowMode();

  if (!nextValue) {
    showMainWindow();
    if (openSettingsAfterShow) {
      mainWindow?.webContents.send('window:open-settings-panel');
    }
  }

  const text = nextValue
    ? 'Desktop mode: mouse passthrough ON (tray or Ctrl+Shift+Z to disable)'
    : 'Desktop mode: mouse passthrough OFF';
  const at = new Date().toISOString();
  mainWindow?.webContents.send('task:saved-toast', { text, at });
  broadcastState();
}

function applyWindowMode() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setOpacity(normalizeOpacity(settings.windowOpacity));
  mainWindow.setIgnoreMouseEvents(false);

  if (settings.desktopPinned) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    mainWindow.setSkipTaskbar(true);
    mainWindow.setMinimizable(false);
    mainWindow.setMaximizable(false);
    mainWindow.setResizable(false);
    mainWindow.setMovable(!settings.desktopLockPosition);
    mainWindow.setIgnoreMouseEvents(settings.desktopMouseThrough, { forward: true });
    return;
  }

  mainWindow.setVisibleOnAllWorkspaces(false);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
}

function registerGlobalHotkey() {
  globalShortcut.unregisterAll();
  const captureRegistered = globalShortcut.register(settings.globalShortcut, async () => {
    await captureSelectedTextToTask();
  });

  const desktopInteractRegistered = globalShortcut.register(DESKTOP_INTERACT_SHORTCUT, async () => {
    if (!settings.desktopPinned) {
      return;
    }
    await setDesktopMouseThrough(!settings.desktopMouseThrough);
  });

  if (!captureRegistered) {
    syncMessage = `Global shortcut registration failed: ${settings.globalShortcut}`;
    broadcastState();
    return false;
  }

  if (!desktopInteractRegistered) {
    syncMessage = `Passthrough toggle shortcut failed: ${DESKTOP_INTERACT_SHORTCUT}`;
    broadcastState();
    return false;
  }

  syncMessage = `Hotkeys active: ${settings.globalShortcut} (passthrough: Ctrl+Shift+Z)`;
  broadcastState();
  return true;
}

function createTrayIcon() {
  // 与 scripts/generate-icons.mjs 同源：字母 A / 尖峰(Apex)，2x 超采样抗锯齿。
  const S = 128;
  const buffer = Buffer.alloc(S * S * 4, 0);

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) {
      return;
    }
    const offset = (y * S + x) * 4;
    buffer[offset] = b; // B
    buffer[offset + 1] = g; // G
    buffer[offset + 2] = r; // R
    buffer[offset + 3] = Math.round(Math.max(0, Math.min(255, a)));
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const smooth = (e0: number, e1: number, x: number) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const inTri = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
    const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
    const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
    return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0);
  };

  const OUTER = [{ x: 64, y: 16 }, { x: 27, y: 108 }, { x: 101, y: 108 }];
  const INNER = [{ x: 64, y: 50 }, { x: 50.5, y: 108 }, { x: 77.5, y: 108 }];
  const BAR = { cx: 64, cy: 75, halfW: 14.5, halfH: 4.3, radius: 2 };

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let aa = 0;
      for (const sy of [0.25, 0.75]) {
        for (const sx of [0.25, 0.75]) {
          const px = x + sx;
          const py = y + sy;

          const qx = Math.abs(px - 64) - (56 - 30);
          const qy = Math.abs(py - 66) - (56 - 30);
          const boxDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 30;
          const boxCov = 1 - smooth(-0.9, 0.9, boxDist);
          if (boxCov <= 0.002) {
            continue;
          }

          const isA = inTri(px, py, OUTER[0], OUTER[1], OUTER[2]) &&
            !inTri(px, py, INNER[0], INNER[1], INNER[2]);
          const bx = Math.abs(px - BAR.cx) - (BAR.halfW - BAR.radius);
          const by = Math.abs(py - BAR.cy) - (BAR.halfH - BAR.radius);
          const barDist = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0) - BAR.radius;
          const white = isA || barDist < 0 ? 1 : 0;

          const t = clamp(py / S, 0, 1);
          let r = 12 + (6 - 12) * t;
          let g = 208 + (170 - 208) * t;
          let b = 108 + (82 - 108) * t;
          r += (255 - r) * white;
          g += (255 - g) * white;
          b += (255 - b) * white;

          rr += r * boxCov;
          gg += g * boxCov;
          bb += b * boxCov;
          aa += boxCov;
        }
      }
      setPixel(x, y, rr / 4, gg / 4, bb / 4, clamp(aa / 4, 0, 1) * 255);
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: S, height: S }).resize({ width: 16, height: 16, quality: 'good' });
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const trayMenu = Menu.buildFromTemplate([
    {
      label: '\u663E\u793A\u7A97\u53E3',
      click: () => {
        void setDesktopMouseThrough(false);
      }
    },
    {
      label: '\u6253\u5F00\u8BBE\u7F6E',
      click: () => {
        void setDesktopMouseThrough(false, true);
      }
    },
    {
      label: settings.desktopMouseThrough
        ? '\u5173\u95ED\u9F20\u6807\u7A7F\u900F'
        : '\u5F00\u542F\u9F20\u6807\u7A7F\u900F',
      enabled: settings.desktopPinned,
      click: () => {
        if (!settings.desktopPinned) {
          return;
        }
        void setDesktopMouseThrough(!settings.desktopMouseThrough);
      }
    },
    {
      type: 'separator'
    },
    {
      label: '\u9000\u51FA',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ApexTodo');
  tray.setContextMenu(trayMenu);
}

function ensureTray() {

  if (tray) {
    updateTrayMenu();
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.on('click', () => {
    void setDesktopMouseThrough(false);
  });
  updateTrayMenu();
}

async function simulateCopyOnWindows() {
  if (process.platform !== 'win32') {
    return;
  }

  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    "$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys('^c')"
  ]);
}

async function captureSelectedTextToTask(): Promise<CaptureResult> {
  try {
    await simulateCopyOnWindows();
    await new Promise((resolve) => setTimeout(resolve, 180));
    const text = clipboard.readText().trim();

    if (!text) {
      return {
        ok: false,
        message: 'No selected text found'
      };
    }

    const task = createTaskFromText(text);
    tasks = [task, ...tasks];
    await persistTasksAndBroadcast('Saved to top of todo list', true);

    return {
      ok: true,
      message: 'Saved'
    };
  } catch (error) {
    return {
      ok: false,
      message: `Capture failed: ${(error as Error).message}`
    };
  }
}

function shouldStartHidden() {
  const hasHiddenArg = process.argv.includes('--hidden');
  if (!hasHiddenArg) {
    return false;
  }

  const loginInfo = app.getLoginItemSettings();
  return Boolean(loginInfo.wasOpenedAtLogin || loginInfo.wasOpenedAsHidden);
}

function getSafeWindowBounds() {
  const targetWidth = 440;
  const targetHeight = 760;
  const workArea = screen.getPrimaryDisplay().workArea;

  const width = Math.min(targetWidth, Math.max(360, workArea.width));
  const height = Math.min(targetHeight, Math.max(560, workArea.height));
  const x = workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2));
  const y = workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2));

  return { x, y, width, height };
}

function normalizeWindowBounds(bounds?: WindowBoundsState) {
  if (!bounds) {
    return null;
  }

  const fallback = getSafeWindowBounds();
  const rawWidth = Number(bounds.width);
  const rawHeight = Number(bounds.height);
  const rawX = Number(bounds.x);
  const rawY = Number(bounds.y);

  if (![rawWidth, rawHeight, rawX, rawY].every(Number.isFinite)) {
    return null;
  }

  const probe = {
    x: Math.round(rawX),
    y: Math.round(rawY),
    width: Math.max(360, Math.round(rawWidth)),
    height: Math.max(560, Math.round(rawHeight))
  };

  const display = screen.getDisplayMatching(probe);
  const workArea = display.workArea;
  const width = Math.min(probe.width, workArea.width);
  const height = Math.min(probe.height, workArea.height);
  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);

  return {
    x: Math.min(Math.max(probe.x, workArea.x), maxX),
    y: Math.min(Math.max(probe.y, workArea.y), maxY),
    width: width || fallback.width,
    height: height || fallback.height
  };
}

function getLaunchWindowBounds() {
  return normalizeWindowBounds(settings.windowBounds) ?? getSafeWindowBounds();
}

function persistWindowBoundsNow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isMaximized()) {
    return;
  }

  const nextBounds = normalizeWindowBounds(mainWindow.getBounds());
  if (!nextBounds) {
    return;
  }

  settings.windowBounds = nextBounds;
  void storage.saveSettings(settings);
}

function scheduleSaveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isMaximized()) {
    return;
  }

  if (saveWindowBoundsTimer) {
    clearTimeout(saveWindowBoundsTimer);
  }

  saveWindowBoundsTimer = setTimeout(() => {
    persistWindowBoundsNow();
    saveWindowBoundsTimer = null;
  }, 180);
}

function createWindow(startHidden: boolean) {
  const bounds = getLaunchWindowBounds();
  const enableTransparentWindow = true;

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 360,
    minHeight: 560,
    frame: false,
    transparent: enableTransparentWindow,
    backgroundColor: enableTransparentWindow ? '#00000000' : '#0f172a',
    autoHideMenuBar: true,
    hasShadow: !enableTransparentWindow,
    skipTaskbar: true,
    show: !startHidden,
    title: 'ApexTodo',
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setBounds(bounds, false);

  mainWindow.on('minimize', () => {
    if (settings.desktopPinned) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.restore();
        }
      }, 60);
    }
  });

  mainWindow.on('move', () => {
    scheduleSaveWindowBounds();
  });

  mainWindow.on('resize', () => {
    scheduleSaveWindowBounds();
  });

  mainWindow.on('close', () => {
    persistWindowBoundsNow();
  });

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      showMainWindow();
    }
  });

  mainWindow.webContents.on('did-fail-load', () => {
    if (!startHidden) {
      showMainWindow();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!startHidden) {
      showMainWindow();
    }
  });

  if (!startHidden) {
    setTimeout(() => {
      showMainWindow();
    }, 1200);
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  applyWindowMode();
}

function setupIpcHandlers() {
  ipcMain.handle('app:get-state', async () => currentState());
  ipcMain.handle('codex:get-usage', async () => getCodexUsage());

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:close', () => {
    app.quit();
  });

  ipcMain.handle('window:toggle-pin-mode', async () => {
    settings.desktopPinned = !settings.desktopPinned;
    if (settings.desktopPinned) {
      settings.alwaysOnTop = false;
    } else {
      settings.desktopMouseThrough = false;
    }
    await storage.saveSettings(settings);
    applyWindowMode();
    showMainWindow();
    broadcastState();
    return settings;
  });

  ipcMain.handle('window:set-always-on-top', async (_event, value: boolean) => {
    settings.alwaysOnTop = value;
    if (value) {
      settings.desktopPinned = false;
      settings.desktopMouseThrough = false;
    }
    await storage.saveSettings(settings);
    applyWindowMode();
    broadcastState();
    return settings;
  });

  ipcMain.handle('task:add', async (_event, text: string) => {
    if (!text || !text.trim()) {
      return currentState();
    }

    const task = createTaskFromText(text);
    tasks = [task, ...tasks];
    await persistTasksAndBroadcast('New task added', true);
    return currentState();
  });

  ipcMain.handle('task:toggle', async (_event, taskId: string, completed: boolean) => {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) {
      return currentState();
    }

    target.completed = completed;
    const openTasks = tasks.filter((task) => !task.completed && task.id !== taskId);
    const completedTasks = tasks.filter((task) => task.completed && task.id !== taskId);

    tasks = [...openTasks, target, ...completedTasks];

    await persistTasksAndBroadcast();
    return currentState();
  });

  ipcMain.handle('task:reorder-open', async (_event, orderedOpenIds: string[]) => {
    const openMap = new Map(tasks.filter((task) => !task.completed).map((task) => [task.id, task]));
    const reorderedOpen: TodoItem[] = [];

    for (const id of orderedOpenIds) {
      const item = openMap.get(id);
      if (item) {
        reorderedOpen.push(item);
        openMap.delete(id);
      }
    }

    const restOpen = [...openMap.values()];
    const done = tasks.filter((task) => task.completed);
    tasks = [...reorderedOpen, ...restOpen, ...done];

    await persistTasksAndBroadcast();
    return currentState();
  });

  ipcMain.handle('task:delete', async (_event, taskId: string) => {
    const nextTasks = tasks.filter((task) => task.id !== taskId);
    if (nextTasks.length === tasks.length) {
      return currentState();
    }

    tasks = nextTasks;
    await persistTasksAndBroadcast();
    return currentState();
  });

  ipcMain.handle('task:update-text', async (_event, taskId: string, text: string) => {
    const target = tasks.find((task) => task.id === taskId);
    // 与新建一致，把换行/连续空白压成空格，避免多行文本破坏单行 Markdown 后重载被截断
    const nextText = (text || '').replace(/\s+/g, ' ').trim();

    if (!target || !nextText) {
      return currentState();
    }

    target.text = nextText;
    await persistTasksAndBroadcast();
    return currentState();
  });

  ipcMain.handle('task:capture', async () => captureSelectedTextToTask());

  ipcMain.handle('settings:pick-todo-folder', async () => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '\u9009\u62E9\u5F85\u529E\u6587\u4EF6\u5939',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return path.join(result.filePaths[0], 'todo.md');
  });

  ipcMain.handle('settings:update', async (_event, partial: Partial<AppSettings>) => {
    const prevShortcut = settings.globalShortcut;
    const prevTodoPath = settings.todoFilePath;

    const normalizedShortcut =
      typeof partial.globalShortcut === 'string' ? normalizeAccelerator(partial.globalShortcut) : settings.globalShortcut;

    const normalizedOpacity =
      typeof partial.windowOpacity === 'number' ? normalizeOpacity(partial.windowOpacity) : settings.windowOpacity;

    const normalizedWebdav = normalizeWebdavConfig(mergeWebdav(settings.webdav, partial.webdav));
    const normalizedShowCodexUsage =
      typeof partial.showCodexUsage === 'boolean' ? partial.showCodexUsage : settings.showCodexUsage;

    settings = {
      ...settings,
      ...partial,
      globalShortcut: normalizedShortcut,
      windowOpacity: normalizedOpacity,
      showCodexUsage: normalizedShowCodexUsage,
      webdav: normalizedWebdav
    };

    if (settings.desktopPinned) {
      settings.alwaysOnTop = false;
    } else {
      settings.desktopMouseThrough = false;
    }

    const hotkeyOk = registerGlobalHotkey();
    if (!hotkeyOk && settings.globalShortcut !== prevShortcut) {
      settings.globalShortcut = prevShortcut;
      registerGlobalHotkey();
    }

    await storage.saveSettings(settings);

    if (partial.todoFilePath && partial.todoFilePath !== prevTodoPath) {
      await storage.ensureTodoFile(settings.todoFilePath);
      tasks = normalizeTaskOrder(await storage.readTasks(settings.todoFilePath));
      storage.watchTodoFile(settings.todoFilePath);
    }

    applyLoginItemSetting();
    applyWindowMode();
    syncService.restartTimer();
    broadcastState();

    return currentState();
  });

  ipcMain.handle('sync:run', async () => {
    try {
      await syncService.sync(settings.todoFilePath);
      tasks = normalizeTaskOrder(await storage.readTasks(settings.todoFilePath));
      broadcastState();
      return {
        ok: true,
        message: '同步完成'
      };
    } catch (error) {
      const message = `同步失败：${(error as Error).message}`;
      syncMessage = message;
      broadcastState();
      return {
        ok: false,
        message
      };
    }
  });
}

async function bootstrap() {
  settings = await storage.initFiles();
  settings.globalShortcut = normalizeAccelerator(settings.globalShortcut);
  settings.windowOpacity = normalizeOpacity(settings.windowOpacity);
  settings.webdav = normalizeWebdavConfig(settings.webdav);
  settings.desktopLockPosition = typeof settings.desktopLockPosition === 'boolean' ? settings.desktopLockPosition : true;
  settings.desktopMouseThrough = typeof settings.desktopMouseThrough === 'boolean' ? settings.desktopMouseThrough : false;
  settings.showCodexUsage = typeof settings.showCodexUsage === 'boolean' ? settings.showCodexUsage : false;
  settings.windowBounds = normalizeWindowBounds(settings.windowBounds) ?? undefined;
  if (settings.desktopPinned) {
    settings.alwaysOnTop = false;
  } else {
    settings.desktopMouseThrough = false;
  }
  await storage.saveSettings(settings);
  tasks = normalizeTaskOrder(await storage.readTasks(settings.todoFilePath));
  storage.watchTodoFile(settings.todoFilePath);

  setupIpcHandlers();

  const startHidden = shouldStartHidden();
  createWindow(startHidden);
  ensureTray();
  applyLoginItemSetting();
  registerGlobalHotkey();
  syncService.start();

  if (settings.webdav.enabled) {
    void syncService.sync(settings.todoFilePath).catch((error) => {
      syncMessage = `Startup sync failed: ${(error as Error).message}`;
      broadcastState();
    });
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    void bootstrap();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(false);
      } else {
        showMainWindow();
      }
    });
  });
}

app.on('will-quit', () => {
  if (saveWindowBoundsTimer) {
    clearTimeout(saveWindowBoundsTimer);
    saveWindowBoundsTimer = null;
  }
  persistWindowBoundsNow();
  globalShortcut.unregisterAll();
  storage.unwatchTodoFile();
  syncService.stop();
  tray?.destroy();
  tray = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
