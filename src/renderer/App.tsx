import { CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import dayjs from 'dayjs';
import { AppSettings, AppState, TodoItem } from '../shared/types';
import { SortableTaskItem } from './components/SortableTaskItem';

const defaultSettings: AppSettings = {
  todoFilePath: '',
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

function formatShortcutForDisplay(shortcut: string) {
  if (!shortcut) {
    return '点击录制快捷键';
  }

  return shortcut
    .split('+')
    .map((part) => {
      const token = part.trim();
      if (token === 'CommandOrControl') {
        return 'Ctrl';
      }
      if (token === 'Command') {
        return 'Cmd';
      }
      return token;
    })
    .join(' + ');
}

function normalizeShortcutText(shortcutText: string) {
  return shortcutText.replace(/\s+/g, '').toLowerCase();
}

function buildShortcutFromKeyEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return null;
  }

  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    modifiers.push('Ctrl');
  }
  if (event.altKey) {
    modifiers.push('Alt');
  }
  if (event.shiftKey) {
    modifiers.push('Shift');
  }

  if (modifiers.length === 0) {
    return null;
  }

  let mainKey = '';
  if (/^F\d{1,2}$/i.test(event.key)) {
    mainKey = event.key.toUpperCase();
  } else if (event.key === ' ') {
    mainKey = 'Space';
  } else if (event.key.startsWith('Arrow')) {
    mainKey = event.key.replace('Arrow', '');
  } else if (event.key.length === 1) {
    mainKey = event.key.toUpperCase();
  } else {
    mainKey = event.key.charAt(0).toUpperCase() + event.key.slice(1);
  }

  return [...modifiers, mainKey].join('+');
}

function getTodoFolderPath(todoFilePath: string) {
  if (!todoFilePath) {
    return '';
  }
  return todoFilePath.replace(/[\\/][^\\/]+$/, '');
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);
  const [selectingFolder, setSelectingFolder] = useState(false);
  const [toastText, setToastText] = useState('');
  const [syncing, setSyncing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' as never };
  const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' as never };

  useEffect(() => {
    void window.todoApi.getState().then((appState) => {
      setState(appState);
      setSettingsDraft(appState.settings);
    });

    const offState = window.todoApi.onStateUpdated((next) => {
      setState(next);
      if (!settingsOpen) {
        setSettingsDraft(next.settings);
      }
    });

    const offToast = window.todoApi.onSavedToast((payload) => {
      setToastText(`${payload.text} · ${dayjs(payload.at).format('HH:mm:ss')}`);
      setTimeout(() => setToastText(''), 1300);
    });

    return () => {
      offState();
      offToast();
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!isCapturingShortcut) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setIsCapturingShortcut(false);
        return;
      }

      const nextShortcut = buildShortcutFromKeyEvent(event);
      if (!nextShortcut) {
        setToastText('请按组合键（至少包含 Ctrl/Alt/Shift）');
        setTimeout(() => setToastText(''), 1200);
        return;
      }

      setIsCapturingShortcut(false);
      void applyShortcutImmediately(nextShortcut);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isCapturingShortcut]);

  const openTasks = useMemo(() => state?.tasks.filter((task) => !task.completed) ?? [], [state]);
  const completedTasks = useMemo(() => state?.tasks.filter((task) => task.completed) ?? [], [state]);

  async function refreshState() {
    const next = await window.todoApi.getState();
    setState(next);
    setSettingsDraft(next.settings);
  }

  async function applyShortcutImmediately(nextShortcut: string) {
    const next = await window.todoApi.updateSettings({
      globalShortcut: nextShortcut
    });
    setState(next);
    setSettingsDraft((prev) => ({
      ...prev,
      globalShortcut: next.settings.globalShortcut
    }));

    const wanted = normalizeShortcutText(formatShortcutForDisplay(nextShortcut));
    const applied = normalizeShortcutText(formatShortcutForDisplay(next.settings.globalShortcut));

    if (wanted === applied) {
      setToastText(`快捷键已设置：${formatShortcutForDisplay(next.settings.globalShortcut)}`);
    } else {
      setToastText(`快捷键设置失败，已回退为：${formatShortcutForDisplay(next.settings.globalShortcut)}`);
    }
    setTimeout(() => setToastText(''), 1600);
  }

  async function addTask() {
    const text = newTaskText.trim();
    if (!text) {
      return;
    }

    const next = await window.todoApi.addTask(text);
    setState(next);
    setNewTaskText('');
  }

  async function toggleTask(taskId: string, completed: boolean) {
    const next = await window.todoApi.toggleTask(taskId, completed);
    setState(next);
  }

  async function deleteTask(taskId: string) {
    const next = await window.todoApi.deleteTask(taskId);
    setState(next);
  }

  async function updateTaskText(taskId: string, text: string) {
    const next = await window.todoApi.updateTaskText(taskId, text);
    setState(next);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = openTasks.findIndex((task) => task.id === active.id);
    const newIndex = openTasks.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const reordered = arrayMove(openTasks, oldIndex, newIndex);

    setState((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        tasks: [...reordered, ...completedTasks]
      };
    });

    const next = await window.todoApi.reorderOpenTasks(reordered.map((task) => task.id));
    setState(next);
  }

  async function saveSettings() {
    const next = await window.todoApi.updateSettings({
      todoFilePath: settingsDraft.todoFilePath,
      globalShortcut: settingsDraft.globalShortcut,
      launchAtStartup: settingsDraft.launchAtStartup,
      desktopLockPosition: settingsDraft.desktopLockPosition,
      desktopMouseThrough: settingsDraft.desktopMouseThrough,
      windowOpacity: settingsDraft.windowOpacity,
      webdav: settingsDraft.webdav
    });

    setState(next);
    setSettingsDraft(next.settings);
    setSettingsOpen(false);
    setToastText('设置已保存');
    setTimeout(() => setToastText(''), 1200);
  }

  async function selectTodoFolder() {
    setSelectingFolder(true);
    try {
      const pickedTodoPath = await window.todoApi.pickTodoFolder();
      if (pickedTodoPath) {
        setSettingsDraft((prev) => ({
          ...prev,
          todoFilePath: pickedTodoPath
        }));
      }
    } finally {
      setSelectingFolder(false);
    }
  }

  async function toggleAlwaysOnTop(value: boolean) {
    await window.todoApi.setAlwaysOnTop(value);
    await refreshState();
  }

  async function toggleDesktopPin() {
    await window.todoApi.togglePinMode();
    await refreshState();
  }

  async function runSync() {
    setSyncing(true);
    try {
      const result = await window.todoApi.runSync();
      setToastText(result.message);
      setTimeout(() => setToastText(''), 1500);
    } finally {
      setSyncing(false);
    }
  }

  function updateWebdav<K extends keyof AppSettings['webdav']>(key: K, value: AppSettings['webdav'][K]) {
    setSettingsDraft((prev) => ({
      ...prev,
      webdav: {
        ...prev.webdav,
        [key]: value
      }
    }));
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden border border-white/20 text-slate-100 shadow-[0_20px_48px_rgba(2,6,23,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(251,191,36,0.2),transparent_40%),radial-gradient(circle_at_88%_88%,rgba(56,189,248,0.2),transparent_40%),linear-gradient(160deg,#020617,#0f172a_40%,#111827_80%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />

      <div className="relative z-10 flex h-full flex-col p-3">
        <div className="mb-2 h-7 rounded-lg" style={dragStyle} />

        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5" style={noDragStyle}>
          <button className="icon-btn" style={noDragStyle} onClick={() => setSettingsOpen((v) => !v)} title="设置">
            ⚙
          </button>
          <button className="icon-btn" style={noDragStyle} onClick={() => void window.todoApi.minimizeWindow()} title="最小化">
            🗕
          </button>
          <button className="icon-btn-danger" style={noDragStyle} onClick={() => void window.todoApi.closeWindow()} title="退出">
            ✕
          </button>
        </div>

        <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-slate-300">
          <span>ApexTodo · {dayjs().format('MM-DD HH:mm')}</span>
          {state?.settings.desktopPinned && (
            <span className="rounded-full border border-emerald-300/25 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">
              桌面模式
            </span>
          )}
        </div>

        <section className="mb-3 grid grid-cols-[1fr_auto] gap-2">
          <input
            value={newTaskText}
            onChange={(event) => setNewTaskText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void addTask();
              }
            }}
            className="neo-input"
            placeholder="闪电录入：输入后回车，自动入栈顶"
          />
          <button className="action-btn bg-cyan-300 text-slate-900 hover:bg-cyan-200" onClick={() => void addTask()}>
            添加
          </button>
        </section>

        <section className="min-h-0 flex-1 rounded-2xl border border-white/15 bg-black/25 p-2.5">
          <div className="max-h-[58%] space-y-2 overflow-auto pr-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
              <SortableContext items={openTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                {openTasks.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onUpdateText={updateTaskText}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {openTasks.length === 0 && <div className="empty-box">暂无待办，先添加一条任务</div>}
          </div>

          <div className="mt-3 border-t border-white/15 pt-2">
            <button className="fold-btn" onClick={() => setCompletedOpen((v) => !v)}>
              <span>已完成（{completedTasks.length}）</span>
              <span className={`transition-transform duration-300 ${completedOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>

            <div className={`overflow-hidden transition-all duration-300 ${completedOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="mt-2 space-y-2 overflow-auto pr-1">
                {completedTasks.map((task: TodoItem) => (
                  <div key={task.id} className="done-card">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-all text-sm text-slate-300 line-through">{task.text}</p>
                      <p className="text-xs text-slate-400">{task.createdAt}</p>
                    </div>
                    <button
                      className="rounded-md border border-rose-300/30 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 transition-all duration-300 hover:bg-rose-500/30"
                      onClick={() => void deleteTask(task.id)}
                      title="删除待办"
                    >
                      🗑
                    </button>
                    <input type="checkbox" checked={task.completed} className="h-4 w-4" onChange={() => void toggleTask(task.id, false)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {settingsOpen && (
          <section className="settings-panel">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-cyan-100">设置面板</p>
              <button className="ui-btn" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="option-item">
                <input
                  type="checkbox"
                  checked={state?.settings.alwaysOnTop ?? true}
                  disabled={state?.settings.desktopPinned ?? false}
                  onChange={(event) => void toggleAlwaysOnTop(event.target.checked)}
                />
                始终置顶
              </label>
              <label className="option-item">
                <input type="checkbox" checked={state?.settings.desktopPinned ?? false} onChange={() => void toggleDesktopPin()} />
                嵌入桌面
              </label>
              <label className="option-item col-span-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.desktopLockPosition}
                  disabled={!(state?.settings.desktopPinned ?? false)}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, desktopLockPosition: event.target.checked }))}
                />
                桌面模式锁定位置
              </label>
              <label className="option-item col-span-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.desktopMouseThrough}
                  disabled={!(state?.settings.desktopPinned ?? false)}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, desktopMouseThrough: event.target.checked }))}
                />
                桌面模式鼠标穿透（Ctrl+Shift+Z 可切换）
              </label>
              <label className="option-item col-span-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.launchAtStartup}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, launchAtStartup: event.target.checked }))}
                />
                开机自启（静默）
              </label>
            </div>

            <div className="mt-2 space-y-2">
              <div className="option-item">
                <span>全局热键</span>
                <button className="ui-btn ml-2" onClick={() => setIsCapturingShortcut(true)}>
                  {isCapturingShortcut ? '请按组合键（Esc 取消）' : formatShortcutForDisplay(settingsDraft.globalShortcut)}
                </button>
              </div>

              <div className="option-item">
                <span>窗口透明度</span>
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={Math.round((settingsDraft.windowOpacity ?? 0.96) * 100)}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      windowOpacity: Number(event.target.value) / 100
                    }))
                  }
                  className="ml-2 flex-1 accent-cyan-300"
                />
                <span className="w-10 text-right text-[11px] text-slate-300">
                  {Math.round((settingsDraft.windowOpacity ?? 0.96) * 100)}%
                </span>
              </div>

              <div className="space-y-1">
                <div className="option-item">
                  <span>待办文件夹</span>
                  <button className="ui-btn ml-2" onClick={() => void selectTodoFolder()} disabled={selectingFolder}>
                    {selectingFolder ? '选择中...' : '选择文件夹'}
                  </button>
                </div>
                <p className="px-1 text-[11px] text-slate-400 break-all">
                  {getTodoFolderPath(settingsDraft.todoFilePath) || '未选择'}
                </p>
              </div>

              <label className="option-item">
                <input type="checkbox" checked={settingsDraft.webdav.enabled} onChange={(event) => updateWebdav('enabled', event.target.checked)} />
                启用 WebDAV
              </label>

              <input value={settingsDraft.webdav.url} onChange={(event) => updateWebdav('url', event.target.value)} className="neo-input" placeholder="WebDAV 地址" />

              <div className="grid grid-cols-2 gap-2">
                <input value={settingsDraft.webdav.username} onChange={(event) => updateWebdav('username', event.target.value)} className="neo-input" placeholder="用户名" />
                <input value={settingsDraft.webdav.password} onChange={(event) => updateWebdav('password', event.target.value)} className="neo-input" placeholder="密码" type="password" />
                <input value={settingsDraft.webdav.remotePath} onChange={(event) => updateWebdav('remotePath', event.target.value)} className="neo-input" placeholder="远端路径 /todo.md" />
              </div>

              <div className="option-item">
                <span>同步间隔（分钟）</span>
                <input
                  value={String(settingsDraft.webdav.intervalMinutes || 60)}
                  onChange={(event) => updateWebdav('intervalMinutes', Math.max(1, Number(event.target.value) || 60))}
                  className="neo-input ml-2 w-24"
                  type="number"
                  min={1}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="action-btn flex-1 bg-cyan-300 text-slate-900 hover:bg-cyan-200" onClick={() => void saveSettings()}>
                保存设置
              </button>
              <button className="action-btn flex-1 bg-amber-300 text-slate-900 hover:bg-amber-200 disabled:opacity-60" onClick={() => void runSync()} disabled={syncing}>
                {syncing ? '同步中...' : '立即同步'}
              </button>
            </div>

            <p className="mt-2 text-[11px] text-slate-400">
              最近同步：{state?.lastSyncTime ? dayjs(state.lastSyncTime).format('MM-DD HH:mm:ss') : '暂无'} | {state?.syncMessage ?? '未开始'}
            </p>
          </section>
        )}

        {toastText && <div className="toast-chip">{toastText}</div>}
      </div>
    </div>
  );
}
