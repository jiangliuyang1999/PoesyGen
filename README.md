# PoesyGen

PoesyGen 是面向 CLI、Web、桌面和移动端的 AI 词作生成平台。LLM 负责创作，
确定性规则引擎负责字数、平仄和押韵校验，LangGraph 工作流根据校验结果进行
有限轮次的修复，并保留过程中韵律表现最好的版本。

## 项目结构

```text
apps/
  api/          Fastify API
  worker/       BullMQ 生成任务消费者
  cli/          Commander CLI
  web/          React + Vite
  desktop/      Electron 桌面壳（复用 Web）
  mobile/       Capacitor iOS / Android 壳（复用 Web）
packages/
  domain/       领域模型
  patterns/     《御定词谱》版本化词牌谱
  prosody/      《词林正韵》、Unihan 与确定性校验
  workflow/     LangGraph 生成与修复流程
  llm/          LLM Provider 端口
  contracts/    Zod API 契约
  client-sdk/   多端共享 API SDK
  db/           Drizzle 数据模型
  queue/        BullMQ 队列适配器
```

## 本地开发

要求 Node.js 22.13 以上、pnpm 11、Docker。

```bash
pnpm install
pnpm infra:up
cp .env.example .env
pnpm dev
```

当前 Web 地址为 `http://localhost:5173`，API 地址为
`http://localhost:3000`。也可以单独运行：

```bash
pnpm --filter @poesygen/api dev
pnpm --filter @poesygen/web dev
pnpm --filter @poesygen/cli dev -- patterns
```

CLI 直接运行时进入方向键交互菜单，也保留适合脚本调用的子命令：

```bash
pnpm --filter @poesygen/cli dev
pnpm --filter @poesygen/cli dev -- pattern 如梦令
pnpm --filter @poesygen/cli dev -- character 一
pnpm --filter @poesygen/cli dev -- generate \
  --pattern ru-meng-ling-standard \
  --theme "暮春江上归舟，怀念故友"
```

Web 工作台分为创作、历史记录、词谱、字典四部分，支持词牌搜索、逐字格律预览、
多韵组设置、最大优化轮数、附加要求，以及《词林正韵》十九部和 Unihan 单字读音
查询。生成后可选择多条单字、词语、片段或整句，分别填写修改意见并生成经过格律
复检的新版本。生成结果会连同当时使用的词谱快照保存在当前浏览器；同一作品的局部
修改会归入一条历史记录，并可切换查看前后版本。

## LLM 与 Worker

Worker 使用 OpenAI 兼容的 `/chat/completions` 协议。API Key 只写入本地 `.env`，
不要提交到仓库。

OpenAI 示例：

```dotenv
REDIS_URL=redis://127.0.0.1:6379
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_API_KEY=<your-api-key>
```

灵感推荐默认复用上述模型，但只允许最多 256 个输出 token，并使用 20 秒超时。也可以
单独指定响应更快的模型；API 启动后会预热一组结果，Web 展示当前结果时会继续预取
下一组，因此后续“换一组”通常不需要现场等待模型：

```dotenv
IDEA_LLM_MODEL=<fast-model-or-endpoint-id>
IDEA_LLM_TIMEOUT_MS=20000
IDEA_LLM_MAX_TOKENS=256
```

如灵感模型使用不同服务或密钥，还可以设置 `IDEA_LLM_BASE_URL`、
`IDEA_LLM_ENDPOINT`、`IDEA_LLM_API_KEY` 和 `IDEA_LLM_EXTRA_HEADERS`。未设置的连接
参数会继续复用对应的 `LLM_*` 配置。

火山方舟示例：

```dotenv
REDIS_URL=redis://127.0.0.1:6379
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_MODEL=<endpoint-id>
LLM_API_KEY=<ARK_API_KEY>
```

`pnpm dev` 会同时启动 API、Worker 和 Web。健康检查：

```bash
pnpm --filter @poesygen/cli dev -- health
```

输出中的 Redis 应为 `ok`，Worker 数量应大于 0。CLI 的 `generate` 默认等待并打印
最终词作；使用 `--no-wait` 可立即返回，之后执行：

```bash
pnpm --filter @poesygen/cli dev -- session <session-id> --wait
```

不调用外部模型的本地队列验证可以临时使用 `LLM_PROVIDER=mock`。该模式只返回词谱
例词，不能用于实际创作。

## 移动端

移动端通过 Capacitor 将 `apps/web/dist` 打包进 iOS 和 Android 原生应用，业务组件
与 Web 完全共用，仅通过移动端平台样式调整安全区、导航、卡片宽度和触控尺寸。

```bash
VITE_API_URL=https://api.example.com \
  pnpm --filter @poesygen/mobile sync

pnpm --filter @poesygen/mobile open:ios
pnpm --filter @poesygen/mobile open:android
```

也可以使用 `run:ios` 或 `run:android` 直接选择模拟器运行。设备必须能访问
`VITE_API_URL`；生产包应使用 HTTPS API。完整环境要求和调试方式见
[`apps/mobile/README.md`](apps/mobile/README.md)。

## 质量检查

```bash
pnpm data:check
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## 当前边界

- 已导入《御定词谱》36 个常用词牌的 231 种体式、《词林正韵》十九部和
  Unicode 17.0 Unihan 读音数据；来源、修订和许可见 `THIRD_PARTY_DATA.md`。
- 词谱共包含 245 个历史体候选，其中 231 体通过例词、字数、句式和韵位回查后进入
  运行时；其余条目及拒绝原因记录在导入报告中。生成状态为 `imported`，表示通过
  机器回查，但仍需文史专家逐条校勘后升级为 `verified`。
- 《词林正韵》维基文库转录标记为 50% 文本质量。古入声优先于现代普通话声调，
  多音字会返回全部候选，不自动猜测上下文读音。
- LLM 层已支持 OpenAI 兼容供应商；真正生成需要在本地配置 API Key。未配置 Redis
  时生成 API 返回 `503`，Worker 未连接时健康检查会明确显示不可用。
- 桌面端通过 Electron、移动端通过 Capacitor 复用 Web 界面；移动端生成仍依赖可访问
  的 API、Xcode 或 Android Studio 及对应平台签名。
