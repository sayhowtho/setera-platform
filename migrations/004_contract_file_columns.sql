-- Step: add storage paths for uploaded contract files, linked to the
-- transition history row. Purely additive (two nullable columns).

alter table rep_compensation_history
  add column if not exists contract_sent_file_path text,
  add column if not exists contract_signed_file_path text;
