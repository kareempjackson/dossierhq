'use client';

import { briefText, type ExecutiveBrief } from '@dossierhq/contracts';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * The executive version of something Dossier drafted: a headline, a few
 * plain lines, and the decision asked for.
 */
export function ExecutiveBriefView({
  brief,
  as: Heading = 'h3',
  className,
}: {
  brief: ExecutiveBrief;
  as?: 'h2' | 'h3' | 'p';
  className?: string;
}) {
  return (
    <div className={className}>
      <Heading className="font-medium text-ink">{brief.headline}</Heading>
      {brief.points.length > 0 && (
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-meta text-text marker:text-muted">
          {brief.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
      {brief.decision && (
        <p className="mt-2 text-meta">
          <span className="font-medium text-ink">Decision needed: </span>
          <span className="text-text">{brief.decision}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Copies text to paste into an email to the client's leadership. Offered
 * only where the text is fit for a client to read.
 */
export function CopyForClient({
  brief,
  text,
  label = 'Copy for client',
  className,
}: {
  brief?: ExecutiveBrief;
  text?: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const content = brief ? briefText(brief) : (text ?? '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Button variant="ghost" onClick={copy} disabled={!content}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? 'Copied' : label}
      </Button>
      {failed && (
        <span role="alert" className="text-meta-sm text-alert">
          Couldn’t copy. Select the text and copy it instead.
        </span>
      )}
    </span>
  );
}
