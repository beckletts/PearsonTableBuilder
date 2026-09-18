import { BADGE_COLOR_CHOICES, badgeColorName } from '../../utils/badgeColors';

const CUSTOM = '__custom__';

interface Props {
  /** The chosen colour, or undefined for the automatic palette colour. */
  value?: string;
  onChange: (color?: string) => void;
  /** Label for the "no colour chosen" option. Omit to require a colour. */
  automaticLabel?: string;
  /** Colour the swatch shows while nothing is chosen — the automatic one. */
  fallback?: string;
  /** Describes what is being coloured, for screen readers. */
  ariaLabel: string;
}

/**
 * Pick a badge colour by name, or by hex for anything off-palette.
 *
 * Named choices matter here: several columns sharing one colour is the common
 * case, and picking the same name every time is exact where matching a hex by
 * eye in a colour dialog is not.
 */
export default function BadgeColorPicker({ value, onChange, automaticLabel, fallback, ariaLabel }: Props) {
  const isNamed = BADGE_COLOR_CHOICES.some((c) => c.value.toLowerCase() === (value ?? '').toLowerCase());
  const selected = !value ? '' : isNamed ? value.toLowerCase() : CUSTOM;
  // While nothing is chosen the swatch shows the colour actually in use, so it
  // never claims a colour the table isn't using.
  const shown = value ?? fallback ?? BADGE_COLOR_CHOICES[0].value;

  return (
    <div className="badge-picker">
      <select
        className="input badge-picker__select"
        value={selected}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '') onChange(undefined);
          // Keep the current colour and let the swatch beside this do the choosing.
          else if (next === CUSTOM) onChange(value ?? BADGE_COLOR_CHOICES[0].value);
          else onChange(next);
        }}
      >
        {automaticLabel && <option value="">{automaticLabel}</option>}
        {BADGE_COLOR_CHOICES.map((c) => (
          <option key={c.value} value={c.value.toLowerCase()}>{c.label}</option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>

      <input
        type="color"
        className="col-editor__colour-swatch"
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${ariaLabel} — custom colour`}
        title={`${badgeColorName(value)} — click to pick any colour`}
      />
    </div>
  );
}
