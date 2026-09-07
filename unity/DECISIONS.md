# Swish Shot — design decisions

Dated 2026-09-04. Update this file when scoring, clock, or fairness rules change.

## Product

Timed **skill run** for stakes-fair play: one possession you feed with good shots. Outcomes must be explainable as aim, hold-time, and clock choice — not luck.

## Loop

- Shot clock starts on **scene launch** with `gameTime` (and again after arcade game-over reset).
- It **ticks down once** for `gameTime`. Makes do **not** add time (score only). Pause and buzzer slow-mo do not tick.
- A miss does **not** end the run. The ball rolls in from the side opposite the hoop; the clock keeps running.
- **Game over** when remaining time is 0 and there is no live shot, a buzzer-beater miss, or a buzzer-beater **make** (the basket counts, then the run ends).
- Ranked **embed** still waits for RN `startRun` / `BeginEmbedMatch` (server epochs); arcade does not.

## Input

- Swipe-on-ball is removed.
- **Tap anywhere**, then **drag left/right** to choose angle (same as the old swipe, without having to hit the ball). Drag up for lift; hold time still maps to power.
- Assist only lightly blends a centered shot. A clear left/right drag is not pulled back to the hoop.

## Fairness

- No random ball spawn X.
- Hoop motion, if active, always starts to the **right** and reverses on court borders (deterministic).
- Same config and physics for every client.

## Scoring (config)

`Assets/Resources/game_config.json` is the source of truth. `Game.AddPoint` only classifies the make:

1. **Perfect** — scored, no rim, no backboard → `pointsPerfect`
2. **Hoop** — scored, touched rim (rim wins if both rim and glass) → `pointsHoop`
3. **Backboard** — scored, glass only → `pointsBackboard`

Clock starts on launch with **`gameTime`**. Makes only add score. Continue grants `clockContinueSeconds`. Slow-mo uses `buzzerTimeScale`.

Shipped defaults: perfect 3 / hoop 2 / backboard 1; **gameTime 60s**; continue 8s; buzzerTimeScale 0.3.

## Buzzer-beater

If the clock hits 0 while the ball is in the air, time scale drops and the shot finishes. A make still scores, then game over. A miss is game over. The clock is not extended.

## Feel

A **perfect** make (clean 3, no rim or glass) triggers a short camera shake. Rim and backboard scores do not.

## Audio

Clips from Universal Sound FX `SPORTS/Basketball` live under `Assets/Resources/Audio/Basketball` as project assets. `GameAudio` on the Game object uses inspector clip references (no `Resources.Load`). Throw/rim: indoor bounce RR; backboard: board hit RR; make: Score 03/02/01 for perfect/hoop/glass; miss recycle and buzzer: outdoor bounce.

## Copy

UI strings are English in the scene. There is no localization system or language picker.

## Non-goals

RNG power-ups, wind, lucky-bounce tables, ads, Google Play Games, Native Share, privacy popup, staking backend, localization.
