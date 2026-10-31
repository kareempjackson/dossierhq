import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const variants = {
  /** The one green action on a screen. */
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-sheet text-ink shadow-card hover:bg-surface-soft',
  ghost: 'text-text hover:bg-surface hover:text-ink',
  /** A secondary action on the landing page's dark bands. */
  inverse: 'text-white ring-1 ring-white/25 ring-inset hover:bg-white/10',
} as const;

const sizes = {
  /** Actions inside a row, beside its text. */
  sm: 'h-8 px-3 text-meta',
  md: 'h-9 px-4 text-body',
  /** The landing page's calls to action. */
  lg: 'h-12 px-6 text-section',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

function buttonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** A link that looks like a button, for actions that navigate. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
