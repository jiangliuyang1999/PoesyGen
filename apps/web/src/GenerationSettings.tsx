import type { CiPattern, GenerationResult } from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';
import { compatibleRhymeGroups, displayRhymeLabel, patternRhymeLabels } from './model.js';

export interface SubmissionStatus {
  readonly kind: 'idle' | 'loading' | 'running' | 'completed' | 'error';
  readonly message: string;
  readonly sessionId?: string;
  readonly result?: GenerationResult;
}

export function isSubmissionInProgress(status: SubmissionStatus): boolean {
  return status.kind === 'loading' || status.kind === 'running';
}

interface GenerationSettingsProps {
  readonly pattern: CiPattern;
  readonly rhymeGroups: ReadonlyArray<RhymeGroupSummary>;
  readonly rhymeAssignments: Readonly<Record<string, string>>;
  readonly rounds: number;
  readonly requirements: string;
  readonly status: SubmissionStatus;
  readonly canSubmit: boolean;
  readonly onRhymeChange: (label: string, groupId: string) => void;
  readonly onRoundsChange: (rounds: number) => void;
  readonly onRequirementsChange: (requirements: string) => void;
}

export function GenerationSettings({
  pattern,
  rhymeGroups,
  rhymeAssignments,
  rounds,
  requirements,
  status,
  canSubmit,
  onRhymeChange,
  onRoundsChange,
  onRequirementsChange,
}: GenerationSettingsProps) {
  const rhymeLabels = patternRhymeLabels(pattern);
  const disabled = isSubmissionInProgress(status);

  return (
    <aside className="generation-settings" aria-labelledby="settings-title">
      <div className="settings-heading">
        <span className="creation-step">02</span>
        <h2 className="creation-panel-title" id="settings-title">
          生成设置
        </h2>
      </div>

      <div className="setting-block setting-rhymes">
        <div className="setting-label">
          <span>韵部</span>
          {/* <small>不指定时由工作流择韵</small> */}
        </div>
        <div className="rhyme-selects">
          {rhymeLabels.map((label, index) => (
            <label key={label.id}>
              <span>{displayRhymeLabel(label, index)}</span>
              <select
                value={rhymeAssignments[label.id] ?? ''}
                disabled={disabled}
                onChange={(event) => onRhymeChange(label.id, event.target.value)}
              >
                <option value="">自动择韵</option>
                {compatibleRhymeGroups(rhymeGroups, label.tone).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.sections.map(({ name }) => name).join('、')}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
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
          rows={4}
          placeholder={'避免直白抒情\n使用江南意象'}
        />
      </div>

      <div className="settings-action">
        <button className="primary-action" type="submit" disabled={!canSubmit || disabled}>
          <span>{disabled ? '正在生成' : '开始生成'}</span>
          <span aria-hidden="true">→</span>
        </button>

        <SubmissionNotice status={status} />
      </div>
    </aside>
  );
}

function SubmissionNotice({ status }: { readonly status: SubmissionStatus }) {
  if (status.kind === 'idle') {
    return <p className="settings-note">配置 LLM 后，生成与格律校验会在当前设备完成。</p>;
  }
  return (
    <div className="submission-notice" data-kind={status.kind} role="status">
      <strong>
        {status.kind === 'completed'
          ? '词作已完成'
          : status.kind === 'running'
            ? '正在优化'
            : status.kind === 'error'
              ? '生成失败'
              : '正在准备生成'}
      </strong>
      <p>{status.message}</p>
      {status.sessionId !== undefined && <code>会话 {status.sessionId}</code>}
    </div>
  );
}
