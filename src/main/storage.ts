import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { watch, FSWatcher } from 'node:fs';
import path from 'node:path';
import { AppSettings, TodoItem } from '../shared/types';
import { parseMarkdownTasks, stringifyMarkdownTasks } from './markdown';

const SETTINGS_FILE = 'settings.json';
const TODO_FILE_NAME = 'todo.md';
const ENCRYPTED_PASSWORD_PREFIX = 'safeStorage:';

function getDefaultTodoPath() {
  const baseDir = path.join(app.getPath('documents'), 'ApexTodo');
  return path.join(baseDir, TODO_FILE_NAME);
}

function defaultSettings(): AppSettings {
  return {
    todoFilePath: getDefaultTodoPath(),
    globalShortcut: 'CommandOrControl+Shift+A',
    alwaysOnTop: true,
    desktopPinned: false,
    desktopLockPosition: true,
    desktopMouseThrough: false,
    showCodexUsage: false,
    windowOpacity: 0.96,
    theme: 'light',
    windowBounds: undefined,
    webdav: {
      enabled: false,
      url: '',
      username: '',
      password: '',
      remotePath: '/todo.md',
      intervalMinutes: 60
    }
  };
}

function decryptWebDavPassword(password: string) {
  if (!password.startsWith(ENCRYPTED_PASSWORD_PREFIX)) {
    return password;
  }

  try {
    const encoded = password.slice(ENCRYPTED_PASSWORD_PREFIX.length);
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return '';
  }
}

function settingsForDisk(settings: AppSettings): AppSettings {
  const password = settings.webdav.password;
  if (!password || !safeStorage.isEncryptionAvailable()) {
    return settings;
  }

  const encrypted = safeStorage.encryptString(password).toString('base64');
  return {
    ...settings,
    webdav: {
      ...settings.webdav,
      password: `${ENCRYPTED_PASSWORD_PREFIX}${encrypted}`
    }
  };
}

export class StorageService {
  private settingsPath: string;
  private watcher: FSWatcher | null = null;
  private writeInProgress = false;

  constructor(private onExternalTasksChange: (tasks: TodoItem[]) => void) {
    this.settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
  }

  async initFiles() {
    const settings = await this.loadSettings();
    await this.ensureTodoFile(settings.todoFilePath);
    return settings;
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppSettings> & { launchAtStartup?: unknown };
      const { launchAtStartup: _legacyLaunchAtStartup, ...currentSettings } = parsed;
      const webdav = {
        ...defaultSettings().webdav,
        ...currentSettings.webdav
      };
      return {
        ...defaultSettings(),
        ...currentSettings,
        webdav: {
          ...webdav,
          password: decryptWebDavPassword(webdav.password)
        }
      };
    } catch {
      const next = defaultSettings();
      await this.saveSettings(next);
      return next;
    }
  }

  async saveSettings(settings: AppSettings) {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(settingsForDisk(settings), null, 2), 'utf-8');
  }

  async ensureTodoFile(todoPath: string) {
    await mkdir(path.dirname(todoPath), { recursive: true });
    try {
      await readFile(todoPath, 'utf-8');
    } catch {
      await writeFile(todoPath, '', 'utf-8');
    }
  }

  async readTasks(todoPath: string): Promise<TodoItem[]> {
    await this.ensureTodoFile(todoPath);
    const content = await readFile(todoPath, 'utf-8');
    return parseMarkdownTasks(content);
  }

  async writeTasks(todoPath: string, tasks: TodoItem[]) {
    this.writeInProgress = true;
    try {
      const markdown = stringifyMarkdownTasks(tasks);
      await writeFile(todoPath, `${markdown}${markdown ? '\n' : ''}`, 'utf-8');
    } finally {
      setTimeout(() => {
        this.writeInProgress = false;
      }, 120);
    }
  }

  watchTodoFile(todoPath: string) {
    this.unwatchTodoFile();

    let debounceTimer: NodeJS.Timeout | null = null;

    this.watcher = watch(todoPath, () => {
      if (this.writeInProgress) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        try {
          const tasks = await this.readTasks(todoPath);
          this.onExternalTasksChange(tasks);
        } catch (error) {
          console.error('外部变更读取失败:', error);
        }
      }, 150);
    });
  }

  unwatchTodoFile() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
