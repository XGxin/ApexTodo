import { readFile, stat, writeFile } from 'node:fs/promises';
import { createClient } from 'webdav';
import { AppSettings } from '../shared/types';

interface SyncStatus {
  time?: string;
  message: string;
}

export class WebDavSyncService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private getSettings: () => AppSettings,
    private onStatus: (status: SyncStatus) => void
  ) {}

  start() {
    this.restartTimer();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  restartTimer() {
    this.stop();
    const settings = this.getSettings();
    if (!settings.webdav.enabled) {
      return;
    }

    const intervalMinutes = Math.max(1, settings.webdav.intervalMinutes || 60);
    this.timer = setInterval(() => {
      this.sync(settings.todoFilePath).catch((error) => {
        console.error('WebDAV 定时同步失败:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  async sync(todoFilePath: string) {
    const settings = this.getSettings();
    const webdav = settings.webdav;
    if (!webdav.enabled || !webdav.url || !webdav.username) {
      this.onStatus({ message: 'WebDAV 未启用或配置不完整' });
      return;
    }

    const client = createClient(webdav.url, {
      username: webdav.username,
      password: webdav.password
    });

    const remotePath = webdav.remotePath || '/todo.md';
    const localContent = await readFile(todoFilePath, 'utf-8');
    const localStat = await stat(todoFilePath);

    const remoteExists = await client.exists(remotePath);

    if (!remoteExists) {
      await client.putFileContents(remotePath, localContent, { overwrite: true });
      this.onStatus({
        time: new Date().toISOString(),
        message: '首次同步完成，已推送本地文件'
      });
      return;
    }

    const remoteBuffer = await client.getFileContents(remotePath);
    const remoteContent = Buffer.from(remoteBuffer).toString('utf-8');

    if (remoteContent === localContent) {
      this.onStatus({
        time: new Date().toISOString(),
        message: 'WebDAV 已是最新'
      });
      return;
    }

    const remoteStat = await client.stat(remotePath);
    const remoteMtime = remoteStat.lastmod ? Date.parse(remoteStat.lastmod) : 0;

    if (remoteMtime > localStat.mtimeMs + 1000) {
      await writeFile(todoFilePath, remoteContent, 'utf-8');
      this.onStatus({
        time: new Date().toISOString(),
        message: '检测到远端更新，已拉取覆盖本地'
      });
      return;
    }

    await client.putFileContents(remotePath, localContent, { overwrite: true });
    this.onStatus({
      time: new Date().toISOString(),
      message: '本地更新已推送到 WebDAV'
    });
  }
}
