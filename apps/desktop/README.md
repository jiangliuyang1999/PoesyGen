# Desktop

Electron 桌面端复用 `apps/web` 的 React 界面。桌面壳只负责窗口、菜单、静态资源加载
和外部链接处理，不复制生成、词谱或音韵逻辑，也不代理 API。

桌面端与 Web 同步提供创作、历史记录、词谱和字典页面，支持真实生成进度、正文与格律
视图、多项局部修改、单记录多版本及历史记录删除。创作页使用左侧设置、右侧词谱预览
与生成结果的双栏布局。页面之间来回切换时会保留字典查询、历史筛选、分页、选中记录
和详情状态，并滚动到目标页面顶部。格律标注视图会在版本切换按钮同一行的右侧显示
当前版本通过状态，并醒目标记错误、存疑及超出词谱字数的字符。

桌面端复用共享格律校验：多韵组词牌要求相邻韵组使用不同《词林正韵》韵部，非相邻
韵组可以复用先前韵部；非韵句句尾还须避开本词正在使用的押韵韵部。

## 开发模式

分别在两个终端中先启动 Web，再启动 Electron：

```bash
pnpm --filter @poesygen/web dev
pnpm --filter @poesygen/desktop dev
```

Electron 默认打开 `http://localhost:5173`，也可通过 `DESKTOP_WEB_URL` 指定其他 Web
开发地址。

## 构建后预览

```bash
pnpm --filter @poesygen/desktop preview
```

预览命令会构建 Web 和桌面主进程，再通过 `poesygen://app` 加载本地静态资源。词谱、
韵书和字典数据均随 Web 产物打包；用户在页面右上角配置 LLM 后直接生成。

LLM 配置和生成历史保存在桌面应用自己的 Web 存储中，不与普通浏览器或移动端自动
同步。API Key 默认只保留在当前会话，只有用户明确启用持久保存后才写入本地存储。

桌面端复用 Web 的结构化 `console.log` 日志，统一以 `[PoesyGen][模块]` 开头；LLM
凭据会脱敏，但主题、提示词和生成正文会保留在本机开发者工具日志中。

桌面窗口会给 Web 添加 `platform=desktop`，启用更宽的工作区和更紧凑的桌面布局。

桌面安装包图标与 Web、iOS、Android 共用“词”字印章设计。图标母版为
`apps/desktop/build/icon.svg`；修改后在仓库根目录执行 `pnpm icons:generate`，会同步
生成 macOS ICNS、Windows ICO 和其他平台图标。

## 发布安装包

安装包由 `electron-builder` 生成，内置 Web、词谱、韵书和字典资源，统一输出到
`release/desktop/`。

```bash
# 在系统 Terminal 中一键构建桌面和移动端全部测试包
pnpm package:all

# macOS 通用 ZIP，包含 arm64 和 x86_64
pnpm package:mac

# macOS DMG；必须在普通 macOS Terminal 中运行
pnpm package:mac:dmg

# Windows x64 NSIS 安装器和 ZIP，可在 macOS 交叉构建
pnpm package:win
```

一键命令默认包含 macOS ZIP/DMG 和 Windows EXE/ZIP，并在完成全部平台构建后更新根目录
`release/SHA256SUMS`。只需要 ZIP 时可执行 `pnpm package:all -- --skip-dmg`。

未配置证书时仍可生成测试包，但 macOS Gatekeeper 或 Windows SmartScreen 会提示来源
未知。公开分发前应配置：

- macOS：Developer ID Application 证书，并完成 Apple notarization。
- Windows：代码签名证书；`electron-builder` 支持通过 `CSC_LINK` 和
  `CSC_KEY_PASSWORD` 读取。

当前 TRAE 沙箱禁止 `hdiutil` 访问 `/dev/rdisk*`，因此 DMG 命令需要在系统 Terminal
中执行；默认的 macOS ZIP 不受影响。
