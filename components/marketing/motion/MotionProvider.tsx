'use client';
import { LazyMotion, MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((m) => m.default);

/** Wrap animated islands so framer-motion's feature bundle loads lazily.
 *  reducedMotion="user" is a second guard: useScrollReveal already keeps
 *  everything in its finished state when prefers-reduced-motion is set. */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
