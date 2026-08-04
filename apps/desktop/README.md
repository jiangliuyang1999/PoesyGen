# Desktop

Electron 桌面壳预留目录。核心生成协议和 Web 编辑体验稳定后，再接入
`@poesygen/client-sdk` 与共享 Web UI，避免首轮安装完整 Chromium 构建链。

桌面端只负责窗口、系统菜单、文件导出和凭据安全存储；生成与韵律规则仍由 API
和共享核心包负责。
