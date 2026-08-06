# Mobile

Capacitor iOS / Android 应用壳。应用直接打包 `apps/web/dist`，创作、历史记录、词谱、
字典和局部修改均复用同一套 React 组件。

移动端使用底部导航和单列卡片布局。创作页依次显示词牌设置、词牌预览、创作主题、
生成设置和生成结果；历史页先显示分页记录列表，点击记录后再进入详情。生成结果同样
支持正文、格律标注、多项局部修改和版本切换。

## 环境要求

- iOS：macOS、Xcode 26 或兼容版本
- Android：Android Studio、Android SDK、JDK 21

应用不依赖 PoesyGen 服务端。词谱、韵书和字典随应用打包；用户在右上角配置自己的
OpenAI-compatible Base URL、Model 和 API Key 后，应用通过 Capacitor 原生 HTTP
直接调用模型。API Key 默认只保留在当前会话，只有用户明确启用持久保存后才写入应用
WebView 的本地存储。

## 同步 Web 代码

```bash
pnpm --filter @poesygen/mobile sync
```

该命令构建 Web，并将产物同步到 iOS 和 Android 原生工程，不需要额外的 API
地址环境变量。

## 运行

```bash
pnpm --filter @poesygen/mobile run:ios
pnpm --filter @poesygen/mobile run:android
```

也可以打开原生工程后从 IDE 选择设备、签名和构建类型：

```bash
pnpm --filter @poesygen/mobile open:ios
pnpm --filter @poesygen/mobile open:android
```

iOS 发布通过 Xcode Archive；Android 发布通过 Android Studio 生成签名后的 AAB。
本地历史记录按单次创作归档，局部修改作为同一记录的多个版本保存。记录保存在各自
应用 WebView 的 `localStorage` 中，不与浏览器、桌面端或另一台设备自动同步；内部
记录 UUID 不会显示在界面中。
