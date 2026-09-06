-- Phase 7: bind RN-minted clientRunId to the running seat (identity check on submitScore).
alter table match_players
  add column if not exists client_run_id uuid;

comment on column match_players.client_run_id is
  'UUID from scorePayload.clientRunId; set on first accepted submit; must match thereafter.';
