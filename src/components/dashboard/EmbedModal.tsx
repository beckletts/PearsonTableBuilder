import { useState } from 'react';
import './EmbedModal.css';

interface Props {
  tableTitle: string;
  tableSlug: string;
  onClose: () => void;
}

export default function EmbedModal({ tableTitle, tableSlug, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/t/${tableSlug}`;
  const code = `<iframe\n  src="${url}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  title="${tableTitle}"\n></iframe>`;

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="embed-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="embed-modal">
        <div className="embed-modal__header">
          <div>
            <h2 className="embed-modal__title">Embed table</h2>
            <p className="embed-modal__sub">{tableTitle}</p>
          </div>
          <button className="embed-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="embed-modal__desc">
          Paste this code into any webpage to embed a live, interactive version of this table.
        </p>
        <pre className="embed-modal__code">{code}</pre>
        <button className="btn btn-primary w-full" onClick={copy}>
          {copied ? '✓ Copied!' : 'Copy embed code'}
        </button>
      </div>
    </div>
  );
}
