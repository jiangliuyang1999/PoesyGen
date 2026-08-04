import { describe, expect, it } from 'vitest';

import { generationQueueName } from './index.js';

describe('generation queue configuration', () => {
  it('uses a BullMQ-compatible queue name', () => {
    expect(generationQueueName).toBe('poesygen-generation');
    expect(generationQueueName).not.toContain(':');
  });
});
