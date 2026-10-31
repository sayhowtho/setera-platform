import styles from './DashboardMock.module.css';

// Product illustration only: invented callers, labelled as a sample. Shows
// only approved capabilities (captured name / need / urgency, urgent
// routing, appointment setting, pipeline) and the real pipeline stage names
// from lib/pipeline-stages.ts. No usage, minute or plan numbers, ever.
type Tag = 'Urgent' | 'New lead' | 'Appointment';

const CALLS: { time: string; who: string; what: string; tag: Tag; outcome: string }[] = [
  { time: '6:42 PM', who: 'Dana M.', what: 'Water coming through the kitchen ceiling', tag: 'Urgent', outcome: 'Routed to you right away' },
  { time: '7:15 PM', who: 'Marc L.', what: 'Shingles lifted after the wind storm, wants an estimate', tag: 'New lead', outcome: 'Added to pipeline' },
  { time: '8:03 PM', who: 'Priya S.', what: 'Furnace tune-up before winter', tag: 'Appointment', outcome: 'Booked on your terms' },
  { time: '8:40 PM', who: 'Tom R.', what: 'Quote for a panel upgrade', tag: 'New lead', outcome: 'Added to pipeline' },
];

const STAGES = ['Call Captured', 'Called Back', 'Estimate Booked', 'Estimate Done', 'Job Signed'];

const tagClass: Record<Tag, string> = {
  Urgent: styles.tagUrgent,
  'New lead': styles.tagOpp,
  Appointment: styles.tagNeutral,
};

export default function DashboardMock({ compact = false }: { compact?: boolean }) {
  const calls = compact ? CALLS.slice(0, 3) : CALLS;
  return (
    <figure className={styles.frame} aria-label="Sample Setera call log with invented callers">
      <div className={styles.head}>
        <span className={styles.title}>Sample call log</span>
        <span className={styles.sample}>Illustration · invented callers</span>
      </div>
      <ul className={styles.rows}>
        {calls.map((c) => (
          <li key={c.time} className={styles.row}>
            <span className={styles.time}>{c.time}</span>
            <span className={styles.who}>
              <strong>{c.who}</strong>
              <span>{c.what}</span>
            </span>
            <span className={tagClass[c.tag]}>{c.tag}</span>
            <span className={styles.outcome}>{c.outcome}</span>
          </li>
        ))}
      </ul>
      <div className={styles.pipeline} aria-label="Pipeline stages">
        {STAGES.map((s, i) => (
          <span key={s} className={i === 0 ? styles.stageActive : styles.stage}>{s}</span>
        ))}
      </div>
      <figcaption className={styles.caption}>
        Every call comes with a transcript and summary. Every opportunity goes straight into the pipeline.
      </figcaption>
    </figure>
  );
}
