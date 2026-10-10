import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** When true, clearing the field reports null; otherwise it snaps back on blur. */
  allowEmpty?: boolean;
};

/** Number input that keeps the raw text while typing, so "", "1." and "-" don't get clobbered. */
export function NumberField({ value, onChange, allowEmpty = false, onBlur, ...rest }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [prevValue, setPrevValue] = useState(value);

  // Resync the text when the value changes from outside (e.g. loading a saved config).
  if (value !== prevValue) {
    setPrevValue(value);
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) setText(value === null ? '' : String(value));
  }

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') {
          if (allowEmpty) onChange(null);
          return;
        }
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={(e) => {
        if (text.trim() === '' && !allowEmpty) setText(value === null ? '' : String(value));
        onBlur?.(e);
      }}
    />
  );
}
