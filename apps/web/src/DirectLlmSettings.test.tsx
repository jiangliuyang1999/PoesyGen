// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultDirectLlmConfig, directLlmProviderOptions } from './direct-llm-config.js';
import { DirectLlmSettings } from './DirectLlmSettings.js';

afterEach(cleanup);

describe('direct LLM settings', () => {
  it('shows only the supported providers instead of an editable URL', () => {
    render(<SettingsHarness />);

    const provider = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'LLM API Base URL',
    });
    expect(provider.value).toBe('https://api.openai.com/v1');
    expect(
      [...provider.options].map((option) => ({
        label: option.textContent,
        value: option.value,
      })),
    ).toEqual(
      directLlmProviderOptions.map((option) => ({
        label: `${option.name} · ${option.baseUrl}`,
        value: option.baseUrl,
      })),
    );
    expect(screen.queryByRole('textbox', { name: 'LLM API Base URL' })).toBeNull();
    expect(screen.queryByLabelText('LLM Endpoint')).toBeNull();
  });

  it('restores each provider model and API key when switching back', async () => {
    const user = userEvent.setup();
    render(<SettingsHarness />);

    const provider = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'LLM API Base URL',
    });
    const model = screen.getByLabelText<HTMLInputElement>('LLM Model');
    const apiKey = screen.getByLabelText<HTMLInputElement>('LLM API Key');

    await user.selectOptions(provider, 'https://api.deepseek.com');
    expect(model.value).toBe('');
    expect(apiKey.value).toBe('');

    await user.type(model, 'deepseek-chat');
    await user.type(apiKey, 'deepseek-secret');
    await user.selectOptions(provider, 'https://api.openai.com/v1');
    expect(model.value).toBe('gpt-4.1-mini');
    expect(apiKey.value).toBe('openai-secret');

    await user.selectOptions(provider, 'https://api.deepseek.com');
    expect(model.value).toBe('deepseek-chat');
    expect(apiKey.value).toBe('deepseek-secret');
  });
});

function SettingsHarness() {
  const [config, setConfig] = useState({
    ...defaultDirectLlmConfig,
    model: 'gpt-4.1-mini',
    apiKey: 'openai-secret',
  });
  return <DirectLlmSettings config={config} disabled={false} onChange={setConfig} />;
}
