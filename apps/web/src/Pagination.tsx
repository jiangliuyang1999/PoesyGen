interface PaginationLabels {
  readonly navigation: string;
  readonly previous: string;
  readonly next: string;
  readonly page: (pageNumber: number) => string;
}

interface PaginationProps {
  readonly className: string;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly labels: PaginationLabels;
  readonly onChange: (pageIndex: number) => void;
}

export interface PaginationState<Value> {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly items: ReadonlyArray<Value>;
}

export function paginateItems<Value>(
  items: ReadonlyArray<Value>,
  requestedPageIndex: number,
  pageSize?: number,
): PaginationState<Value> {
  if (pageSize === undefined) {
    return {
      pageIndex: 0,
      pageCount: 1,
      items,
    };
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pageIndex = Math.max(0, Math.min(requestedPageIndex, pageCount - 1));
  return {
    pageIndex,
    pageCount,
    items: items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
  };
}

export function Pagination({ className, pageIndex, pageCount, labels, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className={className} aria-label={labels.navigation}>
      <button
        type="button"
        aria-label={labels.previous}
        disabled={pageIndex === 0}
        onClick={() => onChange(pageIndex - 1)}
      >
        ←
      </button>
      <span className="pagination-pages">
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            type="button"
            key={index}
            aria-label={labels.page(index + 1)}
            {...(index === pageIndex ? { 'aria-current': 'page' as const } : {})}
            onClick={() => onChange(index)}
          >
            {index + 1}
          </button>
        ))}
      </span>
      <button
        type="button"
        aria-label={labels.next}
        disabled={pageIndex === pageCount - 1}
        onClick={() => onChange(pageIndex + 1)}
      >
        →
      </button>
    </nav>
  );
}
