"use client";

import { useState } from "react";

/* A box you type a number into.
 *
 * The rule it exists to enforce: while you are typing, what is in the box is
 * what you typed. Not what the app made of it, and not what it looks like once
 * parsed and rendered back.
 *
 * Deriving the value from a parsed number reads fine and fails in use, because
 * the states on the way to a number are not numbers. "0" on the way to "0.9"
 * fails a `> 0` guard and the box empties. "19." parses to 19 and the dot
 * disappears as you type it. "" while you clear a field to retype it reads as
 * "no value" and the row it belongs to jumps somewhere else. Every one of those
 * has cost a bug in this app.
 *
 * So: the raw text is held here while the box has focus, the parsed value is
 * reported only when the text actually parses, and letting go of the box is
 * what decides whether an empty one means "cleared".
 */

export function NumberField({
  value, onChange, onCommit,
  min = 0, step = "1", id, placeholder, ariaLabel, title, className,
  allowEmpty = true, disabled,
}: {
  value: number | null | undefined;
  /** Called as a valid number is typed. Never called with a half-typed one. */
  onChange: (v: number) => void;
  /** Called when the box is left. `null` means it was emptied deliberately. */
  onCommit?: (v: number | null) => void;
  min?: number;
  step?: string;
  /** So a <label htmlFor> still points at the box. */
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  /** Whether clearing the box is meaningful, or should snap back. */
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <input
      type="number"
      id={id}
      min={min}
      step={step}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      className={className}
      disabled={disabled}
      value={typing ?? (value == null ? "" : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setTyping(raw);
        const v = parseFloat(raw);
        if (Number.isFinite(v) && v >= min) onChange(v);
      }}
      onBlur={() => {
        const raw = typing;
        setTyping(null);
        if (raw == null) return;
        if (raw.trim() === "") { if (allowEmpty) onCommit?.(null); return; }
        const v = parseFloat(raw);
        onCommit?.(Number.isFinite(v) && v >= min ? v : null);
      }}
    />
  );
}
