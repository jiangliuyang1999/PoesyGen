# PoesyGen

PoesyGen 是面向 CLI、Web、Electron 桌面端和 Capacitor 移动端的 AI 词作生成工具。
LLM 负责创作，确定性规则引擎负责字数、平仄和押韵校验，LangGraph 根据校验结果进行
有限轮次的修复。

项目不需要 API 服务、Worker、Redis 或数据库。Web、桌面和移动端直接加载本地词谱、
韵书与字典数据，并从当前设备调用用户配置的 OpenAI-compatible LLM。生成历史只保存
在当前设备。

## 当前能力

- 创作、历史记录、词谱和字典四个独立页面；创作页与词谱页各自维护词牌选择，互不影响。
- 词牌目录统一按拼音排序；Web 和桌面端分页展示，移动端一次展示全部词牌，CLI 的浏览
  命令及交互选择使用相同顺序。首次载入时，创作页和词谱页均默认选择拼音顺序中的
  第一个词牌及其第一个体式。
- 可填写创作主题、最大优化轮数和附加要求；主题输入框在 3 至 10 行之间随内容自动调整，
  并支持调用已配置的 LLM 保持原意重新润色。生成期间展示创作、校验、修订和完成等真实
  Workflow 进度。
- 生成结果支持正文、格律标注和局部修改三种视图。局部修改可同时选择多段字、词、片段
  或整句，分别填写意见后统一重新生成。
- 确定性格律校验逐项检查词牌体式、句数、字数、平仄和《词林正韵》韵部；词谱要求
  押韵的句尾必须同韵，未标记韵脚的句尾必须避开本词正在使用的押韵韵部，避免出现
  所有句尾一律押韵的情况。多韵组词牌按词谱顺序要求相邻韵组换用不同韵部，但允许
  非相邻韵组重新使用先前韵部。
- 同一次创作的局部修改结果保存为一条历史记录中的多个版本，可在创作页和历史详情中
  切换版本并继续修改。
- 本地历史最多保存 40 条并支持搜索，Web 和桌面端分页展示，移动端一次展示全部记录；
  详情突出词牌、体式、韵脚和创作主题，可从词牌卡展开完整词谱预览，优化轮数与附加
  要求以简洁文本展示，并可从记录卡片删除不再需要的记录。内部 UUID 只用于记录与
  版本关联，不在界面中显示。
- Web 和桌面端使用左右双栏创作布局；移动端使用底部导航和单列卡片，并按“词牌设置、
  词牌预览、创作主题、生成设置、生成结果”排列创作内容。
- Web favicon、页面品牌标志、macOS/Windows 桌面图标及 iOS/Android 应用图标统一使用
  “词”字印章设计；移动端启动画面使用同一品牌图标。

## 项目结构

```text
apps/
  cli/          Commander CLI，本地运行生成工作流
  web/          React + Vite
  desktop/      Electron 桌面壳，复用 Web
  mobile/       Capacitor iOS / Android 壳，复用 Web
packages/
  domain/       领域模型与跨端复用的词牌派生规则
  patterns/     《御定词谱》版本化词牌谱
  prosody/      《词林正韵》、Unihan 与确定性校验
  workflow/     LangGraph 生成与修复流程
  llm/          OpenAI-compatible LLM Provider
  db/           未接入当前端侧运行链路的保留数据模型包
  ui-*/         未接入运行时的 UI 占位包
```

Web 端将词牌目录、分页、生成请求组装和生成进度会话拆分为独立纯函数或组件；CLI 与 Web
共享 `domain` 中的词牌分组、格律统计和韵脚标签推导，避免多端维护不同实现。

## 本地开发

要求 Node.js 22.13 以上、pnpm 11。

```bash
pnpm install
pnpm --filter @poesygen/web dev
```

Web 地址为 `http://localhost:5173`。页面无需 LLM 配置即可浏览全部 36 个词牌、231
种体式，查询《词林正韵》和 Unihan 字音。

## Web 生成配置

点击页面右上角的 `LLM 未配置`，填写以下 OpenAI-compatible 参数：

- API Base URL，或完整 Endpoint
- Model
- API Key
- 可选的输出 Token、超时和 JSON Mode

只有配置完整后才能生成词作或调用模型获取灵感。未配置时不会发出模型请求，灵感推荐
改为从内置的固定 100 条主题中随机选取 3 条。

浏览器直连要求模型服务允许当前页面跨域访问（CORS）；Capacitor 移动端使用原生 HTTP
请求，不受 WebView CORS 限制。API Key 默认只保存在当前会话，只有明确勾选持久保存
后才会写入 `localStorage`。

Web 前端会通过 `console.log` 输出结构化详细日志，统一以 `[PoesyGen][模块]` 开头。
日志覆盖应用初始化、页面导航、目录/字典查询、LLM 配置、灵感与主题润色、请求/响应正文、
生成轮次、格律问题、局部修改、版本切换和历史记录持久化。可在浏览器开发者工具 Console
中筛选 `PoesyGen` 查看。API Key、Authorization、Token、Cookie、密码及 URL 中的同类
查询参数会自动脱敏；主题、提示词和生成正文会出现在本机控制台日志中。

## CLI

CLI 同样直接加载本地数据。浏览命令不需要 LLM：

```bash
pnpm --filter @poesygen/cli dev -- patterns
pnpm --filter @poesygen/cli dev -- pattern 如梦令
pnpm --filter @poesygen/cli dev -- character 一
```

不带子命令进入交互模式时，启动页会使用 FIGlet `Standard` 字体显示 `PoesyGen`
标题。词牌浏览和创作选择均按拼音排列，相同词牌的多个体式继续归在同一词牌名下。

生成前至少配置 `LLM_BASE_URL`（或 `LLM_ENDPOINT`）、`LLM_MODEL` 和
`LLM_API_KEY`。可以将 `.env.example` 复制为仓库根目录的 `.env`，也可以直接设置当前
进程环境变量。CLI 会静默加载存在的 `.env`，但最终只根据环境变量是否完整进行判断：

```bash
pnpm --filter @poesygen/cli dev -- generate \
  --pattern ru-meng-ling-standard \
  --theme "暮春江上归舟，怀念故友"
```

在交互菜单选择“创作一首词”或通过 `generate` 进入交互补参时，CLI 会先检查 LLM
环境变量；缺少必填项时逐项提示并写入当前 CLI 进程，配置完整后才进入词牌名、体式、
主题和韵部选择。非交互模式不会提示输入，仍会明确列出缺失变量。CLI 会在当前进程调用
LLM，并运行与 Web 相同的格律校验、循环修复和进度输出流程。

## 桌面与移动端

```bash
pnpm --filter @poesygen/desktop dev
pnpm --filter @poesygen/desktop preview

pnpm --filter @poesygen/mobile sync
pnpm --filter @poesygen/mobile open:ios
pnpm --filter @poesygen/mobile open:android
```

桌面端和移动端均打包 Web 业务代码，不需要部署服务端。平台环境和调试方式见
[`apps/desktop/README.md`](apps/desktop/README.md) 与
[`apps/mobile/README.md`](apps/mobile/README.md)。

## 发布安装包

所有发布产物统一输出到仓库根目录的 `release/`：

```bash
# 一键检查并构建全部可测试安装包
pnpm package:all

# macOS 通用应用 ZIP（Apple Silicon + Intel）
pnpm package:mac

# Windows x64 NSIS 安装器和 ZIP
pnpm package:win

# Android 可直接安装的测试 APK
pnpm package:android:test

# iOS Simulator 应用 ZIP
pnpm package:ios:simulator
```

`pnpm package:all` 会依次执行依赖冻结安装、数据/格式/类型/测试/生产构建检查，生成统一
图标，然后构建 macOS ZIP/DMG、Windows EXE/ZIP、Android debug APK 和 iOS Simulator
ZIP，最后生成并验证 `release/SHA256SUMS`。该命令涉及 `hdiutil` 和 Swift Package
Manager，必须在 macOS 系统 Terminal 中运行。

```bash
# 跳过 DMG
pnpm package:all -- --skip-dmg

# 跳过重复质量检查
pnpm package:all -- --skip-checks

# 预览将执行的命令，不改动文件
pnpm package:all -- --dry-run
```

配置 Android keystore、`APPLE_TEAM_ID` 和有效 Apple 签名身份后，可追加生成 Android
release APK/AAB 与 iOS TestFlight 包：

```bash
pnpm package:all:signed
```

macOS DMG、iOS 真机 IPA/TestFlight、Android 正式 APK/AAB 需要对应平台签名条件，命令与
环境变量见 [`apps/desktop/README.md`](apps/desktop/README.md) 和
[`apps/mobile/README.md`](apps/mobile/README.md)。签名证书、keystore 和密码不得提交
到仓库。

## 质量检查

```bash
pnpm data:check
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

图标母版位于 `apps/desktop/build/icon.svg`。修改母版后执行 `pnpm icons:generate`，可重新
生成 Web、桌面、iOS、Android 图标及移动端启动画面。

## 数据边界

- 已导入《御定词谱》36 个常用词牌的 231 种体式、《词林正韵》十九部和 Unicode
  17.0 Unihan 读音数据；来源、修订和许可见 `THIRD_PARTY_DATA.md`。
- 词谱原始数据包含 245 个历史体候选，其中 231 体通过例词、字数、句式和韵位回查。
- 《词林正韵》转录质量和多音字判断仍有资料边界，古入声优先于现代普通话声调。
