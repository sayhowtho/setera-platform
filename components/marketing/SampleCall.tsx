import { PhoneIncoming, ListChecks, KanbanSquare } from 'lucide-react';
import s from './sections.module.css';
import c from './SampleCall.module.css';

export type SampleCallData = {
  lines: { who: 'Emily' | 'Caller'; text: string }[];
  captured: { label: string; value: string }[];
  entryTitle: string;
  entryNote: string;
  /** Optional emergency escalation steps (only for businesses that turn it on). */
  escalation?: string[];
  next: string;
};

/** A sample call becoming a pipeline entry. Callers and details are invented
 *  (the surrounding section must say so); the stage name is the real one. */
export default function SampleCall({ call }: { call: SampleCallData }) {
  return (
    <ol className={c.flow}>
      <li className={s.card}>
        <span className={s.cardIcon}><PhoneIncoming size={20} aria-hidden="true" /></span>
        <h3 className={s.h3}>1. The call</h3>
        <div className={c.transcript} aria-label="Sample transcript excerpt">
          {call.lines.map((l, i) => (
            <p key={i}><b>{l.who}</b> {l.text}</p>
          ))}
        </div>
      </li>
      <li className={s.card}>
        <span className={s.cardIcon}><ListChecks size={20} aria-hidden="true" /></span>
        <h3 className={s.h3}>2. What Emily captures</h3>
        <dl className={c.fields}>
          {call.captured.map((f) => (
            <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
          ))}
          <div><dt>Pipeline</dt><dd>New opportunity</dd></div>
        </dl>
      </li>
      <li className={s.card}>
        <span className={s.cardIcon}><KanbanSquare size={20} aria-hidden="true" /></span>
        <h3 className={s.h3}>3. Your pipeline</h3>
        <div className={c.pipeRow}>
          <span className={c.pipeStage}>Call Captured</span>
          <p className={c.pipeTitle}>{call.entryTitle}</p>
          <p className={s.small}>{call.entryNote}</p>
          {call.escalation && (
            <div className={c.escalation}>
              <p className={c.escalationLabel}>Emergency escalation (turned on)</p>
              <ol>
                {call.escalation.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
          )}
          <p className={c.pipeNext}>{call.next}</p>
        </div>
      </li>
    </ol>
  );
}
