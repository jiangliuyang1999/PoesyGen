# 第三方数据说明

PoesyGen 的生成数据包含以下来源。数据源版本固定在
`tooling/data/sources.lock.json`，生成方式见 `tooling/data/README.md`。

## 《御定词谱》

- 原著：清王奕清等奉敕纂修《御定词谱》，原始古籍属于公共领域。
- 数字转录：中文维基文库《御定词谱（四库全书本）》40 卷。
- 页面：https://zh.wikisource.org/wiki/御定詞譜_(四庫全書本)
- 许可：维基文库转录按 CC BY-SA 4.0 提供。
- 修改：导入器将繁体古籍转录与结构化模板对齐，转换为词牌、分段、句长、平仄和韵位数据。

## 《词林正韵》

- 原著：清戈载《词林正韵》，原始古籍属于公共领域。
- 数字转录：中文维基文库。
- 页面：https://zh.wikisource.org/wiki/詞林正韻
- 许可：维基文库转录按 CC BY-SA 4.0 提供。
- 修改：删除释义括注，按十九部、平仄和小韵重建字符索引，并补充繁简字形。
- 注意：源页面标记的文本质量为 50%，因此运行时状态为 `imported`，尚不代表人工逐字校勘完成。

CC BY-SA 4.0 全文：https://creativecommons.org/licenses/by-sa/4.0/

## Unicode Unihan 17.0.0

- 维护者：Unicode, Inc.
- 页面：https://www.unicode.org/reports/tr38/
- 数据：https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip
- 许可：Unicode License v3。
- 修改：仅保留普通话读音、《汉语大字典》拼音、《现代汉语词典》拼音、反切、唐音和繁简映射。

Unicode License v3 全文：https://www.unicode.org/license.txt

## CCiV

- 项目：https://github.com/cubenlp/CCiV
- 固定提交：`1fc85a6fef7e815f87106f9c78ad4c9f691d46d5`
- 许可：仓库 README 声明为 MIT。
- 用途：仅作为《御定词谱》36 个常用词牌结构化模板的候选输入；例词和韵位须回查上面的古籍转录后才进入运行时。
