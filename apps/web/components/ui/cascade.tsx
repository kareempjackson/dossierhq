'use client';

import { animate, useReducedMotion } from 'motion/react';
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** A soft spring: settles in about a third of a second, no bounce. */
const SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 38,
  mass: 0.9,
} as const;
/** Each section starts this long after the one before, in seconds… */
const STAGGER = 0.045;
/** …up to this many, so a long list doesn't trickle in. */
const STAGGER_LIMIT = 6;
/** How long after hydrating a cascade keeps its hands off, in ms. */
const HYDRATION_WINDOW = 1000;

const subscribe = () => () => {};
/** True while React hydrates HTML the server sent, which is already on screen. */
const useHydrating = () =>
  useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  );

/**
 * Content arriving: its sections spring up a few pixels as they fade in, one
 * after another. It runs when the content mounts (a navigation, a read
 * finishing) or reappears (Next keeps visited pages, hidden, and shows them
 * again), never on the first paint, which the server already drew.
 *
 * It adds no box: two hidden markers bracket the content, so layouts and a
 * surrounding <ViewTransition> see the content's own elements. Only the
 * outermost cascade moves an element, so a page arriving with its content
 * doesn't move twice. Styles are put back when it finishes, so no transform
 * is left behind for fixed-position menus to get caught in.
 */
export function Cascade({ children }: { children: ReactNode }) {
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const hydrating = useHydrating();
  const [fromServer] = useState(hydrating);
  const hydratedAt = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const start = startRef.current;
    const end = endRef.current;
    if (!start || !end) return;
    if (fromServer) {
      // Hydrated: what's on screen came from the server, so leave it. In
      // development Strict Mode runs this again shortly after; leave that
      // too. Shown again later (a page Next kept), it cascades as usual.
      const now = performance.now();
      hydratedAt.current ??= now;
      if (now - hydratedAt.current < HYDRATION_WINDOW) return;
    }
    if (reduce) return;

    const items = sectionsBetween(start, end);
    if (items.length === 0) return;
    const token = Symbol('cascade');
    const restore = () => items.forEach((el) => release(el, token));

    // Hidden before the browser paints. Whether to move them waits for the
    // rest of this commit: an outer cascade, whose effect runs after this
    // one, may claim the same elements or one around them, and then it
    // moves them instead.
    items.forEach((el) => claim(el, token));
    let running: ReturnType<typeof animate>[] = [];
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const mine = items.filter((el) => owners.get(el) === token);
      if (mine.length === 0 || movedByAnother(start, token)) {
        restore();
        return;
      }
      const delay = (index: number) => Math.min(index, STAGGER_LIMIT) * STAGGER;
      // Two animations, so the fade can ease while the rise springs.
      running = [
        animate(
          mine,
          { opacity: [0, 1] },
          { duration: 0.32, ease: [0.2, 0, 0, 1], delay },
        ),
        animate(mine, { y: [10, 0] }, { ...SPRING, delay }),
      ];
      Promise.all(running).then(restore, restore);
    });
    return () => {
      cancelled = true;
      running.forEach((animation) => animation.stop());
      restore();
    };
  }, [fromServer, reduce]);

  return (
    <>
      <span ref={startRef} hidden />
      {children}
      <span ref={endRef} hidden />
    </>
  );
}

/*
 * Which cascade moves each element, and its own inline styles from before
 * any cascade touched it, so the last one to let go puts them back.
 */
const owners = new WeakMap<HTMLElement, symbol>();
const originals = new WeakMap<
  HTMLElement,
  [opacity: string, transform: string]
>();

function claim(el: HTMLElement, token: symbol) {
  if (!originals.has(el)) {
    originals.set(el, [el.style.opacity, el.style.transform]);
  }
  owners.set(el, token);
  el.style.opacity = '0';
}

function release(el: HTMLElement, token: symbol) {
  if (owners.get(el) !== token) return;
  const [opacity, transform] = originals.get(el) ?? ['', ''];
  el.style.opacity = opacity;
  el.style.transform = transform;
  owners.delete(el);
  originals.delete(el);
}

/** Whether another cascade is moving something this one sits inside. */
function movedByAnother(marker: Element, token: symbol) {
  for (let el = marker.parentElement; el; el = el.parentElement) {
    const owner = owners.get(el);
    if (owner && owner !== token) return true;
  }
  return false;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META']);

/**
 * The elements to move: those between the markers, looking through boxless
 * wrappers, and down through any single element that holds the rest, so a
 * page that is one grid still cascades its parts.
 */
function sectionsBetween(start: Element, end: Element): HTMLElement[] {
  const top: Element[] = [];
  for (let el = start.nextElementSibling; el && el !== end;) {
    top.push(el);
    el = el.nextElementSibling;
  }
  let items = boxed(top);
  for (let depth = 0; depth < 3 && items.length === 1; depth++) {
    const inner = boxed([...items[0].children]);
    if (inner.length < 2) break;
    items = inner;
  }
  return items;
}

function boxed(elements: Element[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || SKIP.has(el.tagName)) continue;
    const display = getComputedStyle(el).display;
    if (display === 'none') continue;
    if (display === 'contents') out.push(...boxed([...el.children]));
    else out.push(el);
  }
  return out;
}
