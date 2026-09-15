-- Widen the crash-scum / submit window to 100s so a full run
-- (60s + up to 8s buzzer window + optional +5s + Results) can still submit.
-- New and restarted seats pick this up via the started_at trigger.
-- Existing score_deadline_at values are left unchanged.

create or replace function match_players_set_score_deadline()
returns trigger
language plpgsql
as $$
begin
  if new.started_at is not null
     and (tg_op = 'INSERT' or old.started_at is null) then
    new.score_deadline_at := new.started_at + interval '100 seconds';
  end if;
  return new;
end;
$$;

comment on column match_players.score_deadline_at is
  'started_at + 100 seconds (60s run + 8s buzzer window + 5s bonus + submit buffer). Miss => score 0.';
