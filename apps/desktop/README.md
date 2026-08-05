# Desktop

Electron 桌面端复用 `apps/web` 的 React 界面和 `@poesygen/client-sdk` 调用链。桌面端
只负责窗口、菜单、静态资源加载和 API 转发，不复制生成、词谱或音韵业务逻辑。

## 开发模式

从仓库根目录启动完整开发环境：

```bash
pnpm infra:up
pnpm dev
```

Turborepo 会同时启动 API、Worker、Web 和 Electron。Electron 会等待 Vite 的
`http://localhost:5173` 可用后自动显示窗口。

如果 Web 和 API 已经在运行，也可以只启动桌面壳：

```bash
pnpm --filter @poesygen/desktop dev
```

可通过 `DESKTOP_WEB_URL` 指定其他 Web 开发地址，通过 `POESYGEN_API` 指定 API 地址。

## 构建后预览

```bash
pnpm build
pnpm --filter @poesygen/desktop preview
```

预览模式从 `apps/web/dist` 加载资源，并通过 `poesygen://app/api` 将请求转发到
`POESYGEN_API`，默认地址为 `http://127.0.0.1:3000`。

桌面窗口会给 Web 添加 `platform=desktop`，启用更宽的工作区和更紧凑的桌面布局。
