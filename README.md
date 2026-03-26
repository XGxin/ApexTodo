# ApexTodo

一个面向 Windows 的本地 Markdown 待办桌面工具，强调录入效率、低干扰和可持续同步。

## 功能特性

- 本地 Markdown 存储：所有任务都写入单一 `todo.md` 文件。
- 极简桌面窗口：无边框风格、托盘化使用、低干扰界面。
- 双区任务流转：待办区与已完成折叠区自动流转。
- 拖拽排序：主列表拖拽后，按新顺序覆盖写回 `todo.md`。
- 全局热键抓取：可自定义热键，后台复制选中文本并入栈顶。
- 快捷键录制：设置中直接按键录制，立即生效；冲突时自动回退旧快捷键。
- 桌面模式：支持嵌入桌面、锁定位置、鼠标穿透（`Ctrl+Shift+Z` 快速切换）。
- WebDAV 同步：支持手动同步和定时同步（默认每 60 分钟）。
- 仅新增通知：只有“新增待办”会触发系统通知，其他操作静默。

## 技术栈

- Electron
- React + TypeScript
- Tailwind CSS
- dnd-kit
- WebDAV SDK

## 项目结构

```text
.
├─ src
│  ├─ main
│  │  ├─ main.ts        # 主进程：窗口、IPC、热键、同步调度
│  │  ├─ markdown.ts    # Markdown Task 解析与序列化
│  │  ├─ storage.ts     # 本地文件与设置持久化
│  │  └─ sync.ts        # WebDAV 同步服务
│  ├─ preload
│  │  └─ preload.ts     # 安全桥接 API
│  ├─ renderer
│  │  ├─ App.tsx
│  │  ├─ index.css
│  │  └─ components
│  └─ shared
│     └─ types.ts
├─ package.json
└─ README.md
```

## 快速开始

### 1. 环境要求

- Node.js 18+（建议 Node.js 22 LTS）
- npm 9+
- Windows 10/11

### 2. 安装依赖

```bash
npm install
```

### 3. 开发运行

```bash
npm run dev
```

### 4. 生产构建

```bash
npm run build
```

## 打包发布

### 安装版（NSIS）

```bash
npm run dist
```

### 便携版（Portable EXE）

```bash
npm run dist:portable
```

打包输出目录：`release/`

## 使用说明

### 任务录入与管理

- 输入框回车或点击“添加”，新任务会插入到列表顶端（LIFO）。
- 任务支持编辑、删除、勾选完成、从已完成回退。
- 拖拽句柄可调整待办优先级，排序结果会写回 Markdown 物理顺序。

### 全局热键抓取

- 默认热键：`Ctrl + Shift + A`
- 设置面板可“按键录制”快捷键，无需手动输入。
- 录制后立即生效；如果新热键被占用，会自动回退到旧热键。
- 触发后会尝试复制当前选中文本并生成待办，插入栈顶。

### 桌面模式

- 开启“嵌入桌面”后，会自动关闭“始终置顶”。
- 可选“锁定位置”防止误拖动。
- 可选“鼠标穿透”，并可用 `Ctrl + Shift + Z` 快速切换穿透状态。

### 本地文件

- 默认待办文件：`文档/ApexTodo/todo.md`
- 设置中可直接选择“待办文件夹”，程序会自动使用该目录下的 `todo.md`。
- 外部编辑 `todo.md` 后，界面会自动热更新。

### WebDAV 同步

- 可配置 `URL / 用户名 / 密码 / 远端路径`。
- 支持手动“立即同步”。
- 支持后台定时同步，默认间隔 60 分钟（可自定义，单位分钟）。

## Markdown 格式示例

```markdown
- [ ] 修复同步冲突处理 (2026-03-26 10:30)
- [x] 完成桌面模式联调 (2026-03-26 09:10)
```

## 已知说明

- 全局抓取依赖系统复制行为，某些高权限窗口可能无法抓取。
- 桌面模式是 Electron 下的近似实现，不是系统底层壁纸层嵌入。

## 开源协议

MIT License
