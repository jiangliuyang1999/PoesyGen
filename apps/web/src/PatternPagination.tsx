import { Pagination } from './Pagination.js';

interface PatternPaginationProps {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly onChange: (pageIndex: number) => void;
}

export const patternPageSize = 8;

export function PatternPagination({ pageIndex, pageCount, onChange }: PatternPaginationProps) {
  return (
    <Pagination
      className="pattern-pagination"
      pageIndex={pageIndex}
      pageCount={pageCount}
      labels={{
        navigation: '词牌分页',
        previous: '上一页词牌',
        next: '下一页词牌',
        page: (pageNumber) => `第 ${pageNumber} 页词牌`,
      }}
      onChange={onChange}
    />
  );
}
