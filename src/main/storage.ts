import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { watch, FSWatcher } from 'node:fs';
import path from 'node:path';
import { AppSettings, TodoItem } from '../shared/types';
import { parseMarkdownTasks, stringifyMarkdownTasks } from './markdown';

const SETTINGS_FILE = 'settings.json';
const TODO_FILE_NAME = 'todo.md';

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
    launchAtStartup: false,
    windowOpacity: 0.96,
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
      return {
        ...defaultSettings(),
        ...JSON.parse(raw)
      };
    } catch {
      const next = defaultSettings();
      await this.saveSettings(next);
      return next;
    }
  }

  async saveSettings(settings: AppSettings) {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
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
