'use client';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';

// Shared easing for all entrance/scroll motion on the site: decelerates
// cleanly with zero overshoot (no spring/elastic bounce anywhere).
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type RevealVariant = 'fade' | 'scale' | 'clip-left' | 'clip-center';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  /**
   * 'fade' (default) is opacity-only — the original, safest form, still
   * used everywhere else on the page. The other variants intentionally
   * reintroduce a transform or clip-path alongside opacity for specific
   * image-reveal moments; see the note below before reaching for them.
   */
  variant?: RevealVariant;
};

/**
 * One-shot reveal that triggers once an element scrolls into view.
 * Respects prefers-reduced-motion: when set, the element renders in its
 * final state immediately with no animated transition.
 *
 * The default 'fade' variant animates opacity alone, with no accompanying
 * transform — combined transform+opacity animations are a known trigger
 * for iOS Safari compositing bugs where an element can get stuck
 * mid-animation if the browser deprioritizes off-screen paint work. Fewer
 * animated properties means less surface area for that class of bug, and
 * every pre-existing use of Reveal on this page relies on exactly that
 * property, unchanged.
 *
 * 'scale' and 'clip-left'/'clip-center' are opt-in exceptions for a
 * handful of image-reveal moments that specifically called for more than
 * a fade. They deliberately reintroduce the transform/clip-path risk the
 * default variant avoids, so they should stay rare, and are exactly why
 * this is worth re-verifying with a real-device production build after
 * adding one (dev mode and responsive emulators don't reproduce it).
 *
 * Some mobile browsers have also been observed to never fire the
 * IntersectionObserver-driven whileInView trigger for content below the
 * fold, which would otherwise leave it permanently stuck in its hidden
 * state — i.e. invisible, functioning content, not a cosmetic miss. A
 * one-time timeout forces the visible state regardless, so a failed
 * trigger costs at most a delayed appearance, never permanent invisibility.
 * This applies to every variant equally.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.4,
  variant = 'fade',
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const [forceVisible, setForceVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForceVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const reduced = !!shouldReduceMotion;

  const hidden: Record<string, string | number> = reduced
    ? { opacity: 1 }
    : variant === 'scale'
      ? { opacity: 0, scale: 0.95, y: 16 }
      : variant === 'clip-left'
        ? { opacity: 1, clipPath: 'inset(0 100% 0 0)' }
        : variant === 'clip-center'
          ? { opacity: 1, clipPath: 'inset(0 50% 0 50%)' }
          : { opacity: 0 };

  const visibleTarget: Record<string, string | number> =
    variant === 'scale'
      ? { opacity: 1, scale: 1, y: 0 }
      : variant === 'clip-left' || variant === 'clip-center'
        ? { opacity: 1, clipPath: 'inset(0 0% 0 0%)' }
        : { opacity: 1 };

  const variants: Variants = {
    hidden,
    visible: {
      ...visibleTarget,
      transition: shouldReduceMotion
        ? { duration: 0 }
        : { duration, ease: EASE_OUT, delay },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      animate={forceVisible ? 'visible' : undefined}
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {children}
    </motion.div>
  );
}
