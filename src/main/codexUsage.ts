import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexUsage, CodexUsageWindow } from '../shared/types';

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const REQUEST_TIMEOUT_MS = 12_000;

interface CodexAuthFile {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
}

interface RawUsageWindow {
  used_percent?: unknown;
  limit_window_seconds?: unknown;
  reset_at?: unknown;
}

interface RawUsageResponse {
  plan_type?: unknown;
  rate_limit?: {
    primary_window?: RawUsageWindow;
    secondary_window?: RawUsageWindow;
  };
}

function unavailable(message: string): CodexUsage {
  return {
    status: 'unavailable',
    message
  };
}

function normalizeWindow(raw: RawUsageWindow | undefined): CodexUsageWindow | undefined {
  if (!raw) {
    return undefined;
  }

  const usedPercent = Number(raw.used_percent);
  const windowSeconds = Number(raw.limit_window_seconds);
  const resetAtSeconds = Number(raw.reset_at);

  if (![usedPercent, windowSeconds, resetAtSeconds].every(Number.isFinite)) {
    return undefined;
  }

  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    windowSeconds,
    resetAt: new Date(resetAtSeconds * 1000).toISOString()
  };
}

function resolveWindows(raw: RawUsageResponse) {
  const windows = [
    normalizeWindow(raw.rate_limit?.primary_window),
    normalizeWindow(raw.rate_limit?.secondary_window)
  ].filter((window): window is CodexUsageWindow => Boolean(window));

  return {
    fiveHour: windows.find((window) => window.windowSeconds >= 4 * 60 * 60 && window.windowSeconds <= 6 * 60 * 60),
    weekly: windows.find(
      (window) => window.windowSeconds >= 6 * 24 * 60 * 60 && window.windowSeconds <= 8 * 24 * 60 * 60
    )
  };
}

export async function getCodexUsage(): Promise<CodexUsage> {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  const authPath = path.join(codexHome, 'auth.json');

  let auth: CodexAuthFile;
  try {
    auth = JSON.parse(await readFile(authPath, 'utf8')) as CodexAuthFile;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return unavailable(code === 'ENOENT' ? '未找到本机 Codex 登录信息' : '无法读取本机 Codex 登录信息');
  }

  const accessToken = auth.tokens?.access_token?.trim();
  if (!accessToken) {
    return unavailable('当前 Codex 登录方式不支持读取套餐用量');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'ApexTodo/1.0.5'
  };
  const accountId = auth.tokens?.account_id?.trim();
  if (accountId) {
    headers['ChatGPT-Account-Id'] = accountId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CODEX_USAGE_URL, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      return unavailable('Codex 登录已失效，请在 Codex 中重新登录');
    }
    if (!response.ok) {
      return {
        status: 'error',
        message: `Codex 用量服务暂不可用（${response.status}）`
      };
    }

    const raw = (await response.json()) as RawUsageResponse;
    const { fiveHour, weekly } = resolveWindows(raw);
    if (!fiveHour || !weekly) {
      return unavailable('当前账户没有返回 5 小时或周用量窗口');
    }

    return {
      status: 'ready',
      planType: typeof raw.plan_type === 'string' ? raw.plan_type : undefined,
      fiveHour,
      weekly,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: (error as Error).name === 'AbortError' ? '读取 Codex 用量超时' : '无法连接 Codex 用量服务'
    };
  } finally {
    clearTimeout(timeout);
  }
}
