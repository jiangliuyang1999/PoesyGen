# Native UI（未启用）

该包目前是空的 UI 占位包，未接入任何应用运行时。项目没有使用 React Native，也不
依赖 API SDK。

iOS 和 Android 由 `apps/mobile` 的 Capacitor 壳承载，直接打包并复用
`apps/web/src` 中的 React 页面、组件和本地业务逻辑；平台差异通过响应式样式、
Capacitor 能力和移动端专用组件处理。
