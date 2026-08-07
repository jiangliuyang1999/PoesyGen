import { describe, expect, it } from 'vitest';

import { formatCliBanner } from './banner.js';

describe('CLI start banner', () => {
  it('renders PoesyGen with the FIGlet Standard font', () => {
    expect(formatCliBanner()).toBe(
      [
        '  ____                        ____',
        ' |  _ \\ ___   ___  ___ _   _ / ___| ___ _ __',
        " | |_) / _ \\ / _ \\/ __| | | | |  _ / _ \\ '_ \\",
        ' |  __/ (_) |  __/\\__ \\ |_| | |_| |  __/ | | |',
        ' |_|   \\___/ \\___||___/\\__, |\\____|\\___|_| |_|',
        '                       |___/',
        '',
        'PoesyGen · 格律诗词作',
      ].join('\n'),
    );
  });
});
