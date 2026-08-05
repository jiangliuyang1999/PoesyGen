import type { CiPattern, GenerationResult, RhymeGroupSummary } from '@poesygen/client-sdk';

import { compatibleRhymeGroups, displayRhymeLabel, patternRhymeLabels } from './model.js';

export interface SubmissionStatus {
  readonly kind: 'idle' | 'loading' | 'queued' | 'running' | 'completed' | 'error';
  readonly message: string;
  readonly sessionId?: string;
  readonly jobId?: string;
  readonly result?: GenerationResult;
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

  return (
    <aside className="generation-settings" aria-labelledby="settings-title">
      <div className="settings-heading">
        <span className="creation-step">02</span>
        <div>
          <p className="section-kicker">生成设置</p>
          <h2 id="settings-title">约束与优化</h2>
        </div>
      </div>

      <div className="setting-block setting-rhymes">
        <div className="setting-label">
          <span>韵部</span>
          <small>不指定时由工作流择韵</small>
        </div>
        <div className="rhyme-selects">
          {rhymeLabels.map((label, index) => (
            <label key={label.id}>
              <span>{displayRhymeLabel(label, index)}</span>
              <select
                value={rhymeAssignments[label.id] ?? ''}
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
            优化轮数 <strong>{rounds}</strong>
          </span>
          <small>达到格律要求后会提前结束</small>
        </label>
        <input
          id="rounds"
          className="rounds-range"
          type="range"
          min="1"
          max="20"
          value={rounds}
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
          <small>每行一条，最多 20 条</small>
        </label>
        <textarea
          id="requirements"
          value={requirements}
          onChange={(event) => onRequirementsChange(event.target.value)}
          rows={4}
          placeholder={'避免直白抒情\n使用江南意象'}
        />
      </div>

      <div className="settings-action">
        <button
          className="primary-action"
          type="submit"
          disabled={!canSubmit || status.kind === 'loading' || status.kind === 'running'}
        >
          <span>
            {status.kind === 'loading' || status.kind === 'running' ? '正在生成' : '开始生成'}
          </span>
          <span aria-hidden="true">→</span>
        </button>

        <SubmissionNotice status={status} />
      </div>
    </aside>
  );
}

function SubmissionNotice({ status }: { readonly status: SubmissionStatus }) {
  if (status.kind === 'idle') {
    return <p className="settings-note">提交后可使用会话编号追踪生成任务。</p>;
  }
  return (
    <div className="submission-notice" data-kind={status.kind} role="status">
      <strong>
        {status.kind === 'completed'
          ? '词作已完成'
          : status.kind === 'queued'
            ? '任务已排队'
            : status.kind === 'running'
              ? '正在优化'
              : status.kind === 'error'
                ? '提交失败'
                : '正在连接生成服务'}
      </strong>
      <p>{status.message}</p>
      {status.sessionId !== undefined && <code>会话 {status.sessionId}</code>}
      {status.jobId !== undefined && <code>任务 {status.jobId}</code>}
    </div>
  );
}
