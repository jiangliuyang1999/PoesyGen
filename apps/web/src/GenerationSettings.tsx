import { useEffect, useRef } from 'react';

import type { CiPattern, GenerationResult } from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';
import { compatibleRhymeGroups, displayRhymeLabel, patternRhymeLabels } from './model.js';

export type SubmissionProgressStage =
  | 'preparing'
  | 'loading'
  | 'parsing'
  | 'planning'
  | 'drafting'
  | 'validating'
  | 'evaluating'
  | 'optimizing'
  | 'completed'
  | 'error';

export interface SubmissionProgressEntry {
  readonly stage: SubmissionProgressStage;
  readonly stepId?: string;
  readonly activity?: 'started' | 'completed';
  readonly message: string;
  readonly round?: number;
  readonly maxRounds?: number;
  readonly issueCount?: number;
  readonly elapsedMs?: number;
}

export interface SubmissionStatus {
  readonly kind: 'idle' | 'loading' | 'running' | 'completed' | 'error';
  readonly message: string;
  readonly result?: GenerationResult;
  readonly progress?: ReadonlyArray<SubmissionProgressEntry>;
  readonly progressTarget?: 'settings' | 'refinement';
}

export function isSubmissionInProgress(status: SubmissionStatus): boolean {
  return status.kind === 'loading' || status.kind === 'running';
}

interface GenerationSettingsProps {
  readonly rounds: number;
  readonly requirements: string;
  readonly status: SubmissionStatus;
  readonly canSubmit: boolean;
  readonly onRoundsChange: (rounds: number) => void;
  readonly onRequirementsChange: (requirements: string) => void;
}

interface RhymeSettingsProps {
  readonly pattern: CiPattern;
  readonly rhymeGroups: ReadonlyArray<RhymeGroupSummary>;
  readonly rhymeAssignments: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly onChange: (label: string, groupId: string) => void;
}

export function RhymeSettings({
  pattern,
  rhymeGroups,
  rhymeAssignments,
  disabled,
  onChange,
}: RhymeSettingsProps) {
  const rhymeLabels = patternRhymeLabels(pattern);

  return (
    <div className="creation-rhyme-settings" aria-label="韵部设置">
      <div className="rhyme-selects">
        {rhymeLabels.map((label, index) => {
          const previousLabel = rhymeLabels[index - 1];
          const previousGroupId =
            previousLabel === undefined ? undefined : rhymeAssignments[previousLabel.id];
          return (
            <label key={label.id}>
              <span>{displayRhymeLabel(label, index)}</span>
              <select
                value={rhymeAssignments[label.id] ?? ''}
                disabled={disabled}
                onChange={(event) => onChange(label.id, event.target.value)}
              >
                <option value="">自动择韵</option>
                {compatibleRhymeGroups(rhymeGroups, label.tone).map((group) => (
                  <option key={group.id} value={group.id} disabled={group.id === previousGroupId}>
                    {group.name} · {group.sections.map(({ name }) => name).join('、')}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function GenerationSettings({
  rounds,
  requirements,
  status,
  canSubmit,
  onRoundsChange,
  onRequirementsChange,
}: GenerationSettingsProps) {
  const disabled = isSubmissionInProgress(status);

  return (
    <aside className="generation-settings" aria-labelledby="settings-title">
      <div className="settings-heading">
        <span className="creation-step">03</span>
        <h2 className="creation-panel-title" id="settings-title">
          生成设置
        </h2>
      </div>

      <div className="setting-block setting-rounds">
        <label className="setting-label" htmlFor="rounds">
          <span>
            最大优化轮数 <strong>{rounds}</strong>
          </span>
          {/* <small>达到格律要求后会提前结束</small> */}
        </label>
        <input
          id="rounds"
          className="rounds-range"
          type="range"
          min="1"
          max="20"
          value={rounds}
          disabled={disabled}
          onChange={(event) => onRoundsChange(Number(event.target.value))}
        />
        <div className="range-labels" aria-hidden="true">
          <span>1</span>
          <span>20</span>
        </div>
      </div>

      <div className="setting-block setting-requirements">
        <label className="setting-label" htmlFor="requirements">
          <span>附加要求</span>
          {/* <small>每行一条，最多 20 条</small> */}
        </label>
        <textarea
          id="requirements"
          value={requirements}
          disabled={disabled}
          onChange={(event) => onRequirementsChange(event.target.value)}
          rows={2}
          placeholder={'避免直白抒情\n使用江南意象'}
        />
      </div>

      <div className="settings-action">
        <button className="primary-action" type="submit" disabled={!canSubmit || disabled}>
          <span>{disabled ? '正在生成' : '开始生成'}</span>
          <span aria-hidden="true">→</span>
        </button>

        {status.progressTarget !== 'refinement' && <SubmissionNotice status={status} />}
      </div>
    </aside>
  );
}

function SubmissionNotice({ status }: { readonly status: SubmissionStatus }) {
  const progress = status.progress ?? [];
  if (status.kind === 'idle') {
    return null;
  }
  return (
    <div className="submission-notice" data-kind={status.kind} role="status">
      <strong>
        {status.kind === 'completed'
          ? '词作已完成'
          : status.kind === 'running'
            ? '正在创作'
            : status.kind === 'error'
              ? '生成失败'
              : '正在准备生成'}
      </strong>
      <p>{status.message}</p>
      {progress.length > 0 && (
        <GenerationProgress entries={progress} statusKind={status.kind} ariaLabel="生成进度" />
      )}
    </div>
  );
}

interface GenerationProgressProps {
  readonly entries: ReadonlyArray<SubmissionProgressEntry>;
  readonly statusKind: SubmissionStatus['kind'];
  readonly ariaLabel: string;
}

export function GenerationProgress({ entries, statusKind, ariaLabel }: GenerationProgressProps) {
  const latestProgressItem = useRef<HTMLLIElement>(null);
  const latestMessage = entries.at(-1)?.message;
  useEffect(() => {
    if (statusKind !== 'loading' && statusKind !== 'running') return;
    latestProgressItem.current?.scrollIntoView?.({ block: 'nearest' });
  }, [entries.length, latestMessage, statusKind]);

  return (
    <ol className="generation-progress" aria-label={ariaLabel}>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        const state =
          last && statusKind === 'error'
            ? 'error'
            : last && (statusKind === 'loading' || statusKind === 'running')
              ? 'active'
              : 'completed';
        return (
          <li
            data-state={state}
            key={entry.stepId ?? `${entry.stage}-${entry.round ?? 0}-${index}`}
            {...(last ? { ref: latestProgressItem } : {})}
            {...(state === 'active' ? { 'aria-current': 'step' as const } : {})}
          >
            <i aria-hidden="true" />
            <div>
              <span>
                <b>{progressStageLabel(entry.stage)}</b>
                {entry.round !== undefined && entry.maxRounds !== undefined && (
                  <small>
                    {entry.round}/{entry.maxRounds}
                  </small>
                )}
              </span>
              <p>{entry.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function progressStageLabel(stage: SubmissionProgressStage): string {
  if (stage === 'preparing') return '准备';
  if (stage === 'loading') return '加载';
  if (stage === 'parsing') return '解析';
  if (stage === 'planning') return '规划';
  if (stage === 'drafting') return '创作';
  if (stage === 'validating') return '校验';
  if (stage === 'evaluating') return '评价';
  if (stage === 'optimizing') return '优化';
  if (stage === 'completed') return '完成';
  return '失败';
}
