import { describe, expect, it } from 'vitest';

import { paginateItems } from './Pagination.js';

describe('pagination model', () => {
  it('clamps page indexes and slices items', () => {
    const items = Array.from({ length: 9 }, (_, index) => index);

    expect(paginateItems(items, 0, 8)).toEqual({
      pageIndex: 0,
      pageCount: 2,
      items: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect(paginateItems(items, 10, 8)).toEqual({
      pageIndex: 1,
      pageCount: 2,
      items: [8],
    });
  });

  it('returns all items when pagination is disabled', () => {
    const items = [1, 2, 3];

    expect(paginateItems(items, 4)).toEqual({
      pageIndex: 0,
      pageCount: 1,
      items,
    });
  });
});
