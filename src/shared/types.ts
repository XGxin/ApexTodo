export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface WebDavConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  remotePath: string;
  intervalMinutes: number;
}

export interface WindowBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  todoFilePath: string;
  globalShortcut: string;
  alwaysOnTop: boolean;
  desktopPinned: boolean;
  desktopLockPosition: boolean;
  desktopMouseThrough: boolean;
  launchAtStartup: boolean;
  windowOpacity: number;
  windowBounds?: WindowBoundsState;
  webdav: WebDavConfig;
}

export interface AppState {
  tasks: TodoItem[];
  settings: AppSettings;
  lastSyncTime?: string;
  syncMessage?: string;
}

export interface SaveToastPayload {
  text: string;
  at: string;
}

export type ReorderPayload = {
  activeId: string;
  overId: string;
};

export interface CaptureResult {
  ok: boolean;
  message: string;
}
