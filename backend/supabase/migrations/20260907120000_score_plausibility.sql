-- Stage 1 anti-cheat telemetry (DECISIONS.md §1.3).
--
-- Records the plausibility metrics and signals computed for every scorePayload
-- so the thresholds in backend/functions/src/match/verify.js can be calibrated
-- against real runs before enforcement is switched on.
--
-- Shadow mode: this column is written on every submit but does not affect the
-- accepted score until SCORE_PLAUSIBILITY_ENFORCE=1 is set on Functions.
--
-- No new grants: match_players already has RLS enabled and is service_role only.

alter table match_players
  add column if not exists score_plausibility jsonb;

comment on column match_players.score_plausibility is
  'Shadow-mode plausibility metrics + tripped signals for the submitted scorePayload. Calibration data only until SCORE_PLAUSIBILITY_ENFORCE=1.';

-- Flagged runs are the rare case, so index only those for review queries.
create index if not exists match_players_plausibility_flagged_idx
  on match_players ((score_plausibility -> 'signals'))
  where score_plausibility is not null
    and jsonb_array_length(score_plausibility -> 'signals') > 0;
