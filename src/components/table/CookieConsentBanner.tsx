import './CookieConsentBanner.css';

interface Props {
  message?: string;
  onAccept: () => void;
  onDecline: () => void;
}

const DEFAULT_MESSAGE =
  'This page uses cookies to understand how it is used. Do you accept?';

export default function CookieConsentBanner({ message, onAccept, onDecline }: Props) {
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <p className="cookie-banner__text">{message || DEFAULT_MESSAGE}</p>
      <div className="cookie-banner__actions">
        <button className="cookie-banner__accept" onClick={onAccept}>
          Accept cookies
        </button>
        <button className="cookie-banner__decline" onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  );
}
