import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, AppState, CaptureResult, SaveToastPayload } from '../shared/types';

const api = {
  getState: () => ipcRenderer.invoke('app:get-state') as Promise<AppState>,
  addTask: (text: string) => ipcRenderer.invoke('task:add', text) as Promise<AppState>,
  toggleTask: (taskId: string, completed: boolean) => ipcRenderer.invoke('task:toggle', taskId, completed) as Promise<AppState>,
  deleteTask: (taskId: string) => ipcRenderer.invoke('task:delete', taskId) as Promise<AppState>,
  updateTaskText: (taskId: string, text: string) =>
    ipcRenderer.invoke('task:update-text', taskId, text) as Promise<AppState>,
  reorderOpenTasks: (orderedOpenIds: string[]) =>
    ipcRenderer.invoke('task:reorder-open', orderedOpenIds) as Promise<AppState>,
  captureTask: () => ipcRenderer.invoke('task:capture') as Promise<CaptureResult>,
  updateSettings: (partial: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', partial) as Promise<AppState>,
  pickTodoFolder: () => ipcRenderer.invoke('settings:pick-todo-folder') as Promise<string | null>,
  togglePinMode: () => ipcRenderer.invoke('window:toggle-pin-mode') as Promise<AppSettings>,
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:set-always-on-top', value) as Promise<AppSettings>,
  runSync: () => ipcRenderer.invoke('sync:run') as Promise<{ ok: boolean; message: string }>,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onStateUpdated: (handler: (state: AppState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AppState) => handler(state);
    ipcRenderer.on('state:updated', wrapped);
    return () => ipcRenderer.removeListener('state:updated', wrapped);
  },
  onSavedToast: (handler: (payload: SaveToastPayload) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: SaveToastPayload) => handler(payload);
    ipcRenderer.on('task:saved-toast', wrapped);
    return () => ipcRenderer.removeListener('task:saved-toast', wrapped);
  }
};

contextBridge.exposeInMainWorld('todoApi', api);
