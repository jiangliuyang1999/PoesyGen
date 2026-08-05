# Mobile

Capacitor iOS / Android 应用壳。应用直接打包 `apps/web/dist`，因此创作、历史记录、
词谱、字典和局部修改功能均与 Web 共用同一套 React 组件。移动端差异集中在
`html[data-platform='mobile']` 对应的响应式样式。

## 环境要求

- iOS：macOS、Xcode 26 或兼容版本
- Android：Android Studio、Android SDK、JDK 21
- 可从模拟器或真机访问的 PoesyGen API

LLM Key、Redis 和 Worker 仍只配置在服务端。移动端只需要 API 地址。

## 同步 Web 代码

每次 Web 页面有改动后，重新构建并同步到两个原生工程：

```bash
VITE_API_URL=https://api.example.com \
  pnpm --filter @poesygen/mobile sync
```

`VITE_API_URL` 会写入本次 Web 构建，不能使用设备自身无法访问的地址。生产安装包应
使用 HTTPS API。iOS 模拟器调试本机服务时通常可使用
`http://127.0.0.1:3000`；真机需要使用局域网或已部署的 HTTPS 地址。

## 运行

直接同步并运行：

```bash
VITE_API_URL=http://127.0.0.1:3000 \
  pnpm --filter @poesygen/mobile run:ios

VITE_API_URL=https://api.example.com \
  pnpm --filter @poesygen/mobile run:android
```

也可以打开原生工程后从 IDE 选择设备、签名和构建类型：

```bash
pnpm --filter @poesygen/mobile open:ios
pnpm --filter @poesygen/mobile open:android
```

iOS 发布通过 Xcode Archive；Android 发布通过 Android Studio 生成签名后的 AAB。
本地历史记录保存在各自应用 WebView 的 `localStorage` 中，不与浏览器或另一台设备
自动同步。
