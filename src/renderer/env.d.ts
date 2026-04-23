/// <reference types="vite/client" />

import { AppSettings, AppState, CaptureResult, SaveToastPayload } from '../shared/types';

declare global {
  interface Window {
    todoApi: {
      getState: () => Promise<AppState>;
      addTask: (text: string) => Promise<AppState>;
      toggleTask: (taskId: string, completed: boolean) => Promise<AppState>;
      deleteTask: (taskId: string) => Promise<AppState>;
      updateTaskText: (taskId: string, text: string) => Promise<AppState>;
      reorderOpenTasks: (orderedOpenIds: string[]) => Promise<AppState>;
      captureTask: () => Promise<CaptureResult>;
      updateSettings: (partial: Partial<AppSettings>) => Promise<AppState>;
      pickTodoFolder: () => Promise<string | null>;
      togglePinMode: () => Promise<AppSettings>;
      setAlwaysOnTop: (value: boolean) => Promise<AppSettings>;
      runSync: () => Promise<{ ok: boolean; message: string }>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      onStateUpdated: (handler: (state: AppState) => void) => () => void;
      onSavedToast: (handler: (payload: SaveToastPayload) => void) => () => void;
      onOpenSettingsPanel: (handler: () => void) => () => void;
    };
  }
}

export {};
