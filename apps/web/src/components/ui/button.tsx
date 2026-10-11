import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const variants = {
  /** The one green action on a screen. */
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-sheet text-ink shadow-card hover:bg-surface-soft',
  ghost: 'text-text hover:bg-surface hover:text-ink',
} as const;

export type ButtonVariant = keyof typeof variants;

function buttonClass(variant: ButtonVariant, className?: string) {
  return cn(
    'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-body font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    className,
  );
}

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant };

export function Button({
  variant = 'secondary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

/** A link that looks like a button, for actions that navigate. */
export function ButtonLink({
  variant = 'secondary',
  className,
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
