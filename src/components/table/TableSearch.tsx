interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function TableSearch({ value, onChange, placeholder = 'Search…' }: Props) {
  return (
    <div style={{ position: 'relative', minWidth: 240 }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        className="input"
        style={{ paddingLeft: 32 }}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
