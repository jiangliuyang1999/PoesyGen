import { useEffect } from 'react';

import { DirectLlmSettings } from './DirectLlmSettings.js';
import type { DirectLlmConfig } from './direct-llm-config.js';

interface LlmConfigDialogProps {
  readonly open: boolean;
  readonly config: DirectLlmConfig;
  readonly disabled: boolean;
  readonly directReady: boolean;
  readonly onChange: (config: DirectLlmConfig) => void;
  readonly onClose: () => void;
}

export function LlmConfigDialog({
  open,
  config,
  disabled,
  directReady,
  onChange,
  onClose,
}: LlmConfigDialogProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const status = directReady ? 'LLM 已配置' : 'LLM 未配置';

  return (
    <div
      className="llm-config-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="llm-config-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-config-title"
      >
        <header>
          <div>
            <p className="section-kicker">生成连接</p>
            <h2 id="llm-config-title">LLM 配置</h2>
          </div>
          <button type="button" aria-label="关闭配置" onClick={onClose}>
            ×
          </button>
        </header>

        <p className="llm-config-status" data-ready={directReady}>
          <i />
          {status}
        </p>

        {disabled && <p className="llm-config-locked">生成进行中，当前配置暂不可修改。</p>}

        <DirectLlmSettings config={config} disabled={disabled} onChange={onChange} />

        <footer>
          <button type="button" onClick={onClose}>
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
