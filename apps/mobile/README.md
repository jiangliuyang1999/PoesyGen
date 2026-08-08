# Mobile

Capacitor iOS / Android 应用壳。应用直接打包 `apps/web/dist`，创作、历史记录、词谱、
字典和局部修改均复用同一套 React 组件。

移动端使用底部导航和单列卡片布局。创作页依次显示词牌设置、词牌预览、创作主题、
生成设置和生成结果，主题输入框在 3 至 10 行之间自动调整，并可调用已配置的 LLM 重新
润色；历史页一次显示全部记录，可删除记录或点击记录进入详情。生成结果同样支持正文、
格律标注、多项局部修改和版本切换；格律标注视图在版本切换按钮同一行的右侧显示当前
版本通过状态，并标记错误、存疑及超出词谱字数的字符。历史详情中的词牌卡可展开完整
词谱预览。
移动端词谱列表按词牌拼音排序并一次显示全部词牌；创作页词牌选项也使用相同顺序，两个
页面首次载入时均默认选择第一个词牌的第一个体式。通过底部导航切换页面时，字典查询、
历史筛选、选中记录和详情状态会继续保留，但页面会滚动到顶部。

移动端复用共享格律校验：多韵组词牌要求相邻韵组使用不同《词林正韵》韵部，非相邻
韵组可以复用先前韵部；非韵句句尾还须避开本词正在使用的押韵韵部。

iOS、Android 应用图标和启动画面与 Web、桌面端共用“词”字印章设计。修改
`apps/desktop/build/icon.svg` 后，在仓库根目录执行 `pnpm icons:generate` 可同步生成
全部平台图标资源。

## 环境要求

- iOS：macOS、Xcode 26 或兼容版本
- Android：Android Studio、Android SDK、JDK 21

应用不依赖 PoesyGen 服务端。词谱、韵书和字典随应用打包；用户在右上角配置自己的
OpenAI-compatible Base URL、Model 和 API Key 后，应用通过 Capacitor 原生 HTTP
直接调用模型。API Key 默认只保留在当前会话，只有用户明确启用持久保存后才写入应用
WebView 的本地存储。

移动端复用 Web 的结构化 `console.log` 日志；可通过 Xcode 或 Android Studio 查看
`[PoesyGen][模块]` 事件。LLM 凭据会脱敏，但主题、提示词和生成正文会保留在设备日志中。

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

## Android 安装包

产物输出到 `release/android/`：

```bash
# 在系统 Terminal 中一键构建桌面和移动端全部测试包
pnpm package:all

# 使用 Android debug key 签名，可直接安装测试
pnpm package:android:test

# 使用正式 keystore 生成 APK 或 Play Store AAB
pnpm package:android:apk
pnpm package:android:aab
```

一键命令默认生成 Android debug APK 和 iOS Simulator ZIP；配置下述 Android 与 Apple
签名环境后，`pnpm package:all:signed` 会追加生成 Android release APK/AAB 和 iOS
TestFlight 包。

正式 APK/AAB 必须通过环境变量提供长期保存的签名密钥：

```bash
export ANDROID_KEYSTORE_PATH=/absolute/path/to/poesygen-release.keystore
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='...'
export ANDROID_KEY_PASSWORD='...'
export APP_VERSION_CODE=1

pnpm package:android:aab
```

`APP_VERSION_NAME` 默认使用根 `package.json` 的版本。每次上传应用商店前必须递增
`APP_VERSION_CODE`，并妥善备份 keystore；丢失正式密钥可能导致无法更新已发布应用。

## iOS 安装包

无需签名即可生成并安装到本机 iOS Simulator：

```bash
pnpm package:ios:simulator
```

真机和 TestFlight 需要付费 Apple Developer Team、有效的 Apple Development 或
Distribution 证书以及 provisioning profile：

```bash
export APPLE_TEAM_ID='XXXXXXXXXX'
export IOS_BUNDLE_ID='com.example.poesygen'

# 上传 TestFlight/App Store Connect 的 IPA
pnpm package:ios:testflight

# 已登记测试设备的 Ad Hoc IPA
pnpm package:ios:adhoc
```

产物输出到 `release/ios/`。TRAE 沙箱会阻止 Swift Package Manager 启动内部
`sandbox-exec`，因此 iOS 归档命令需要在系统 Terminal 中运行。TestFlight 上传后，
内部测试员通常可在构建处理完成后直接安装。
