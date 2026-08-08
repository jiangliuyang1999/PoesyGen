// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { logConfigSummary, logWebError, logWebEvent } from './web-logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('web logger', () => {
  it('writes structured console logs and redacts credentials', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logWebEvent('llm', 'request', {
      url: 'https://example.com/chat?api_key=query-secret&trace=1',
      headers: {
        Authorization: 'Bearer header-secret',
        'Content-Type': 'application/json',
      },
      apiKey: 'config-secret',
      body: { model: 'test-model', theme: '江上春归' },
    });

    expect(consoleLog).toHaveBeenCalledOnce();
    expect(consoleLog.mock.calls[0]?.[0]).toBe('[PoesyGen][llm] request');
    const payload = consoleLog.mock.calls[0]?.[1] as {
      readonly details: Record<string, unknown>;
    };
    expect(payload.details).toEqual({
      url: 'https://example.com/chat?api_key=%5BREDACTED%5D&trace=1',
      headers: {
        Authorization: '[REDACTED]',
        'Content-Type': 'application/json',
      },
      apiKey: '[REDACTED]',
      body: { model: 'test-model', theme: '江上春归' },
    });
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  it('logs errors and summarizes config without exposing the API key', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logWebError('generation', 'failed', new Error('request failed'), {
      config: logConfigSummary({
        baseUrl: 'https://example.com/v1',
        endpoint: '',
        model: 'test-model',
        apiKey: 'secret',
        timeoutMs: 120_000,
        maxTokens: 4_096,
        jsonMode: true,
        rememberApiKey: false,
      }),
    });

    const payload = consoleLog.mock.calls[0]?.[1] as {
      readonly details: {
        readonly config: Record<string, unknown>;
        readonly error: Record<string, unknown>;
      };
    };
    expect(payload.details.config).toMatchObject({
      model: 'test-model',
      apiKeyConfigured: true,
      rememberApiKey: false,
    });
    expect(payload.details.config).not.toHaveProperty('apiKey');
    expect(payload.details.error).toMatchObject({
      name: 'Error',
      message: 'request failed',
    });
  });
});
