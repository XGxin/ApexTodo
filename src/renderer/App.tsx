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
import { AppSettings, AppState, CodexUsage, CodexUsageWindow, ThemeMode, TodoItem } from '../shared/types';
import { SortableTaskItem } from './components/SortableTaskItem';
import {
  ApexLogo,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CloudIcon,
  FolderIcon,
  KeyboardIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon
} from './components/icons';

const defaultSettings: AppSettings = {
  todoFilePath: '',
  globalShortcut: 'CommandOrControl+Shift+A',
  alwaysOnTop: true,
  desktopPinned: false,
  desktopLockPosition: true,
  desktopMouseThrough: false,
  showCodexUsage: false,
  launchAtStartup: false,
  windowOpacity: 0.96,
  theme: 'light',
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

function formatUsageReset(resetAt: string) {
  return `${dayjs(resetAt).format('MM-DD HH:mm')} 重置`;
}

function TopUsageMetric({ label, usage }: { label: string; usage: CodexUsageWindow }) {
  const tone =
    usage.usedPercent >= 90 ? 'var(--danger)' : usage.usedPercent >= 70 ? '#f0a020' : 'var(--accent)';

  const resetText = dayjs(usage.resetAt).format(usage.windowSeconds >= 24 * 60 * 60 ? 'MM-DD' : 'HH:mm');

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5"
      role="progressbar"
      aria-label={`${label}已用`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usage.usedPercent}
      title={`${label}已用 ${usage.usedPercent}% · ${formatUsageReset(usage.resetAt)}`}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: tone }} />
      <span className="flex-shrink-0 text-[11px] font-medium text-[var(--text-2)]">{label}</span>
      <span className="h-1 w-9 flex-shrink-0 overflow-hidden rounded-full bg-[var(--line-strong)]">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${usage.usedPercent}%`, background: tone }}
        />
      </span>
      <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text)]">
        {usage.usedPercent}%
      </span>
      <span className="flex-shrink-0 text-[10px] font-medium tabular-nums text-[var(--text-2)]">{resetText}</span>
    </div>
  );
}

function useSystemDark() {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  );

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setDark(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return dark;
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
  const [codexUsage, setCodexUsage] = useState<CodexUsage | null>(null);
  const [usageRefreshing, setUsageRefreshing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

  const systemDark = useSystemDark();
  const themeMode: ThemeMode = state?.settings.theme ?? 'light';
  const effectiveTheme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

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

    const offOpenSettings = window.todoApi.onOpenSettingsPanel(() => {
      setSettingsOpen(true);
    });

    return () => {
      offState();
      offToast();
      offOpenSettings();
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!state?.settings.showCodexUsage) {
      setCodexUsage(null);
      setUsageRefreshing(false);
      return;
    }

    void refreshCodexUsage();
    const timer = window.setInterval(() => {
      void refreshCodexUsage();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [state?.settings.showCodexUsage]);

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

  async function refreshCodexUsage() {
    setUsageRefreshing(true);
    try {
      setCodexUsage(await window.todoApi.getCodexUsage());
    } catch {
      setCodexUsage({
        status: 'error',
        message: '读取 Codex 用量失败'
      });
    } finally {
      setUsageRefreshing(false);
    }
  }

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

  function notifyError(message: string) {
    setToastText(message);
    setTimeout(() => setToastText(''), 1800);
  }

  async function addTask() {
    const text = newTaskText.trim();
    if (!text) {
      return;
    }

    try {
      const next = await window.todoApi.addTask(text);
      setState(next);
      setNewTaskText('');
    } catch {
      notifyError('添加失败，请检查待办文件是否可写');
      void refreshState();
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    try {
      setState(await window.todoApi.toggleTask(taskId, completed));
    } catch {
      notifyError('操作失败，请稍后重试');
      void refreshState();
    }
  }

  async function deleteTask(taskId: string) {
    try {
      setState(await window.todoApi.deleteTask(taskId));
    } catch {
      notifyError('删除失败，请稍后重试');
      void refreshState();
    }
  }

  async function updateTaskText(taskId: string, text: string) {
    try {
      setState(await window.todoApi.updateTaskText(taskId, text));
    } catch {
      notifyError('保存失败，请稍后重试');
      void refreshState();
    }
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

    try {
      const next = await window.todoApi.reorderOpenTasks(reordered.map((task) => task.id));
      setState(next);
    } catch {
      notifyError('排序保存失败');
      void refreshState();
    }
  }

  async function saveSettings() {
    const next = await window.todoApi.updateSettings({
      todoFilePath: settingsDraft.todoFilePath,
      globalShortcut: settingsDraft.globalShortcut,
      launchAtStartup: settingsDraft.launchAtStartup,
      desktopLockPosition: settingsDraft.desktopLockPosition,
      desktopMouseThrough: settingsDraft.desktopMouseThrough,
      showCodexUsage: settingsDraft.showCodexUsage,
      windowOpacity: settingsDraft.windowOpacity,
      theme: settingsDraft.theme,
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

  async function changeTheme(theme: ThemeMode) {
    const next = await window.todoApi.updateSettings({ theme });
    setState(next);
    setSettingsDraft((prev) => ({ ...prev, theme: next.settings.theme }));
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

  function updateWebdav<K extends keyof AppSettings['webdav']>(key: K, value: AppSettings['webdav'][K]) {    setSettingsDraft((prev) => ({
      ...prev,
      webdav: {
        ...prev.webdav,
        [key]: value
      }
    }));
  }

  return (
    <div
      data-theme={effectiveTheme}
      style={{ colorScheme: effectiveTheme }}
      className="relative h-screen w-screen overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--bg)] text-[var(--text)]"
    >
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* 顶部品牌栏（可拖拽） */}
        <header className="flex h-10 flex-shrink-0 items-center justify-between px-3" style={dragStyle}>
          <div className="flex items-center gap-2">
            <ApexLogo size={20} />
            <span className="text-[13px] font-semibold tracking-wide">ApexTodo</span>
            {state?.settings.desktopPinned && (
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" title="已固定到桌面" />
            )}
          </div>
          <div className="flex items-center gap-0.5" style={noDragStyle}>
            <button
              className="ghost-icon"
              onClick={() => void changeTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
              title={effectiveTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
              {effectiveTheme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
            <button className="ghost-icon" onClick={() => setSettingsOpen((v) => !v)} title="设置">
              <SettingsIcon size={15} />
            </button>
            <button className="ghost-icon" onClick={() => void window.todoApi.minimizeWindow()} title="最小化">
              <MinusIcon size={15} />
            </button>
            <button className="ghost-icon danger" onClick={() => void window.todoApi.closeWindow()} title="退出">
              <CloseIcon size={15} />
            </button>
          </div>
        </header>

        {state?.settings.showCodexUsage && (
          <div className="mx-3 mb-1.5 flex items-center gap-2">
            {codexUsage?.status === 'ready' && codexUsage.fiveHour && codexUsage.weekly ? (
              <>
                <TopUsageMetric label="5 小时" usage={codexUsage.fiveHour} />
                <TopUsageMetric label="本周" usage={codexUsage.weekly} />
              </>
            ) : (
              <p
                className={`min-w-0 flex-1 truncate text-[11px] ${codexUsage?.status === 'error' ? 'text-rose-500' : 'text-[var(--text-2)]'}`}
                title={codexUsage?.message || '正在读取 Codex 用量'}
              >
                {usageRefreshing ? '正在读取 Codex 用量…' : codexUsage?.message || 'Codex 用量不可用'}
              </p>
            )}
            <button
              type="button"
              className="ghost-icon !h-6 !w-6 flex-shrink-0"
              onClick={() => void refreshCodexUsage()}
              disabled={usageRefreshing}
              title={codexUsage?.fetchedAt ? `更新于 ${dayjs(codexUsage.fetchedAt).format('HH:mm:ss')}` : '刷新 Codex 用量'}
              aria-label="刷新 Codex 用量"
            >
              <RefreshIcon size={12} className={usageRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        )}

        {/* 副标题 */}
        <div className="flex items-center justify-between px-3 pb-1 text-[11px] text-[var(--text-3)]">
          <span className="tabular-nums">{dayjs().format('MM-DD HH:mm')}</span>
          <span>{openTasks.length} 项待办</span>
        </div>

        {/* 命令式输入 */}
        <div className="flex-shrink-0 px-3 pb-3 pt-1">
          <div className="group/input flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 transition-all duration-200 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
            <PlusIcon size={15} className="flex-shrink-0 text-[var(--text-3)] transition-colors group-focus-within/input:text-[var(--accent)]" />
            <input
              value={newTaskText}
              onChange={(event) => setNewTaskText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void addTask();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
              placeholder="添加任务，回车确认…"
            />
            <kbd className="hidden flex-shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--text-3)] sm:block">
              Enter
            </kbd>
          </div>
        </div>

        {/* 任务列表 */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
            <SortableContext items={openTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2.5">
                {openTasks.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onUpdateText={updateTaskText}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {openTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-3)]">
                <CheckIcon size={18} />
              </span>
              <p className="text-xs text-[var(--text-3)]">全部搞定，暂无待办</p>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="mt-1">
              <button
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-2)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                onClick={() => setCompletedOpen((v) => !v)}
              >
                <ChevronDownIcon
                  size={13}
                  className={`transition-transform duration-300 ${completedOpen ? 'rotate-180' : ''}`}
                />
                <span>已完成 · {completedTasks.length}</span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ${
                  completedOpen ? 'max-h-[40vh] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="flex max-h-[40vh] flex-col gap-2.5 overflow-auto">
                  {completedTasks.map((task: TodoItem) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleTask(task.id, false)}
                        title="标记为未完成"
                        className="grid h-[18px] w-[18px] flex-shrink-0 place-items-center self-center rounded-full border border-[var(--success)] bg-[var(--success)] text-white"
                      >
                        <CheckIcon size={11} strokeWidth={3} />
                      </button>
                      <p className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-[var(--text-3)] line-through">
                        {task.text}
                      </p>
                      <span
                        className="flex-shrink-0 text-[10px] tabular-nums text-[var(--text-3)]"
                        title={dayjs(task.createdAt).isValid() ? dayjs(task.createdAt).format('YYYY-MM-DD HH:mm') : task.createdAt}
                      >
                        {dayjs(task.createdAt).isValid()
                          ? dayjs(task.createdAt).isSame(dayjs(), 'day')
                            ? dayjs(task.createdAt).format('HH:mm')
                            : dayjs(task.createdAt).format('MM-DD')
                          : task.createdAt}
                      </span>
                      <button
                        className="ghost-icon danger !h-7 !w-7 flex-shrink-0 text-[var(--text-3)]"
                        onClick={() => void deleteTask(task.id)}
                        title="删除待办"
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 设置面板 */}
        {settingsOpen && (
          <section className="settings-panel">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold">设置</p>
              <button className="ghost-icon" onClick={() => setSettingsOpen(false)} title="关闭">
                <CloseIcon size={15} />
              </button>
            </div>

            <p className="setting-group-label">窗口与桌面</p>
            <div className="setting-row">
              <div>
                <div className="setting-label">始终置顶</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={state?.settings.alwaysOnTop ?? true}
                disabled={state?.settings.desktopPinned ?? false}
                onChange={(event) => void toggleAlwaysOnTop(event.target.checked)}
              />
            </div>
            <div className="setting-row">
              <div className="setting-label">嵌入桌面</div>
              <input
                type="checkbox"
                className="toggle"
                checked={state?.settings.desktopPinned ?? false}
                onChange={() => void toggleDesktopPin()}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">锁定位置</div>
                <div className="setting-hint">仅桌面模式可用</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={settingsDraft.desktopLockPosition}
                disabled={!(state?.settings.desktopPinned ?? false)}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, desktopLockPosition: event.target.checked }))}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">鼠标穿透</div>
                <div className="setting-hint">Ctrl+Shift+Z 快速切换</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={settingsDraft.desktopMouseThrough}
                disabled={!(state?.settings.desktopPinned ?? false)}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, desktopMouseThrough: event.target.checked }))}
              />
            </div>
            <div className="setting-row">
              <div className="setting-label">开机自启（静默）</div>
              <input
                type="checkbox"
                className="toggle"
                checked={settingsDraft.launchAtStartup}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, launchAtStartup: event.target.checked }))}
              />
            </div>

            <p className="setting-group-label">Codex 用量</p>
            <div className="setting-row">
              <div>
                <div className="setting-label">显示 Codex 用量</div>
                <div className="setting-hint">顶部展示 5 小时 / 本周用量</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={settingsDraft.showCodexUsage}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, showCodexUsage: event.target.checked }))}
              />
            </div>

            <p className="setting-group-label">外观</p>
            <div className="setting-row">
              <div className="setting-label">主题模式</div>
              <div className="theme-seg">
                {(
                  [
                    { value: 'light', label: '浅色' },
                    { value: 'dark', label: '深色' },
                    { value: 'system', label: '跟随系统' }
                  ] as { value: ThemeMode; label: string }[]
                ).map((option) => (
                  <button
                    key={option.value}
                    className={themeMode === option.value ? 'active' : ''}
                    onClick={() => void changeTheme(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">窗口透明度</div>
              <div className="flex w-1/2 items-center gap-2">
                <input
                  type="range"
                  className="slider"
                  min={35}
                  max={100}
                  value={Math.round((settingsDraft.windowOpacity ?? 0.96) * 100)}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({
                      ...prev,
                      windowOpacity: Number(event.target.value) / 100
                    }))
                  }
                />
                <span className="w-9 text-right text-[11px] tabular-nums text-[var(--text-2)]">
                  {Math.round((settingsDraft.windowOpacity ?? 0.96) * 100)}%
                </span>
              </div>
            </div>

            <p className="setting-group-label">快捷键</p>
            <div className="setting-row">
              <div className="flex items-center gap-2 setting-label">
                <KeyboardIcon size={14} className="text-[var(--text-2)]" />
                全局抓取热键
              </div>
              <button className="ghost-text" onClick={() => setIsCapturingShortcut(true)}>
                {isCapturingShortcut ? '请按组合键…' : formatShortcutForDisplay(settingsDraft.globalShortcut)}
              </button>
            </div>

            <p className="setting-group-label">存储</p>
            <div className="setting-row">
              <div className="flex items-center gap-2 setting-label">
                <FolderIcon size={14} className="text-[var(--text-2)]" />
                待办文件夹
              </div>
              <button className="ghost-text" onClick={() => void selectTodoFolder()} disabled={selectingFolder}>
                {selectingFolder ? '选择中…' : '选择文件夹'}
              </button>
            </div>
            <p className="break-all px-1 pb-1 text-[11px] text-[var(--text-3)]">
              {getTodoFolderPath(settingsDraft.todoFilePath) || '默认：文档/ApexTodo/todo.md'}
            </p>

            <p className="setting-group-label flex items-center gap-1.5">
              <CloudIcon size={12} /> WebDAV 同步
            </p>
            <div className="setting-row">
              <div className="setting-label">启用 WebDAV</div>
              <input
                type="checkbox"
                className="toggle"
                checked={settingsDraft.webdav.enabled}
                onChange={(event) => updateWebdav('enabled', event.target.checked)}
              />
            </div>
            <div className="mt-2 space-y-2">
              <input value={settingsDraft.webdav.url} onChange={(event) => updateWebdav('url', event.target.value)} className="field" placeholder="WebDAV 地址" />
              <div className="grid grid-cols-2 gap-2">
                <input value={settingsDraft.webdav.username} onChange={(event) => updateWebdav('username', event.target.value)} className="field" placeholder="用户名" />
                <input value={settingsDraft.webdav.password} onChange={(event) => updateWebdav('password', event.target.value)} className="field" placeholder="密码" type="password" />
              </div>
              <input value={settingsDraft.webdav.remotePath} onChange={(event) => updateWebdav('remotePath', event.target.value)} className="field" placeholder="远端路径 /todo.md" />
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 text-[var(--text-2)]">同步间隔</span>
                <input
                  value={String(settingsDraft.webdav.intervalMinutes || 60)}
                  onChange={(event) => updateWebdav('intervalMinutes', Math.max(1, Number(event.target.value) || 60))}
                  className="field !w-24"
                  type="number"
                  min={1}
                />
                <span className="text-[var(--text-3)]">分钟</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="btn-primary flex-1" onClick={() => void saveSettings()}>
                保存设置
              </button>
              <button className="ghost-text flex-1 justify-center" onClick={() => void runSync()} disabled={syncing}>
                <RefreshIcon size={13} className={syncing ? 'animate-spin' : ''} />
                {syncing ? '同步中…' : '立即同步'}
              </button>
            </div>

            <p className="mt-2.5 text-[11px] text-[var(--text-3)]">
              最近同步：{state?.lastSyncTime ? dayjs(state.lastSyncTime).format('MM-DD HH:mm:ss') : '暂无'} · {state?.syncMessage ?? '未开始'}
            </p>
          </section>
        )}

        {toastText && <div className="toast-chip">{toastText}</div>}
      </div>
    </div>
  );
}
