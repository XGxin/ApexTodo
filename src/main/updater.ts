import { app, BrowserWindow } from 'electron';
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import { UpdateState } from '../shared/types';

const STARTUP_CHECK_DELAY_MS = 5_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

class AutoUpdateService {
  private window: BrowserWindow | null = null;
  private initialized = false;
  private checkInFlight = false;
  private installScheduled = false;
  private startupTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private state: UpdateState = this.createInitialState();

  initialize(window: BrowserWindow) {
    this.window = window;
    this.emitState();
    if (this.initialized || !this.isSupported()) {
      return;
    }

    this.initialized = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        message: '正在检查更新…'
      });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        status: 'available',
        version: info.version,
        message: `发现新版本 v${info.version}，正在下载…`,
        checkedAt: new Date().toISOString()
      });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.setState({
        status: 'up-to-date',
        version: info.version,
        percent: undefined,
        message: `当前已是最新版 v${app.getVersion()}`,
        checkedAt: new Date().toISOString()
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      const percent = Math.min(100, Math.max(0, Math.round(progress.percent)));
      this.setState({
        status: 'downloading',
        percent,
        message: `正在下载 v${this.state.version ?? ''} · ${percent}%`
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setState({
        status: 'downloaded',
        version: info.version,
        percent: 100,
        message: `v${info.version} 已下载，重启即可完成更新`
      });
    });

    autoUpdater.on('error', (error: Error) => {
      console.error('[auto-update] updater error:', error.name);
      this.setState({
        status: 'error',
        percent: undefined,
        message: '更新失败，请检查网络后重试',
        checkedAt: new Date().toISOString()
      });
    });

    this.startupTimer = setTimeout(() => {
      void this.checkForUpdates();
    }, STARTUP_CHECK_DELAY_MS);

    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates();
    }, PERIODIC_CHECK_INTERVAL_MS);
  }

  getState() {
    return { ...this.state };
  }

  async checkForUpdates() {
    if (!this.isSupported()) {
      this.state = this.createInitialState();
      this.emitState();
      return this.getState();
    }

    if (
      this.checkInFlight ||
      this.state.status === 'available' ||
      this.state.status === 'downloading' ||
      this.state.status === 'downloaded'
    ) {
      return this.getState();
    }

    this.checkInFlight = true;
    this.setState({
      status: 'checking',
      percent: undefined,
      message: '正在检查更新…'
    });

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('[auto-update] check failed:', (error as Error).name || 'Error');
      this.setState({
        status: 'error',
        percent: undefined,
        message: '更新失败，请检查网络后重试',
        checkedAt: new Date().toISOString()
      });
    } finally {
      this.checkInFlight = false;
    }

    return this.getState();
  }

  installUpdate() {
    if (this.state.status !== 'downloaded' || this.installScheduled) {
      return this.getState();
    }

    this.installScheduled = true;
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return this.getState();
  }

  dispose() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    this.window = null;
  }

  private isSupported() {
    return app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE;
  }

  private createInitialState(): UpdateState {
    if (!app.isPackaged) {
      return {
        status: 'disabled',
        currentVersion: app.getVersion(),
        message: '开发模式不检查更新'
      };
    }

    if (process.platform !== 'win32') {
      return {
        status: 'disabled',
        currentVersion: app.getVersion(),
        message: '当前系统暂不支持应用内更新'
      };
    }

    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      return {
        status: 'disabled',
        currentVersion: app.getVersion(),
        message: '便携版不支持自动更新，请安装正式版'
      };
    }

    return {
      status: 'idle',
      currentVersion: app.getVersion(),
      message: '启动后将自动检查更新'
    };
  }

  private setState(partial: Partial<UpdateState>) {
    this.state = {
      ...this.state,
      ...partial,
      currentVersion: app.getVersion()
    };
    this.emitState();
  }

  private emitState() {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send('update:state', this.getState());
  }
}

export const autoUpdateService = new AutoUpdateService();
