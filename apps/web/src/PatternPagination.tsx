interface PatternPaginationProps {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly onChange: (pageIndex: number) => void;
}

export const patternPageSize = 8;

export function PatternPagination({ pageIndex, pageCount, onChange }: PatternPaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pattern-pagination" aria-label="词牌分页">
      <button
        type="button"
        aria-label="上一页词牌"
        disabled={pageIndex === 0}
        onClick={() => onChange(pageIndex - 1)}
      >
        ←
      </button>
      <span className="pattern-page-numbers">
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            type="button"
            key={index}
            aria-label={`第 ${index + 1} 页词牌`}
            {...(index === pageIndex ? { 'aria-current': 'page' as const } : {})}
            onClick={() => onChange(index)}
          >
            {index + 1}
          </button>
        ))}
      </span>
      <button
        type="button"
        aria-label="下一页词牌"
        disabled={pageIndex === pageCount - 1}
        onClick={() => onChange(pageIndex + 1)}
      >
        →
      </button>
    </nav>
  );
}
