import type { DirectLlmConfig } from './direct-llm-config.js';

interface DirectLlmSettingsProps {
  readonly config: DirectLlmConfig;
  readonly disabled: boolean;
  readonly onChange: (config: DirectLlmConfig) => void;
}

export function DirectLlmSettings({ config, disabled, onChange }: DirectLlmSettingsProps) {
  const update = <Key extends keyof DirectLlmConfig>(
    key: Key,
    value: DirectLlmConfig[Key],
  ): void => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="setting-block direct-llm-settings">
      <div className="direct-llm-fields">
        <label>
          <span>接口协议</span>
          <select aria-label="LLM 接口协议" value="openai-compatible" disabled>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </label>

        <label>
          <span>API Base URL</span>
          <input
            type="url"
            aria-label="LLM API Base URL"
            value={config.baseUrl}
            disabled={disabled}
            placeholder="https://api.openai.com/v1"
            onChange={(event) => update('baseUrl', event.target.value)}
          />
        </label>

        <label>
          <span>Endpoint（可选）</span>
          <input
            type="url"
            aria-label="LLM Endpoint"
            value={config.endpoint}
            disabled={disabled}
            placeholder="https://example.com/v1/chat/completions"
            onChange={(event) => update('endpoint', event.target.value)}
          />
        </label>

        <label>
          <span>Model</span>
          <input
            aria-label="LLM Model"
            value={config.model}
            disabled={disabled}
            placeholder="模型名或方舟 endpoint-id"
            onChange={(event) => update('model', event.target.value)}
          />
        </label>

        <label>
          <span>API Key</span>
          <input
            type="password"
            aria-label="LLM API Key"
            value={config.apiKey}
            disabled={disabled}
            autoComplete="new-password"
            placeholder="仅保存在当前设备"
            onChange={(event) => update('apiKey', event.target.value)}
          />
        </label>

        <div className="direct-llm-number-fields">
          <label>
            <span>最大输出 Tokens</span>
            <input
              type="number"
              aria-label="LLM 最大输出 Tokens"
              min="128"
              max="32768"
              step="128"
              value={config.maxTokens}
              disabled={disabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value > 0) update('maxTokens', value);
              }}
            />
          </label>
          <label>
            <span>超时（秒）</span>
            <input
              type="number"
              aria-label="LLM 超时秒数"
              min="10"
              max="600"
              value={Math.round(config.timeoutMs / 1_000)}
              disabled={disabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value > 0) update('timeoutMs', value * 1_000);
              }}
            />
          </label>
        </div>

        <label className="direct-llm-checkbox">
          <input
            type="checkbox"
            checked={config.jsonMode}
            disabled={disabled}
            onChange={(event) => update('jsonMode', event.target.checked)}
          />
          <span>启用 JSON Mode</span>
        </label>

        <label className="direct-llm-checkbox">
          <input
            type="checkbox"
            checked={config.rememberApiKey}
            disabled={disabled}
            onChange={(event) => update('rememberApiKey', event.target.checked)}
          />
          <span>在此设备持久保存 API Key</span>
        </label>
        {config.rememberApiKey && (
          <p className="direct-llm-warning">
            API Key 将写入浏览器本地存储。请勿在公共或不可信设备启用。
          </p>
        )}
      </div>
    </div>
  );
}
