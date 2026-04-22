interface Props {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

export default function TablePagination({ page, totalPages, total, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
      <span className="text-sm text-muted">{total.toLocaleString()} results · Page {page} of {totalPages}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
