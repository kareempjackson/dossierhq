'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A one-time code, drawn as a box per digit. Underneath it is one ordinary
 * input, so pasting, the phone's code autofill and screen readers all work.
 * Submits its form once every digit is in.
 */
export function CodeInput({
  length = 6,
  id,
  name,
  invalid,
  describedBy,
  autoFocus,
}: {
  length?: number;
  id: string;
  name: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, length - 1);

  useEffect(() => {
    if (value.length === length) input.current?.form?.requestSubmit();
  }, [value, length]);

  return (
    <div className="group relative grid w-full max-w-[25rem] grid-cols-6 gap-2.5">
      {Array.from({ length }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className={cn(
            'flex aspect-square items-center justify-center rounded-xl text-h3 transition-colors',
            invalid ? 'bg-attention-soft' : 'bg-grey-1',
            // The box the next digit lands in, while the field has focus.
            index === active &&
              'group-focus-within:bg-white group-focus-within:ring-2 group-focus-within:ring-lilac-deep group-focus-within:ring-inset',
          )}
        >
          {value[index]}
        </div>
      ))}
      <input
        ref={input}
        id={id}
        name={name}
        value={value}
        onChange={(event) =>
          setValue(event.target.value.replace(/\D/g, '').slice(0, length))
        }
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`\\d{${length}}`}
        required
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}
