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
4. Unihan 未关联但经锁定古籍与 CCiV 逐字确认的异体字，由
   `manual-character-mappings.json` 中的项目映射补充。
   项目映射会在 Unihan 转换前后各应用一次，以覆盖古籍字形到 Unihan 类推简体、
   再到常用简体的两级关系；显式自映射用于保留现代字典仍采用的生僻字。
5. 单调/双调以词谱规格文本为准；CCiV 的换行只视为排版分块，不作为分阕依据。
6. CCiV 模板的例词应能逐句回查《御定词谱》40 卷，并与原书句读、韵位一致。
7. 无法完全回查但结构可解析的模板以 `draft` 状态保留，并将问题写入导入报告；结构无法解析的模板才会拒绝导入。
8. 经《御定词谱》确认的 CCiV 规格笔误和重复候选在导入器中显式勘误或排除，并写入
   `excludedCandidates`，不得通过放宽校验伪装成权威体式。

生成文件分别位于：

- `packages/patterns/src/data/qinding-cipu.json`
- `packages/prosody/src/data/cilin-zhengyun.json`
- `packages/prosody/src/data/unihan-readings.json`
- `packages/*/src/data/import-report.json`

词谱例词优先保存逐句等长回查得到的《御定词谱》原始繁体文本，并同时生成
`simplifiedLines`。无法安全映射到格律位置的候选体继续保留 CCiV 例词，不生成伪造的繁体版本。

古籍原文属于公共领域；维基文库转录遵循 CC BY-SA 4.0，Unihan 遵循
Unicode License v3。项目分发生成数据时必须保留 `THIRD_PARTY_DATA.md` 中的署名和许可说明。
