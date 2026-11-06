import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';

/**
 * The file button: a pill with its tab raised along the top (see the
 * file-shape utility in globals.css). One lime button per screen.
 */
export type ButtonVariant = 'act' | 'ink' | 'outline' | 'drafted';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  /** Lime: the one action that matters on this screen. */
  act: 'text-ink [--file-fill:var(--color-lime)] enabled:hover:[--file-fill:color-mix(in_oklab,var(--color-lime)_90%,var(--color-ink))] enabled:active:[--file-fill:color-mix(in_oklab,var(--color-lime)_80%,var(--color-ink))]',
  /** Ink: a strong action that isn't the main one, and confirmations. */
  ink: 'text-paper [--file-fill:var(--color-ink)] enabled:hover:[--file-fill:color-mix(in_oklab,var(--color-ink)_88%,var(--color-white))] enabled:active:[--file-fill:var(--color-night)]',
  /** Outline: the quiet choice beside another button. */
  outline:
    'text-ink [--file-fill:var(--color-white)] enabled:hover:[--file-fill:var(--color-grey-1)] enabled:active:[--file-fill:var(--color-grey-2)]',
  /** Lilac: accepting something Dossier drafted. */
  drafted:
    'text-ink [--file-fill:var(--color-lilac)] enabled:hover:[--file-fill:color-mix(in_oklab,var(--color-lilac)_88%,var(--color-ink))] enabled:active:[--file-fill:color-mix(in_oklab,var(--color-lilac)_78%,var(--color-ink))]',
};

/** Heights from the brand book: S 28, M 36, L 48. */
const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3.5 text-small [--file-tab:1.125rem]',
  md: 'h-9 px-5 text-sm [--file-tab:1.5rem]',
  lg: 'h-12 px-7 text-body [--file-tab:2rem]',
};

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize };

function buttonClasses(
  { variant = 'ink', size = 'md' }: StyleProps,
  className?: string,
) {
  return cn(
    'relative isolate inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none',
    'disabled:cursor-not-allowed disabled:text-muted disabled:[--file-fill:var(--color-grey-3)]',
    variants[variant],
    sizes[size],
    className,
  );
}

function FileShape({ variant = 'ink' }: StyleProps) {
  return (
    <span
      aria-hidden
      className={cn('file-shape', variant === 'outline' && 'file-outline')}
    />
  );
}

export function Button({
  variant,
  size,
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'> & StyleProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size }, className)}
      {...props}
    >
      <FileShape variant={variant} />
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return (
    <Link className={buttonClasses({ variant, size }, className)} {...props}>
      <FileShape variant={variant} />
      {children}
    </Link>
  );
}

/**
 * A button that's a plain link, for what isn't a page in the app, such as
 * a file to download: the browser follows it, not the router.
 */
export function ButtonAnchor({
  variant,
  size,
  className,
  children,
  ...props
}: ComponentProps<'a'> & StyleProps) {
  return (
    <a className={buttonClasses({ variant, size }, className)} {...props}>
      <FileShape variant={variant} />
      {children}
    </a>
  );
}

/**
 * The idle file button: the mark and a label, no fill. The mark tints lilac
 * on hover, because what it opens is Dossier's own work.
 */
export function MarkButton({
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full text-sm font-medium text-ink',
        className,
      )}
      {...props}
    >
      <Mark
        height={20}
        className="text-ink transition-colors group-hover:text-lilac-deep"
      />
      {children}
    </button>
  );
}
