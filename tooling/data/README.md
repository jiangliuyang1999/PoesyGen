# 权威数据导入

`sources.lock.json` 固定每个外部数据源的版本、许可和摘要。运行：

```bash
pnpm data:import
pnpm data:check
```

导入器执行以下检查：

1. 下载内容必须匹配锁文件中的修订或 SHA-256。
2. 《词林正韵》必须包含十九部，并保留同字多音、多韵归属。
3. Unihan 只提供普通话读音、反切、唐音和繁简映射，不用现代拼音声调覆盖古代平仄。
4. CCiV 模板的例词必须能逐句回查《御定词谱》40 卷，并与原书句读、韵位一致。
5. 无法回查或存在结构冲突的模板写入导入报告，不进入运行时数据。

生成文件分别位于：

- `packages/patterns/src/data/qinding-cipu.json`
- `packages/prosody/src/data/cilin-zhengyun.json`
- `packages/prosody/src/data/unihan-readings.json`
- `packages/*/src/data/import-report.json`

古籍原文属于公共领域；维基文库转录遵循 CC BY-SA 4.0，Unihan 遵循
Unicode License v3。项目分发生成数据时必须保留 `THIRD_PARTY_DATA.md` 中的署名和许可说明。
