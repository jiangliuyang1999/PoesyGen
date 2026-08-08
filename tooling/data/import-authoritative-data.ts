import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lockPath = resolve(root, 'tooling/data/sources.lock.json');
const patternsPath = resolve(root, 'packages/patterns/src/data/qinding-cipu.json');
const patternsReportPath = resolve(root, 'packages/patterns/src/data/import-report.json');
const rhymePath = resolve(root, 'packages/prosody/src/data/cilin-zhengyun.json');
const readingsPath = resolve(root, 'packages/prosody/src/data/unihan-readings.json');
const prosodyReportPath = resolve(root, 'packages/prosody/src/data/import-report.json');
const checkOnly = process.argv.includes('--check');

interface SourceDefinition {
  readonly title: string;
  readonly url: string;
  readonly apiUrl?: string;
  readonly archiveUrl?: string;
  readonly revision: string;
  readonly sha256?: string;
  readonly contentSha256?: string;
  readonly license: string;
}

interface SourceLock {
  readonly schemaVersion: number;
  readonly retrievedAt: string;
  readonly sources: {
    readonly qindingCipu: SourceDefinition;
    readonly cilinZhengyun: SourceDefinition;
    readonly unihan: SourceDefinition;
    readonly cciv: SourceDefinition;
  };
}

interface WikiRevision {
  readonly revid: number;
  readonly timestamp: string;
  readonly slots: {
    readonly main: {
      readonly content: string;
    };
  };
}

interface WikiPage {
  readonly title: string;
  readonly revisions: ReadonlyArray<WikiRevision>;
}

interface WikiResponse {
  readonly query: {
    readonly pages: ReadonlyArray<WikiPage>;
  };
}

interface UnihanReadingRecord {
  readonly mandarin?: ReadonlyArray<string>;
  readonly hanyuPinyin?: ReadonlyArray<string>;
  readonly xhc1983?: ReadonlyArray<string>;
  readonly fanqie?: ReadonlyArray<string>;
  readonly tang?: ReadonlyArray<string>;
  readonly simplifiedVariants?: ReadonlyArray<string>;
  readonly traditionalVariants?: ReadonlyArray<string>;
}

interface CilinMembership {
  readonly tone: 'level' | 'oblique';
  readonly rhymeGroup: string;
  readonly rhymeGroupName: string;
  readonly section: string;
  readonly mandarin?: ReadonlyArray<string>;
  readonly fanqie?: ReadonlyArray<string>;
  readonly tang?: ReadonlyArray<string>;
}

interface CandidateTemplate {
  readonly name: string;
  readonly gelv: string;
  readonly poet: string;
  readonly example: string;
  readonly template: string;
}

interface CandidateTune {
  readonly name: string;
  readonly qinding_desc: string;
  readonly qinding_templates: ReadonlyArray<CandidateTemplate>;
}

type CandidateData = Readonly<Record<string, CandidateTune>>;

interface SourceNote {
  readonly offset: number;
  readonly value: string;
}

interface RenderedQinding {
  readonly text: string;
  readonly notes: ReadonlyMap<number, ReadonlyArray<string>>;
}

interface PatternSourceLine {
  readonly example: string;
  readonly tones: string;
  readonly punctuation: string;
}

interface PatternSourceSection {
  readonly name: string;
  readonly lines: ReadonlyArray<PatternSourceLine>;
}

const patternIds: Readonly<Record<string, string>> = {
  浣溪沙: 'huan-xi-sha',
  鹧鸪天: 'zhe-gu-tian',
  菩萨蛮: 'pu-sa-man',
  蝶恋花: 'die-lian-hua',
  临江仙: 'lin-jiang-xian',
  满江红: 'man-jiang-hong',
  清平乐: 'qing-ping-yue',
  水调歌头: 'shui-diao-ge-tou',
  虞美人: 'yu-mei-ren',
  沁园春: 'qin-yuan-chun',
  念奴娇: 'nian-nu-jiao',
  满庭芳: 'man-ting-fang',
  西江月: 'xi-jiang-yue',
  金缕曲: 'jin-lv-qu',
  点绛唇: 'dian-jiang-chun',
  减字木兰花: 'jian-zi-mu-lan-hua',
  踏莎行: 'ta-suo-xing',
  浪淘沙: 'lang-tao-sha',
  水龙吟: 'shui-long-yin',
  望江南: 'wang-jiang-nan',
  如梦令: 'ru-meng-ling',
  南乡子: 'nan-xiang-zi',
  贺新郎: 'he-xin-lang',
  卜算子: 'bu-suan-zi',
  采桑子: 'cai-sang-zi',
  摸鱼儿: 'mo-yu-er',
  忆江南: 'yi-jiang-nan',
  渔家傲: 'yu-jia-ao',
  江城子: 'jiang-cheng-zi',
  鹊桥仙: 'que-qiao-xian',
  忆秦娥: 'yi-qin-e',
  青玉案: 'qing-yu-an',
  苏幕遮: 'su-mu-zhe',
  一剪梅: 'yi-jian-mei',
  声声慢: 'sheng-sheng-man',
  醉花阴: 'zui-hua-yin',
};

const lock = JSON.parse(await readFile(lockPath, 'utf8')) as SourceLock;
const [qindingResponse, cilinResponse, unihanArchive, ccivArchive] = await Promise.all([
  downloadJson<WikiResponse>(lock.sources.qindingCipu.apiUrl),
  downloadJson<WikiResponse>(lock.sources.cilinZhengyun.apiUrl),
  download(lock.sources.unihan.url, lock.sources.unihan.sha256),
  download(lock.sources.cciv.archiveUrl, lock.sources.cciv.sha256),
]);

const qindingPages = qindingResponse.query.pages.toSorted((left, right) =>
  left.title.localeCompare(right.title, 'zh-Hant'),
);
verifyQindingRevisions(qindingPages, lock.sources.qindingCipu.revision);

const cilinRevision = onlyRevision(cilinResponse, Number(lock.sources.cilinZhengyun.revision));
verifyHash(
  new TextEncoder().encode(cilinRevision.slots.main.content),
  lock.sources.cilinZhengyun.contentSha256,
  '《词林正韵》转录内容',
);

const unihanFiles = unzipSync(unihanArchive);
const readingsText = decodeZipFile(unihanFiles, 'Unihan_Readings.txt');
const variantsText = decodeZipFile(unihanFiles, 'Unihan_Variants.txt');
const readings = parseUnihan(readingsText, variantsText);
const matcher = createVariantMatcher(variantsText);

const cilin = parseCilinZhengyun(cilinRevision.slots.main.content, readings);
const renderedQinding = renderQinding(qindingPages, matcher);

const ccivFiles = unzipSync(ccivArchive);
const candidateData = JSON.parse(
  decodeZipFileBySuffix(ccivFiles, '/src/cipai2info.json'),
) as CandidateData;
const patternsResult = compilePatterns(candidateData, renderedQinding, matcher, cilin.characters);

const provenance = {
  generatedAt: lock.retrievedAt,
  qindingCipu: toProvenance(lock.sources.qindingCipu, lock.retrievedAt),
  cilinZhengyun: toProvenance(lock.sources.cilinZhengyun, lock.retrievedAt),
  unihan: toProvenance(lock.sources.unihan, lock.retrievedAt),
  cciv: toProvenance(lock.sources.cciv, lock.retrievedAt),
};

const patternsOutput = {
  schemaVersion: 1,
  dataVersion: `${lock.retrievedAt}.qinding-cipu`,
  provenance: [provenance.qindingCipu, provenance.cciv],
  patterns: patternsResult.patterns,
};
const patternsReport = {
  generatedAt: lock.retrievedAt,
  candidateTunes: Object.keys(candidateData).length,
  candidateVariants: Object.values(candidateData).reduce(
    (sum, tune) => sum + tune.qinding_templates.length,
    0,
  ),
  importedTunes: new Set(patternsResult.patterns.map(({ name }) => name)).size,
  importedVariants: patternsResult.patterns.length,
  validatedVariants: patternsResult.patterns.filter(
    ({ reviewStatus }) => reviewStatus === 'imported',
  ).length,
  draftVariants: patternsResult.patterns.filter(({ reviewStatus }) => reviewStatus === 'draft')
    .length,
  importedStandardPatterns: patternsResult.patterns.filter(({ variant }) => variant === '正体')
    .length,
  retainedWithIssues: patternsResult.retainedWithIssues,
  rejected: patternsResult.rejected,
};
const rhymeOutput = {
  schemaVersion: 1,
  dataVersion: `${lock.retrievedAt}.cilin-zhengyun`,
  provenance: [provenance.cilinZhengyun, provenance.unihan],
  groups: cilin.groups,
  characters: cilin.characters,
};
const readingsOutput = {
  schemaVersion: 1,
  dataVersion: 'Unicode-17.0.0',
  provenance: [provenance.unihan],
  characters: readings,
};
const prosodyReport = {
  generatedAt: lock.retrievedAt,
  rhymeGroups: cilin.groups.length,
  rhymeSections: cilin.groups.reduce((sum, group) => sum + group.sections.length, 0),
  rhymeCharacters: Object.keys(cilin.characters).length,
  readingCharacters: Object.keys(readings).length,
};

await emit(patternsPath, pretty(patternsOutput));
await emit(patternsReportPath, pretty(patternsReport));
await emit(rhymePath, pretty(rhymeOutput));
await emit(readingsPath, `${JSON.stringify(readingsOutput)}\n`);
await emit(prosodyReportPath, pretty(prosodyReport));

process.stdout.write(
  [
    `词谱：${patternsReport.importedTunes} 个常用词牌，${patternsResult.patterns.length} 体（候选 ${patternsReport.candidateVariants} 体）`,
    `词林正韵：${prosodyReport.rhymeGroups} 部，${prosodyReport.rhymeCharacters} 个字形`,
    `Unihan：${prosodyReport.readingCharacters} 个汉字读音记录`,
    checkOnly ? '生成数据与锁定来源一致。' : '权威数据导入完成。',
  ].join('\n') + '\n',
);

function toProvenance(source: SourceDefinition, retrievedAt: string) {
  return {
    sourceId: source.title.includes('Unihan')
      ? 'unicode-unihan'
      : source.title.includes('CCiV')
        ? 'cciv'
        : source.title.includes('词林')
          ? 'wikisource-cilin-zhengyun'
          : 'wikisource-qinding-cipu',
    title: source.title,
    url: source.url,
    revision: source.revision,
    license: source.license,
    retrievedAt,
  };
}

async function downloadJson<T>(url: string | undefined): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await download(url))) as T;
}

async function download(url: string | undefined, expectedHash?: string): Promise<Uint8Array> {
  if (url === undefined) {
    throw new Error('数据源缺少下载地址');
  }

  const response = await fetch(url, {
    headers: {
      'user-agent': 'PoesyGen authoritative data importer',
    },
  });
  if (!response.ok) {
    throw new Error(`下载失败 ${response.status}: ${url}`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  verifyHash(data, expectedHash, url);
  return data;
}

function verifyHash(data: Uint8Array, expectedHash: string | undefined, label: string): void {
  if (expectedHash === undefined) {
    return;
  }
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expectedHash) {
    throw new Error(`${label} SHA-256 不匹配：期望 ${expectedHash}，实际 ${actual}`);
  }
}

function verifyQindingRevisions(
  pages: ReadonlyArray<WikiPage>,
  expectedRevisionList: string,
): void {
  const actual = pages
    .map((page) => page.revisions[0]?.revid)
    .filter((revision): revision is number => revision !== undefined)
    .toSorted((left, right) => left - right);
  const expected = expectedRevisionList
    .split(',')
    .map(Number)
    .toSorted((left, right) => left - right);
  if (actual.length !== 40 || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('《御定词谱》40卷修订号与锁文件不一致');
  }
}

function onlyRevision(response: WikiResponse, expectedRevision: number): WikiRevision {
  const revisions = response.query.pages.flatMap((page) => page.revisions);
  if (revisions.length !== 1 || revisions[0]?.revid !== expectedRevision) {
    throw new Error(`维基文库修订不匹配，期望 ${expectedRevision}`);
  }
  return revisions[0];
}

function decodeZipFile(files: Readonly<Record<string, Uint8Array>>, name: string): string {
  const data = files[name];
  if (data === undefined) {
    throw new Error(`压缩包缺少 ${name}`);
  }
  return new TextDecoder().decode(data);
}

function decodeZipFileBySuffix(
  files: Readonly<Record<string, Uint8Array>>,
  suffix: string,
): string {
  const entry = Object.entries(files).find(([name]) => name.endsWith(suffix));
  if (entry === undefined) {
    throw new Error(`压缩包缺少 *${suffix}`);
  }
  return new TextDecoder().decode(entry[1]);
}

function parseUnihan(
  readingsText: string,
  variantsText: string,
): Readonly<Record<string, UnihanReadingRecord>> {
  const mutable = new Map<
    string,
    {
      mandarin: Set<string>;
      hanyuPinyin: Set<string>;
      xhc1983: Set<string>;
      fanqie: Set<string>;
      tang: Set<string>;
      simplifiedVariants: Set<string>;
      traditionalVariants: Set<string>;
    }
  >();
  const entry = (character: string) => {
    const existing = mutable.get(character);
    if (existing !== undefined) {
      return existing;
    }
    const created = {
      mandarin: new Set<string>(),
      hanyuPinyin: new Set<string>(),
      xhc1983: new Set<string>(),
      fanqie: new Set<string>(),
      tang: new Set<string>(),
      simplifiedVariants: new Set<string>(),
      traditionalVariants: new Set<string>(),
    };
    mutable.set(character, created);
    return created;
  };

  for (const line of readingsText.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [codePoint, property, value] = line.trim().split('\t');
    if (codePoint === undefined || property === undefined || value === undefined) continue;
    const record = entry(fromCodePoint(codePoint));

    if (property === 'kMandarin') addWords(record.mandarin, value);
    if (property === 'kHanyuPinyin') addPinyinValues(record.hanyuPinyin, value);
    if (property === 'kXHC1983') addPinyinValues(record.xhc1983, value);
    if (property === 'kFanqie') addWords(record.fanqie, value);
    if (property === 'kTang') addWords(record.tang, value);
  }

  for (const line of variantsText.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [codePoint, property, value] = line.trim().split('\t');
    if (codePoint === undefined || property === undefined || value === undefined) continue;
    if (property !== 'kSimplifiedVariant' && property !== 'kTraditionalVariant') continue;

    const target =
      property === 'kSimplifiedVariant'
        ? entry(fromCodePoint(codePoint)).simplifiedVariants
        : entry(fromCodePoint(codePoint)).traditionalVariants;
    for (const variant of parseCodePoints(value)) target.add(variant);
  }

  return Object.fromEntries(
    [...mutable.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right, 'zh-Hans'))
      .map(([character, record]) => [
        character,
        compactRecord({
          mandarin: sorted(record.mandarin),
          hanyuPinyin: sorted(record.hanyuPinyin),
          xhc1983: sorted(record.xhc1983),
          fanqie: sorted(record.fanqie),
          tang: sorted(record.tang),
          simplifiedVariants: sorted(record.simplifiedVariants),
          traditionalVariants: sorted(record.traditionalVariants),
        }) as UnihanReadingRecord,
      ]),
  );
}

function parseCilinZhengyun(
  source: string,
  readings: Readonly<Record<string, UnihanReadingRecord>>,
) {
  const groups: Array<{
    id: string;
    number: number;
    name: string;
    sections: Array<{
      name: string;
      tone: 'level' | 'oblique';
      characters: string;
    }>;
  }> = [];
  const memberships = new Map<string, CilinMembership[]>();
  let currentGroup:
    | {
        id: string;
        number: number;
        name: string;
        sections: Array<{
          name: string;
          tone: 'level' | 'oblique';
          characters: string;
        }>;
      }
    | undefined;
  let currentTone: 'level' | 'oblique' | undefined;

  for (const line of source.split('\n')) {
    const groupMatch = /^==第([^=]+)部==$/.exec(line.trim());
    if (groupMatch !== null) {
      const number = groups.length + 1;
      currentGroup = {
        id: `cilin-${String(number).padStart(2, '0')}`,
        number,
        name: `第${groupMatch[1]}部`,
        sections: [],
      };
      groups.push(currentGroup);
      continue;
    }

    const toneMatch = /^===([^=]+)===$/.exec(line.trim());
    if (toneMatch !== null) {
      currentTone = toneMatch[1]?.startsWith('平') === true ? 'level' : 'oblique';
      continue;
    }

    const sectionMatch = /^【([^】]+)】(.*)$/.exec(line.trim());
    if (sectionMatch === null || currentGroup === undefined || currentTone === undefined) {
      continue;
    }

    const sectionName = sectionMatch[1]!;
    const characters = extractHanCharacters(
      sectionMatch[2]!
        .replaceAll(/（[^）]*）/gu, '')
        .replaceAll(/\[[^\]]*\]/gu, '')
        .replaceAll(/<[^>]*>/gu, '')
        .replaceAll(/\{\{[^}]*\}\}/gu, ''),
    );
    currentGroup.sections.push({
      name: sectionName,
      tone: currentTone,
      characters: [...new Set(characters)].join(''),
    });

    for (const character of new Set(characters)) {
      const reading = readings[character];
      const membership: CilinMembership = {
        tone: currentTone,
        rhymeGroup: currentGroup.id,
        rhymeGroupName: currentGroup.name,
        section: sectionName,
        ...(reading?.mandarin === undefined ? {} : { mandarin: reading.mandarin }),
        ...(reading?.fanqie === undefined ? {} : { fanqie: reading.fanqie }),
        ...(reading?.tang === undefined ? {} : { tang: reading.tang }),
      };
      addMembership(memberships, character, membership);

      for (const simplified of reading?.simplifiedVariants ?? []) {
        const simplifiedMandarin = readings[simplified]?.mandarin ?? membership.mandarin;
        const simplifiedFanqie = readings[simplified]?.fanqie ?? membership.fanqie;
        const simplifiedTang = readings[simplified]?.tang ?? membership.tang;
        addMembership(memberships, simplified, {
          tone: membership.tone,
          rhymeGroup: membership.rhymeGroup,
          rhymeGroupName: membership.rhymeGroupName,
          section: membership.section,
          ...(simplifiedMandarin === undefined ? {} : { mandarin: simplifiedMandarin }),
          ...(simplifiedFanqie === undefined ? {} : { fanqie: simplifiedFanqie }),
          ...(simplifiedTang === undefined ? {} : { tang: simplifiedTang }),
        });
      }
    }
  }

  if (groups.length !== 19) {
    throw new Error(`《词林正韵》应为十九部，实际解析为 ${groups.length} 部`);
  }

  const characters = Object.fromEntries(
    [...memberships.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right, 'zh-Hans'))
      .map(([character, values]) => [
        character,
        values.toSorted((left, right) =>
          `${left.rhymeGroup}:${left.tone}:${left.section}`.localeCompare(
            `${right.rhymeGroup}:${right.tone}:${right.section}`,
          ),
        ),
      ]),
  );
  return { groups, characters };
}

function addMembership(
  memberships: Map<string, CilinMembership[]>,
  character: string,
  membership: CilinMembership,
): void {
  const existing = memberships.get(character) ?? [];
  if (
    existing.some(
      (candidate) =>
        candidate.tone === membership.tone &&
        candidate.rhymeGroup === membership.rhymeGroup &&
        candidate.section === membership.section,
    )
  ) {
    return;
  }
  existing.push(membership);
  memberships.set(character, existing);
}

function createVariantMatcher(variantsText: string) {
  const parents = new Map<string, string>();
  const find = (character: string): string => {
    const parent = parents.get(character);
    if (parent === undefined) {
      parents.set(character, character);
      return character;
    }
    if (parent === character) return character;
    const root = find(parent);
    parents.set(character, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot.codePointAt(0)! < rightRoot.codePointAt(0)!) parents.set(rightRoot, leftRoot);
    else parents.set(leftRoot, rightRoot);
  };
  const accepted = new Set([
    'kSimplifiedVariant',
    'kTraditionalVariant',
    'kSemanticVariant',
    'kSpecializedSemanticVariant',
    'kZVariant',
  ]);

  for (const line of variantsText.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [codePoint, property, value] = line.trim().split('\t');
    if (
      codePoint === undefined ||
      property === undefined ||
      value === undefined ||
      !accepted.has(property)
    ) {
      continue;
    }
    const character = fromCodePoint(codePoint);
    for (const variant of parseCodePoints(value)) union(character, variant);
  }

  // The Siku transcription uses this historical glyph, which Unihan 17.0
  // does not connect to its modern semantic equivalent.
  union('䕃', '蔭');

  return {
    normalize(value: string): string {
      return extractHanCharacters(value)
        .map((character) => find(character))
        .join('');
    },
  };
}

function renderQinding(
  pages: ReadonlyArray<WikiPage>,
  matcher: ReturnType<typeof createVariantMatcher>,
): RenderedQinding {
  const source = pages.map((page) => page.revisions[0]!.slots.main.content).join('\n');
  const token = /\{\{(SK anchor|SK notes)\|([^{}]*)\}\}/gu;
  const chunks: string[] = [];
  const sourceNotes: SourceNote[] = [];
  let sourceOffset = 0;
  let outputOffset = 0;

  for (const match of source.matchAll(token)) {
    const index = match.index;
    if (index === undefined) continue;
    const plain = matcher.normalize(source.slice(sourceOffset, index));
    chunks.push(plain);
    outputOffset += plain.length;

    if (match[1] === 'SK anchor') {
      const anchor = matcher.normalize(match[2] ?? '');
      chunks.push(anchor);
      outputOffset += anchor.length;
    } else {
      sourceNotes.push({ offset: outputOffset, value: match[2] ?? '' });
    }
    sourceOffset = index + match[0].length;
  }
  chunks.push(matcher.normalize(source.slice(sourceOffset)));

  const notes = new Map<number, string[]>();
  for (const note of sourceNotes) {
    const atOffset = notes.get(note.offset) ?? [];
    atOffset.push(note.value);
    notes.set(note.offset, atOffset);
  }

  return { text: chunks.join(''), notes };
}

function compilePatterns(
  data: CandidateData,
  qinding: RenderedQinding,
  matcher: ReturnType<typeof createVariantMatcher>,
  cilin: Readonly<Record<string, ReadonlyArray<CilinMembership>>>,
) {
  const patterns: Array<{
    readonly id: string;
    readonly name: string;
    readonly variant: string;
    readonly reviewStatus: 'draft' | 'imported';
    readonly [key: string]: unknown;
  }> = [];
  const retainedWithIssues: Array<{
    name: string;
    variant: string;
    id: string;
    issues: ReadonlyArray<string>;
  }> = [];
  const rejected: Array<{ name: string; variant?: string; reason: string }> = [];

  for (const [name, tune] of Object.entries(data)) {
    const idPrefix = patternIds[name];
    if (idPrefix === undefined || tune.qinding_templates.length === 0) {
      rejected.push({ name, reason: '缺少稳定 ID 或正体模板' });
      continue;
    }

    for (const [variantIndex, candidate] of tune.qinding_templates.entries()) {
      const variant = variantIndex === 0 ? '正体' : candidate.name;
      const patternId =
        variantIndex === 0
          ? `${idPrefix}-standard`
          : `${idPrefix}-variant-${String(variantIndex + 1).padStart(2, '0')}`;

      try {
        const sourceSections = splitPatternSections(
          candidate.example,
          candidate.template,
          candidate.gelv,
        );
        const flattenedExamples = sourceSections.flatMap((section) =>
          section.lines.map((line) => line.example),
        );
        const issues: string[] = [];
        const sourceMatch = (() => {
          try {
            return alignExampleToQinding(flattenedExamples, qinding, matcher);
          } catch {
            return {
              editDistance: -1,
              markerCount: 0,
              markers: flattenedExamples.map(() => ''),
            };
          }
        })();
        if (sourceMatch.editDistance < 0) {
          issues.push('例词未能逐句回查《御定词谱》');
        }
        const expectedRhymes = parseExpectedRhymeCount(candidate.gelv);
        let rhymeMarkers: ReadonlyArray<boolean> = sourceMatch.markers.map(isRhymeMarker);

        if (rhymeMarkers.filter(Boolean).length !== expectedRhymes) {
          const inferredRhymes = inferRhymeMarkers(
            sourceSections,
            candidate.gelv,
            cilin,
            variantIndex === 0 ? idPrefix : patternId,
          );
          rhymeMarkers = inferredRhymes.markers;
          issues.push(...inferredRhymes.issues);
        }
        if (rhymeMarkers.filter(Boolean).length !== expectedRhymes) {
          issues.push(
            `韵位数量不匹配：词谱记载 ${expectedRhymes}，解析为 ${rhymeMarkers.filter(Boolean).length}`,
          );
        }

        const rhymeLabels = createRhymeLabels(
          sourceMatch.markers,
          rhymeMarkers,
          sourceSections.flatMap((section) => section.lines),
          cilin,
        );
        const totalCharacters = sourceSections
          .flatMap((section) => section.lines)
          .reduce((sum, line) => sum + Array.from(line.tones).length, 0);
        try {
          const declaredCharacters = parseDeclaredCharacterCount(candidate.gelv);
          if (totalCharacters !== declaredCharacters) {
            issues.push(`总字数应为 ${declaredCharacters}，模板实际为 ${totalCharacters}`);
          }
        } catch (error) {
          issues.push(error instanceof Error ? error.message : String(error));
        }

        let flatIndex = 0;
        const sections = sourceSections.map((section, sectionIndex) => ({
          id: sourceSections.length === 1 ? 'single-stanza' : `stanza-${sectionIndex + 1}`,
          name: section.name,
          lines: section.lines.map((line, lineIndex) => {
            if (Array.from(line.example).length !== Array.from(line.tones).length) {
              throw new Error(`例词与平仄模板字数不同：${line.example}`);
            }
            const positions = Array.from(line.tones).map((toneMarker, characterIndex, tones) => {
              const tone =
                toneMarker === '平' ? 'level' : toneMarker === '仄' ? 'oblique' : 'either';
              const rhyme =
                characterIndex === tones.length - 1 ? rhymeLabels[flatIndex] : undefined;
              return compactRecord({
                tone,
                rhyme,
                rhymeTone: rhyme === undefined ? undefined : tone,
              });
            });
            flatIndex += 1;
            return {
              id: `line-${sectionIndex + 1}-${lineIndex + 1}`,
              positions,
              punctuation: line.punctuation,
            };
          }),
        }));

        const reviewStatus = issues.length === 0 ? 'imported' : 'draft';
        patterns.push({
          id: patternId,
          name,
          variant,
          source: `《御定词谱》；CCiV 结构化转录 ${lock.sources.cciv.revision.slice(0, 12)}`,
          dataVersion: `${lock.retrievedAt}.qinding-cipu`,
          reviewStatus,
          provenance: [
            toProvenance(lock.sources.qindingCipu, lock.retrievedAt),
            toProvenance(lock.sources.cciv, lock.retrievedAt),
          ],
          example: {
            author: candidate.poet,
            lines: flattenedExamples,
          },
          description: tune.qinding_desc,
          specification: candidate.gelv,
          sourceValidation: compactRecord({
            status: issues.length === 0 ? 'validated' : 'unverified',
            editDistance: sourceMatch.editDistance,
            matchedMarkers: sourceMatch.markers.filter((marker) => marker !== '').length,
            issues,
          }),
          sections,
        });
        if (issues.length > 0) {
          retainedWithIssues.push({
            name,
            variant,
            id: patternId,
            issues,
          });
        }
      } catch (error) {
        rejected.push({
          name,
          variant,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const importedTunes = new Set(patterns.map(({ name }) => name));
  const missingStandards = Object.keys(patternIds).filter(
    (name) => !patterns.some((pattern) => pattern.name === name && pattern.variant === '正体'),
  );
  if (importedTunes.size < 30 || missingStandards.length > 0) {
    throw new Error(
      `词谱导入仅成功 ${importedTunes.size} 个词牌，缺失正体 ${missingStandards.join('、') || '无'}：\n${rejected
        .map(
          ({ name, variant, reason }) =>
            `${name}${variant === undefined ? '' : `·${variant}`}: ${reason}`,
        )
        .join('\n')}`,
    );
  }
  return { patterns, retainedWithIssues, rejected };
}

function splitPatternSections(
  example: string,
  template: string,
  specification: string,
): ReadonlyArray<PatternSourceSection> {
  const exampleBlocks = example.split('\n');
  const templateBlocks = template.split('\n');
  if (exampleBlocks.length !== templateBlocks.length || exampleBlocks.length === 0) {
    throw new Error('例词和模板分块不一致');
  }

  const conciseSpecification = specification.trim();
  const sectionCount = conciseSpecification.startsWith('单调')
    ? 1
    : conciseSpecification.startsWith('双调')
      ? 2
      : undefined;
  if (sectionCount === undefined) {
    throw new Error(`无法解析词牌调式：${specification}`);
  }
  if (exampleBlocks.length % sectionCount !== 0) {
    throw new Error(
      `${conciseSpecification.slice(0, 2)}模板无法平均分为 ${sectionCount} 段：共 ${exampleBlocks.length} 个排版块`,
    );
  }

  const blocksPerSection = exampleBlocks.length / sectionCount;
  const sections: PatternSourceSection[] = [];

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const sectionLines: PatternSourceLine[] = [];
    for (let blockIndex = 0; blockIndex < blocksPerSection; blockIndex += 1) {
      const sourceBlockIndex = sectionIndex * blocksPerSection + blockIndex;
      const examples = exampleBlocks[sourceBlockIndex]!.split(/\t+/u).filter(Boolean);
      const tones = templateBlocks[sourceBlockIndex]!.split(/\t+/u).filter(Boolean);
      if (examples.length !== tones.length) throw new Error('例词与模板句数不一致');

      examples.forEach((line, lineIndex) => {
        sectionLines.push({
          example: line,
          tones: tones[lineIndex]!,
          punctuation: lineIndex === examples.length - 1 ? '。' : '，',
        });
      });
    }
    const lines =
      sectionCount === 1
        ? sectionLines.map((line, lineIndex) => ({
            ...line,
            punctuation: lineIndex === sectionLines.length - 1 ? '。' : '，',
          }))
        : sectionLines;
    sections.push({
      name: sectionCount === 1 ? '单调' : sectionIndex === 0 ? '上阕' : '下阕',
      lines,
    });
  }
  return sections;
}

function alignExampleToQinding(
  phrases: ReadonlyArray<string>,
  qinding: RenderedQinding,
  matcher: ReturnType<typeof createVariantMatcher>,
) {
  const normalized = phrases.map((phrase) => matcher.normalize(phrase));
  const first = normalized[0];
  if (first === undefined) throw new Error('例词为空');

  const candidates = findApproximateStarts(qinding.text, first);
  let best:
    | {
        editDistance: number;
        markers: string[];
        markerCount: number;
      }
    | undefined;

  for (const start of candidates) {
    let offset = start;
    let editDistance = 0;
    const markers: string[] = [];
    for (const phrase of normalized) {
      const aligned = bestPrefix(qinding.text, phrase, offset);
      editDistance += aligned.distance;
      offset += aligned.length;
      markers.push(nearestNote(qinding.notes, offset));
    }
    const candidate = {
      editDistance,
      markers,
      markerCount: markers.filter((marker) => marker !== '').length,
    };
    if (
      best === undefined ||
      candidate.editDistance < best.editDistance ||
      (candidate.editDistance === best.editDistance && candidate.markerCount > best.markerCount)
    ) {
      best = candidate;
    }
  }

  const totalCharacters = normalized.reduce((sum, phrase) => sum + phrase.length, 0);
  const maxDistance = Math.max(8, Math.ceil(totalCharacters * 0.12));
  if (best === undefined || best.editDistance > maxDistance) {
    throw new Error(`例词无法可靠回查《御定词谱》（最大编辑距离 ${maxDistance}）`);
  }
  return best;
}

function findApproximateStarts(text: string, target: string): ReadonlyArray<number> {
  const exact: number[] = [];
  for (let from = 0; ;) {
    const index = text.indexOf(target, from);
    if (index < 0) break;
    exact.push(index);
    from = index + 1;
  }
  if (exact.length > 0) return exact;

  for (const prefixLength of [Math.min(4, target.length), Math.min(3, target.length), 2]) {
    const prefix = target.slice(0, prefixLength);
    const candidates: number[] = [];
    for (let from = 0; candidates.length < 200;) {
      const index = text.indexOf(prefix, from);
      if (index < 0) break;
      if (levenshtein(target, text.slice(index, index + target.length)) <= 2) {
        candidates.push(index);
      }
      from = index + 1;
    }
    if (candidates.length > 0) return candidates;
  }
  return [];
}

function bestPrefix(text: string, target: string, offset: number) {
  let best: { distance: number; length: number } | undefined;
  for (let difference = -2; difference <= 2; difference += 1) {
    const length = target.length + difference;
    if (length < 1) continue;
    const distance = levenshtein(target, text.slice(offset, offset + length));
    if (
      best === undefined ||
      distance < best.distance ||
      (distance === best.distance && Math.abs(difference) < Math.abs(best.length - target.length))
    ) {
      best = { distance, length };
    }
  }
  return best!;
}

function nearestNote(notes: ReadonlyMap<number, ReadonlyArray<string>>, offset: number): string {
  for (const difference of [0, -1, 1, -2, 2]) {
    const values = notes.get(offset + difference);
    if (values !== undefined) return values[0] ?? '';
  }
  return '';
}

function isRhymeMarker(marker: string): boolean {
  const prefix = marker.slice(0, 8);
  return (
    /^(?:[一二三四五六七八九十]*換)?(?:平|仄)?韻/u.test(prefix) ||
    /^(?:叶|疊)/u.test(prefix) ||
    /^[^，。]{0,4}韻/u.test(prefix)
  );
}

function createRhymeLabels(
  sourceMarkers: ReadonlyArray<string>,
  rhymeMarkers: ReadonlyArray<boolean>,
  lines: ReadonlyArray<PatternSourceLine>,
  cilin: Readonly<Record<string, ReadonlyArray<CilinMembership>>>,
): ReadonlyArray<string | undefined> {
  const labels: Array<string | undefined> = [];
  let currentLabel: string | undefined;
  let currentTone: 'level' | 'oblique' | undefined;
  let labelNumber = 0;

  rhymeMarkers.forEach((isRhyme, index) => {
    if (!isRhyme) {
      labels.push(undefined);
      return;
    }

    const marker = sourceMarkers[index] ?? '';
    const line = lines[index]!;
    const ending = Array.from(line.example).at(-1)!;
    const requiredTone =
      Array.from(line.tones).at(-1) === '平'
        ? 'level'
        : Array.from(line.tones).at(-1) === '仄'
          ? 'oblique'
          : undefined;
    const explicitTone = marker.includes('平韻')
      ? 'level'
      : marker.includes('仄韻')
        ? 'oblique'
        : requiredTone;
    const changed =
      marker.includes('換') ||
      currentLabel === undefined ||
      (explicitTone !== undefined &&
        currentTone !== undefined &&
        explicitTone !== currentTone &&
        !marker.startsWith('叶'));

    if (changed) {
      labelNumber += 1;
      const membership = (cilin[ending] ?? []).find(
        ({ tone }) => explicitTone === undefined || tone === explicitTone,
      );
      currentLabel = membership?.rhymeGroup
        ? `rhyme-${labelNumber}-${membership.rhymeGroup}`
        : `rhyme-${labelNumber}`;
    }
    currentTone = explicitTone ?? currentTone;
    labels.push(currentLabel);
  });
  return labels;
}

function inferRhymeMarkers(
  sections: ReadonlyArray<PatternSourceSection>,
  specification: string,
  cilin: Readonly<Record<string, ReadonlyArray<CilinMembership>>>,
  patternId: string,
): {
  markers: ReadonlyArray<boolean>;
  issues: ReadonlyArray<string>;
} {
  const manual: Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>> = {
    'nian-nu-jiao': [
      [2, 4, 7, 9],
      [2, 4, 7, 9],
    ],
    'shui-long-yin': [
      [1, 4, 7, 11],
      [0, 2, 5, 8, 11],
    ],
  };
  const overrides = manual[patternId];
  if (overrides !== undefined) {
    return {
      markers: sections.flatMap((section, sectionIndex) =>
        section.lines.map((_, lineIndex) => overrides[sectionIndex]?.includes(lineIndex) === true),
      ),
      issues: [],
    };
  }

  const issues: string[] = [];
  const sectionSpecs = parseSectionRhymeSpecifications(specification, sections.length);
  const markers = sections.flatMap((section, sectionIndex) => {
    const requirements = parseToneRequirements(sectionSpecs[sectionIndex] ?? '');
    const needed = requirements.level + requirements.oblique;
    const candidates: Array<{
      indices: ReadonlyArray<number>;
      tones: ReadonlyArray<'level' | 'oblique'>;
      score: number;
    }> = [];

    for (const indices of combinations(section.lines.length, needed)) {
      const toneOptions = indices.map((index) => {
        const line = section.lines[index]!;
        const marker = Array.from(line.tones).at(-1);
        const ending = Array.from(line.example).at(-1)!;
        const known = new Set((cilin[ending] ?? []).map(({ tone }) => tone));
        const allowed =
          marker === '平'
            ? new Set<'level' | 'oblique'>(['level'])
            : marker === '仄'
              ? new Set<'level' | 'oblique'>(['oblique'])
              : new Set<'level' | 'oblique'>(['level', 'oblique']);
        const intersection = [...allowed].filter((tone) => known.size === 0 || known.has(tone));
        return intersection.length === 0 ? [...allowed] : intersection;
      });

      for (const tones of cartesian(toneOptions)) {
        const counts = {
          level: tones.filter((tone) => tone === 'level').length,
          oblique: tones.filter((tone) => tone === 'oblique').length,
        };
        if (counts.level !== requirements.level || counts.oblique !== requirements.oblique) {
          continue;
        }

        let score = 0;
        for (const tone of ['level', 'oblique'] as const) {
          const groupCounts = new Map<string, number>();
          indices.forEach((lineIndex, candidateIndex) => {
            if (tones[candidateIndex] !== tone) return;
            const ending = Array.from(section.lines[lineIndex]!.example).at(-1)!;
            for (const membership of cilin[ending] ?? []) {
              if (membership.tone !== tone) continue;
              groupCounts.set(
                membership.rhymeGroup,
                (groupCounts.get(membership.rhymeGroup) ?? 0) + 1,
              );
            }
          });
          score += Math.max(0, ...groupCounts.values()) * 100 - groupCounts.size * 2;
        }
        candidates.push({ indices, tones, score });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const best = candidates[0];
    const tied = candidates.filter(({ score }) => score === best?.score);
    if (best === undefined) {
      issues.push(`无法推定 ${section.name} 韵位`);
      return section.lines.map(() => false);
    }
    if (tied.length !== 1) {
      issues.push(`无法唯一推定 ${section.name} 韵位`);
    }
    return section.lines.map((_, lineIndex) => best.indices.includes(lineIndex));
  });
  return { markers, issues };
}

function parseSectionRhymeSpecifications(
  specification: string,
  sectionCount: number,
): ReadonlyArray<string> {
  const concise = specification.split('。')[0]!;
  if (sectionCount === 1) {
    const match = /句[、，]?(.+)$/u.exec(concise);
    return [match?.[1] ?? ''];
  }
  if (concise.includes('前后段各')) {
    const match = /前后段各.*?句[、，](.+)$/u.exec(concise);
    return [match?.[1] ?? '', match?.[1] ?? ''];
  }
  const match = /前段.*?句([^，]*)，后段.*?句(.+)$/u.exec(concise);
  return [match?.[1] ?? '', match?.[2] ?? ''];
}

function parseToneRequirements(specification: string) {
  let level = 0;
  let oblique = 0;
  let leaf = 0;
  let repeated = 0;
  for (const match of specification.matchAll(
    /([一二两三四五六七八九十]+)(平韵|仄韵|叶韵|叠韵)/gu,
  )) {
    const count = chineseNumber(match[1]!);
    if (match[2] === '平韵') level += count;
    if (match[2] === '仄韵') oblique += count;
    if (match[2] === '叶韵') leaf += count;
    if (match[2] === '叠韵') repeated += count;
  }
  if (leaf > 0) {
    if (level > 0 && oblique === 0) oblique += leaf;
    else if (oblique > 0 && level === 0) level += leaf;
  }
  if (repeated > 0) {
    if (level > 0 && oblique === 0) level += repeated;
    else if (oblique > 0 && level === 0) oblique += repeated;
  }
  return { level, oblique };
}

function parseExpectedRhymeCount(specification: string): number {
  const count = [
    ...specification.matchAll(/([一二两三四五六七八九十]+)(?:平|仄|叶|叠)韵/gu),
  ].reduce((sum, match) => sum + chineseNumber(match[1]!), 0);
  return specification.includes('前后段各') ? count * 2 : count;
}

function parseDeclaredCharacterCount(specification: string): number {
  const match = /调([一二两三四五六七八九十百]+)字/u.exec(specification);
  if (match === null) throw new Error(`无法解析词牌字数：${specification}`);
  return chineseNumber(match[1]!);
}

function chineseNumber(value: string): number {
  const digits: Readonly<Record<string, number>> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === '十') return 10;
  if (value === '百') return 100;
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === '百') {
      total += (current || 1) * 100;
      current = 0;
    } else if (character === '十') {
      total += (current || 1) * 10;
      current = 0;
    } else {
      current = digits[character] ?? 0;
    }
  }
  return total + current;
}

function combinations(length: number, size: number): ReadonlyArray<ReadonlyArray<number>> {
  const result: number[][] = [];
  const visit = (start: number, current: number[]): void => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < length; index += 1) {
      current.push(index);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

function cartesian<T>(values: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<ReadonlyArray<T>> {
  return values.reduce<ReadonlyArray<ReadonlyArray<T>>>(
    (products, options) =>
      products.flatMap((product) => options.map((option) => [...product, option])),
    [[]],
  );
}

function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current.push(
        Math.min(
          current[rightIndex - 1]! + 1,
          previous[rightIndex]! + 1,
          previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

function fromCodePoint(value: string): string {
  return String.fromCodePoint(Number.parseInt(value.slice(2), 16));
}

function parseCodePoints(value: string): ReadonlyArray<string> {
  return [...value.matchAll(/U\+([0-9A-F]+)/gu)].map((match) =>
    String.fromCodePoint(Number.parseInt(match[1]!, 16)),
  );
}

function extractHanCharacters(value: string): string[] {
  return value.match(/\p{Script=Han}/gu) ?? [];
}

function addWords(target: Set<string>, value: string): void {
  for (const word of value.split(/\s+/u)) {
    if (word !== '') target.add(word);
  }
}

function addPinyinValues(target: Set<string>, value: string): void {
  for (const match of value.matchAll(/:(?:\s*)([a-züêāáǎàēéěèīíǐìōóǒòūúǔǜǘǚǜńňǹḿ,\s]+)/giu)) {
    for (const reading of (match[1] ?? '').split(/[,\s]+/u)) {
      if (reading !== '') target.add(reading);
    }
  }
}

function sorted(values: ReadonlySet<string>): ReadonlyArray<string> | undefined {
  return values.size === 0 ? undefined : [...values].toSorted();
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && (!Array.isArray(entry) || entry.length > 0),
    ),
  ) as T;
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function emit(path: string, content: string): Promise<void> {
  if (checkOnly) {
    const existing = await readFile(path, 'utf8').catch(() => undefined);
    if (existing !== content) {
      throw new Error(`生成数据已过期：${path}`);
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
