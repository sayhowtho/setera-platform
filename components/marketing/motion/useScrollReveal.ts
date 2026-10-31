'use client';
import { useEffect, useState, type RefObject } from 'react';

export type RevealState = 'shown' | 'armed' | 'playing';

/**
 * Scroll-triggered reveal that can never leave content stuck hidden.
 *
 * - Server render and first client render are 'shown' (finished state), so
 *   no-JS, failed hydration and crawlers all see the full content.
 * - After mount, only an element still BELOW the viewport is 'armed'
 *   (hidden), so nobody ever sees content disappear.
 * - It plays when it scrolls into view, detected by IntersectionObserver
 *   AND a passive scroll check (some mobile browsers never fire IO), so a
 *   missed observer can't strand it.
 * - prefers-reduced-motion: stays 'shown', no animation at all.
 */
export function useScrollReveal(ref: RefObject<HTMLElement | null>, threshold = 0.25): RevealState {
  const [state, setState] = useState<RevealState>('shown');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const vh = window.innerHeight;
    if (el.getBoundingClientRect().top < vh * 0.9) return; // already on screen: leave it finished

    setState('armed');
    let done = false;
    const play = () => {
      if (done) return;
      done = true;
      setState('playing');
      cleanup();
    };
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * (1 - threshold) && r.bottom > 0) play();
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) play(); }, { threshold });
    io.observe(el);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    function cleanup() {
      io.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    }
    return cleanup;
  }, [ref, threshold]);

  return state;
}
