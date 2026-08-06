# Desktop

Electron 桌面端复用 `apps/web` 的 React 界面。桌面壳只负责窗口、菜单、静态资源加载
和外部链接处理，不复制生成、词谱或音韵逻辑，也不代理 API。

## 开发模式

先启动 Web，再启动 Electron：

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

桌面窗口会给 Web 添加 `platform=desktop`，启用更宽的工作区和更紧凑的桌面布局。
