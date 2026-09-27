# ApexTodo 隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-09-27

ApexTodo 由 BigWatermelon 发布。我们重视你的隐私；ApexTodo 不包含广告、分析 SDK 或开发者运营的遥测服务。

ApexTodo is published by BigWatermelon. We value your privacy. ApexTodo contains no advertising, analytics SDK, or developer-operated telemetry service.

## 本地数据 / Local data

- 待办内容默认保存在用户“文档”目录的 `ApexTodo/todo.md`，也可由用户选择其他文件夹。
- 应用设置保存在 Electron 的本地用户数据目录中。
- WebDAV 地址和用户名保存在本地设置文件中；密码在 Windows 支持安全存储时通过 Electron `safeStorage`（Windows 数据保护机制）加密。密码不会发送给开发者，请保护好你的 Windows 账户和设备。
- 卸载应用不会主动删除用户自行创建或选择的待办文件。

- Todo content is stored by default in `ApexTodo/todo.md` under the user's Documents folder, or in another folder selected by the user.
- App settings are stored in Electron's local user-data directory.
- The WebDAV URL and username are stored in the local settings file. When secure storage is available on Windows, the password is encrypted through Electron `safeStorage` (Windows data protection). It is not sent to the developer. Protect your Windows account and device.
- Uninstalling the app does not automatically delete todo files created or selected by the user.

## WebDAV 同步 / WebDAV sync

WebDAV 同步默认关闭。启用后，ApexTodo 会把待办文件及身份验证信息直接发送到用户指定的 WebDAV 服务器。服务器的数据处理、保留和安全策略由该服务器的提供者负责，开发者无法访问这些内容。

WebDAV sync is disabled by default. When enabled, ApexTodo sends the todo file and authentication information directly to the WebDAV server configured by the user. The server provider is responsible for its data processing, retention, and security practices. The developer has no access to that content.

## Codex 用量 / Codex usage

Codex 用量显示默认关闭。启用后，ApexTodo 会在本机读取当前 Codex 登录文件中的访问令牌和账户标识，并直接向 `https://chatgpt.com/backend-api/wham/usage` 请求用量信息。凭据仅在 Electron 主进程中处理，不会传入渲染页面、写入日志或发送给开发者。该请求受 OpenAI 的隐私政策约束。

Codex usage display is disabled by default. When enabled, ApexTodo reads the access token and account identifier from the local Codex authentication file and requests usage information directly from `https://chatgpt.com/backend-api/wham/usage`. Credentials are handled only in the Electron main process; they are not exposed to the renderer, written to logs, or sent to the developer. This request is governed by OpenAI's privacy policy.

## 网络访问 / Network access

除上述用户主动启用的 WebDAV 与 Codex 用量功能外，ApexTodo 不向开发者服务器传输待办内容或个人信息。应用安装和更新由 Microsoft Store 管理。

Except for WebDAV and Codex usage features explicitly enabled by the user, ApexTodo does not transmit todo content or personal information to a developer-operated server. Installation and updates are managed by Microsoft Store.

## 用户控制 / User controls

用户可以随时关闭 WebDAV 和 Codex 用量功能、删除本地设置文件，并自行删除待办文件或远端 WebDAV 文件。如需帮助或提出隐私问题，请通过 [GitHub Issues](https://github.com/XGxin/ApexTodo/issues) 联系我们。

Users can disable WebDAV and Codex usage at any time, delete the local settings file, and delete todo files or remote WebDAV files themselves. For help or privacy questions, contact us through [GitHub Issues](https://github.com/XGxin/ApexTodo/issues).
