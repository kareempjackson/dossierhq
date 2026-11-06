import { ViewTransition, type ReactNode } from 'react';
import { Cascade } from '@/components/ui/cascade';

/**
 * Moving to another section of the workspace (Today, Clients, Audit log…):
 * the old page dissolves (`page-out` in globals.css) and the new one's
 * sections spring in (Cascade). The template remounts only when the section
 * changes, so client tabs, client filters and the Connections list and
 * tools keep their own, lighter motion. A Reveal inside a page that is
 * cascading in doesn't move again; only the outermost cascade runs.
 */
export default function WorkspaceTemplate({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ViewTransition exit="page-out" default="none">
      {/* One element, so the page dissolves as one piece. Adds no layout. */}
      <div>
        <Cascade>{children}</Cascade>
      </div>
    </ViewTransition>
  );
}
