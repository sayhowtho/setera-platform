// Saves a prospect's status change plus its stage-history bookkeeping, and
// says what actually happened, for the Board/status handlers on /admin, /rep
// and /setter. Row-level security turns a not-allowed update into "0 rows
// updated" with no error, so the status update asks for the row back.
import type { SupabaseClient } from '@supabase/supabase-js';

export type StageChangeResult =
  | { status: 'saved' }
  | { status: 'not_saved'; message: string }
  | { status: 'history_failed'; message: string };

export type StageChange = {
  prospectId: string;
  newStatus: string;
  now: string;            // ISO timestamp, used for updated_at / left_at / entered_at
  columnChanged: boolean; // history is only written when the Board column changes
  newStage: string;       // PIPELINE_COLUMNS label of the new column
  historyRepId: string;   // rep_id recorded on the new history row
  daysInStage: number;    // for the history row being closed
};

export const NOT_YOURS_MESSAGE = 'Status not saved: you can only move your own prospects.';

export async function saveStatusChange(client: SupabaseClient, c: StageChange): Promise<StageChangeResult> {
  const { data, error } = await client.from('prospects').update({ status: c.newStatus, updated_at: c.now }).eq('id', c.prospectId).select('id');
  if (error) return { status: 'not_saved', message: 'Status not saved: ' + error.message };
  if (!data || data.length === 0) return { status: 'not_saved', message: NOT_YOURS_MESSAGE };
  if (!c.columnChanged) return { status: 'saved' };

  const closed = await client.from('prospect_stage_history').update({ left_at: c.now, days_in_stage: c.daysInStage }).eq('prospect_id', c.prospectId).is('left_at', null);
  const opened = await client.from('prospect_stage_history').insert({ prospect_id: c.prospectId, rep_id: c.historyRepId, stage: c.newStage, entered_at: c.now });
  const historyError = closed.error || opened.error;
  if (historyError) return { status: 'history_failed', message: 'Status saved, but stage history wasn’t recorded: ' + historyError.message };
  return { status: 'saved' };
}
