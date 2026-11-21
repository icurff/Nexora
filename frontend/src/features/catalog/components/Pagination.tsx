import { ArrowRight } from 'lucide-react';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  label,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;

  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav className="pagination" aria-label={label}>
      <button
        className="page-next"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      {pages.map((value, index) => (
        <span className="pagination-item" key={value}>
          {index > 0 && value - pages[index - 1] > 1 ? (
            <span aria-hidden="true">…</span>
          ) : null}
          <button
            className={`page-number${value === page ? ' active' : ''}`}
            aria-label={`Page ${value}`}
            aria-current={value === page ? 'page' : undefined}
            onClick={() => onPageChange(value)}
          >
            {value}
          </button>
        </span>
      ))}
      <button
        className="page-next"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next <ArrowRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
}
