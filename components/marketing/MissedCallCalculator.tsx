'use client';
import { useId, useState } from 'react';
import styles from './MissedCallCalculator.module.css';
import CountUp from './motion/CountUp';

type CalcPath = 'owner' | 'covered';

const COPY: Record<CalcPath, { missedLabel: string; answeredLabel: string }> = {
  owner: {
    missedLabel: 'When you’re busy, how many calls go unanswered each week?',
    answeredLabel: 'Calls that reach you',
  },
  covered: {
    missedLabel: 'How many calls still slip through each week (after hours, lunch, sick days, everyone on another line)?',
    answeredLabel: 'Calls your current setup catches',
  },
};

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const num = (v: string) => Math.max(0, parseFloat(v) || 0);
const whole = (n: number) => String(Math.round(n));
const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, '');
const money = (n: number) => cad.format(n);

/**
 * Missed-call estimate from the visitor's own inputs. Same math as the
 * original homepage calculator, kept in the same weekly timeframe as the
 * inputs (no monthly/annual extrapolation) so it always reconciles with
 * what was typed: missed calls × share that are real jobs × average value.
 * The result is an estimate, never a promise of what Setera will recover.
 */
export default function MissedCallCalculator() {
  const id = useId();
  const [path, setPath] = useState<CalcPath>('owner');
  const [weekly, setWeekly] = useState('40');
  const [missed, setMissed] = useState('8');
  const [rate, setRate] = useState(30);
  const [avg, setAvg] = useState('4500');

  const weeklyN = num(weekly);
  const missedRaw = num(missed);
  // Missed calls can't outnumber calls received. Clamp for the math on
  // every keystroke; only rewrite the field itself on blur, so typing
  // "135" doesn't get cut off while passing through "1".
  const overMax = weeklyN > 0 && missedRaw > weeklyN;
  const missedN = weeklyN > 0 ? Math.min(missedRaw, weeklyN) : missedRaw;
  const answered = Math.max(weeklyN - missedN, 0);
  const missedJobs = missedN * (rate / 100);
  const value = missedJobs * num(avg);
  const missRate = weeklyN > 0 ? Math.round((missedN / weeklyN) * 100) : 0;

  const clampMissed = () => { if (overMax) setMissed(String(weeklyN)); };

  return (
    <div className={styles.box}>
      <div className={styles.toggle} role="radiogroup" aria-label="How are your calls answered today?">
        {(['owner', 'covered'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={path === p}
            className={path === p ? styles.toggleOn : styles.toggleOff}
            onClick={() => setPath(p)}
          >
            {p === 'owner' ? 'I answer the phone myself' : 'Someone or something answers for us'}
          </button>
        ))}
      </div>

      <div className={styles.inputs}>
        <div className={styles.field}>
          <label htmlFor={`${id}-weekly`}>How many calls does your business get in a typical week?</label>
          <input id={`${id}-weekly`} type="number" inputMode="numeric" min={0} value={weekly}
            onChange={(e) => setWeekly(e.target.value)} onBlur={clampMissed} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-missed`}>{COPY[path].missedLabel}</label>
          <input id={`${id}-missed`} type="number" inputMode="numeric" min={0} max={weeklyN || undefined} value={missed}
            aria-describedby={overMax ? `${id}-err` : undefined}
            onChange={(e) => setMissed(e.target.value)} onBlur={clampMissed} />
          {overMax && <span id={`${id}-err`} className={styles.error}>Can’t be more than your total weekly calls.</span>}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-rate`}>
            Of those missed calls, how many would have been real jobs? <output className={styles.rateOut} htmlFor={`${id}-rate`}>{rate}%</output>
          </label>
          <input id={`${id}-rate`} type="range" min={0} max={100} step={5} value={rate}
            onChange={(e) => setRate(Number(e.target.value))} className={styles.range} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-avg`}>Average value of a job you actually want (CAD)</label>
          <input id={`${id}-avg`} type="number" inputMode="numeric" min={0} value={avg}
            onChange={(e) => setAvg(e.target.value)} />
        </div>
      </div>

      <dl className={styles.outputs} aria-live="polite">
        <div className={styles.outRow}><dt>{COPY[path].answeredLabel}</dt><dd><CountUp value={answered} format={whole} /></dd></div>
        <div className={styles.outRow}><dt>Calls missed each week</dt><dd><CountUp value={missedN} format={whole} /> <span className={styles.outSub}>(<CountUp value={missRate} format={whole} />%)</span></dd></div>
        <div className={styles.outRow}><dt>Estimated real jobs among them</dt><dd><CountUp value={missedJobs} format={oneDecimal} /></dd></div>
        <div className={`${styles.outRow} ${styles.outMain}`}>
          <dt>Estimated weekly value of missed opportunities, based on your inputs</dt>
          <dd><CountUp value={value} format={money} /></dd>
        </div>
      </dl>
      <p className={styles.disclaimer}>
        This is a rough estimate calculated only from the numbers you entered. It isn’t a projection, a quote or a guarantee of results.
      </p>
    </div>
  );
}
