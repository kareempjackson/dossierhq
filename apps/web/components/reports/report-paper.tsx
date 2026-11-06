import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

/**
 * A weekly report as the client receives it: the sender's logo, the client
 * and the week, then the body. The top edge takes the brand colour.
 */
export function ReportPaper({
  colour,
  logo,
  clientName,
  period,
  footer,
  children,
}: {
  colour: string;
  /** An uploaded logo's address; the Dossier logo until one is set. */
  logo?: string | null;
  clientName: string;
  /** e.g. "26 Oct to 1 Nov"; left out when there's no week yet. */
  period: string | null;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      aria-label={`Weekly report for ${clientName}`}
      className="flex h-full flex-col overflow-hidden rounded-xl border-t-4 bg-white px-6 pt-5 pb-5 shadow-[0_1px_2px_rgb(19_35_42/0.06)]"
      style={{ borderTopColor: colour }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview of an upload
        <img
          src={logo}
          alt="Logo"
          className="h-6 w-auto self-start object-contain"
        />
      ) : (
        <Logo height={18} />
      )}
      <p className="mt-5 text-[0.75rem] text-muted">
        Weekly report{period ? ` · ${period}` : ''}
      </p>
      <h2 className="mt-1 text-h2">{clientName}</h2>
      <div className="mt-4 flex-1">{children}</div>
      <p className="mt-6 text-[0.6875rem] text-muted">{footer}</p>
    </article>
  );
}
