'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Tweens a displayed number from its previous value to `value` (~450 ms,
 * ease-out). Display only: the calculator's math is unchanged. Tiny rAF
 * tween instead of framer-motion so the calculator doesn't pull in the
 * animation bundle. prefers-reduced-motion: shows the final value at once.
 */
export default function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const dur = reduce ? 0 : 450;
    const tick = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const n = start + (value - start) * eased;
      from.current = n;
      setShown(n);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return <>{format(shown)}</>;
}
