import { cn } from '@/lib/cn';

const FOLDERS = [
  {
    n: '01',
    name: 'Tickets',
    count: '274 read',
    tone: 'bg-lime',
    place: 'lg:left-0 lg:top-0 lg:w-[48.5%]',
  },
  {
    n: '02',
    name: 'Devices',
    count: '13 watched',
    tone: 'bg-stone',
    place: 'lg:left-[48%] lg:top-0 lg:w-[52%]',
  },
  {
    n: '03',
    name: 'Reports',
    count: '1 to approve',
    tone: 'bg-paper',
    place: 'lg:left-0 lg:top-[7.25rem] lg:w-[38%]',
  },
  {
    n: '04',
    name: 'Meetings',
    count: '38 promises',
    tone: 'bg-[color-mix(in_oklab,var(--color-stone)_55%,var(--color-stone-deep))]',
    place: 'lg:left-[37%] lg:top-[7.25rem] lg:w-[63%]',
  },
  {
    n: '05',
    name: 'Notes',
    count: '3 waiting',
    tone: 'bg-lilac',
    place: 'lg:left-0 lg:top-[14.5rem] lg:w-full',
  },
];

/**
 * The drawer of folder tabs at the foot of "Filed, not buried", drawn to
 * show a client's file, not to open one. On wide screens they overlap like
 * a drawer and pull up when pointed at; on narrow ones they stack.
 */
export function FolderDrawer() {
  return (
    <ul className="relative flex flex-col lg:block lg:h-[25rem]">
      {FOLDERS.map((folder, index) => (
        <li
          key={folder.name}
          className={cn(
            'relative -mt-14 first:mt-0 lg:absolute lg:mt-0',
            folder.place,
          )}
          style={{ zIndex: index + 1 }}
        >
          <div className="block transition-transform duration-300 ease-out hover:-translate-y-4">
            <span
              className={cn(
                'relative block h-8 w-36 rounded-t-xl [clip-path:polygon(0_0,78%_0,100%_100%,0_100%)]',
                folder.tone,
              )}
            />
            <span
              className={cn(
                'flex h-40 items-start justify-between rounded-r-xl px-5 pt-1 pb-10 text-ink lg:h-56',
                folder.tone,
              )}
            >
              <span>
                <span className="block font-mono text-[0.625rem] tracking-normal">
                  {folder.n}
                </span>
                <span className="block font-display text-[2.75rem] leading-none tracking-[-0.04em] sm:text-[3.5rem]">
                  {folder.name}
                </span>
              </span>
              <span className="pt-4 text-[0.75rem]">{folder.count}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
