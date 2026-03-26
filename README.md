# ApexTodo（Windows 桌面待办）

一个追求极速录入与视觉降噪的本地 Markdown 桌面待办工具。

## 技术栈

- Electron（桌面壳，负责全局热键、窗口控制、开机自启、文件系统）
- React + TypeScript（渲染层）
- Tailwind CSS（玻璃化 UI 与动效）
- dnd-kit（拖拽排序）
- WebDAV（局域网/NAS 同步）

## 项目结构

```text
.
├─ src
│  ├─ main
│  │  ├─ main.ts          # 主进程：窗口、IPC、热键、文件监听、同步
│  │  ├─ markdown.ts      # Markdown Task 解析/序列化
│  │  ├─ storage.ts       # 本地文件与设置持久化
│  │  └─ sync.ts          # WebDAV 同步服务
│  ├─ preload
│  │  └─ preload.ts       # 安全桥接 API
│  ├─ renderer
│  │  ├─ App.tsx          # 主界面
│  │  ├─ index.css        # Tailwind 与全局样式
│  │  ├─ main.tsx         # 渲染入口
│  │  ├─ env.d.ts         # 渲染端类型声明
│  │  └─ components
│  │     └─ SortableTaskItem.tsx
│  └─ shared
│     └─ types.ts         # 主渲染共享类型
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
├─ postcss.config.js
└─ tsconfig.json
```

## 初始化与运行

1. 安装依赖

```bash
npm install
```

2. 开发运行（Electron + React 热更新）

```bash
npm run dev
```

3. 构建产物

```bash
npm run build
```

4. 打包 Windows 安装包（NSIS）

```bash
npm run dist
```

安装包输出目录：`release/`

## 功能说明

### 1) 无边框/透明 + 桌面模式

- 窗口为 `frameless + transparent`
- 支持「始终置顶」
- 支持「嵌入桌面模式」（通过窗口策略避免 Win+D 后长期消失，属于 Electron 侧近似实现）

### 2) 全局热键抓取

- 默认热键：`CommandOrControl+Shift+A`
- 热键触发后调用系统 SendKeys 发送 `Ctrl+C`，再读取剪贴板
- 自动转成 Markdown Task，并插入栈顶（LIFO）

### 3) 状态流转

- 待办区与已完成折叠区分离
- 勾选后进入已完成区（灰色 + 删除线）
- 在已完成区取消勾选后回到主列表底部

### 4) 拖拽排序

- 主列表支持拖拽手柄排序
- 排序后全量重写到底层 `todo.md`，保证物理顺序一致

### 5) 本地存储 + WebDAV

- 默认文件：`文档/ApexTodo/todo.md`
- 监听 `todo.md` 外部修改并热更新
- 支持 WebDAV 地址/账号/密码/远程路径/同步间隔配置
- 可手动立即同步，也可后台定时同步

## 常见问题

1. 热键触发后没抓到文本
- 先在目标应用中真正选中文本，再按热键。
- 某些高权限窗口（管理员权限）可能拦截普通权限发送键。

2. WebDAV 同步失败
- 检查 URL 是否包含正确路径（如 `/dav`）。
- 检查远程路径是否有写权限（如 `/todo.md`）。

3. 开机自启不生效
- 保存设置后重启一次应用。
- 某些系统策略会拦截开机启动项。

## Markdown 格式示例

```markdown
- [ ] 修复同步冲突处理 (2026-03-24 11:00)
- [x] 完成 UI 动效微调 (2026-03-24 10:20)
```
