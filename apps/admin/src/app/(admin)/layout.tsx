import { Sidebar } from '@/components/shell/sidebar';

/**
 * The admin shell: the dark sidebar, and each page as one or two Sheets in
 * <main>. From 768px the shell is fixed to the window and the sheets scroll.
 */
export default function AdminLayout({ children }: LayoutProps<'/'>) {
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
          className="flex min-w-0 flex-1 flex-col gap-2 md:relative md:-m-2 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:p-2"
        >
          {children}
        </main>
      </div>
    </>
  );
}
