'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Framer Motion's settings for the whole app. For people who ask their
 * system for less motion, nothing moves or grows; fades stay, since they
 * carry the change without the movement.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
