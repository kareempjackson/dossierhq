import { Sidebar } from '@/components/shell/sidebar';

/**
 * The app shell: the sidebar sits on the ground, and each page renders one or
 * two Sheets inside <main>. From 768px the shell is fixed to the window and
 * scrolling happens inside the sheets, so the ground and sidebar never move.
 * Below 768px the sidebar stacks on top and the page scrolls as usual.
 *
 * <main> only scrolls itself when two sheets stack (the report editor below
 * 1280px). Its negative margin and matching padding keep the sheets' shadows
 * from being clipped by that scroll container.
 */
export default function WorkspaceLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-full bg-sheet px-4 py-2 text-body text-ink shadow-float focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col gap-2 p-2 md:h-dvh md:flex-row md:overflow-hidden">
        <Sidebar />
        <main
          id="main"
          className="flex min-w-0 flex-1 flex-col gap-2 md:relative md:-m-2 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:p-2 xl:flex-row"
        >
          {children}
        </main>
      </div>
    </>
  );
}
