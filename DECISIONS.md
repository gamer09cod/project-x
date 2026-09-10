# DECISIONS.md

## Purpose

This document records the product and technical decisions made for this
implementation, including the reasoning, trade-offs, and constraints
behind them.

------------------------------------------------------------------------

# Boost

## 1. Boost model

A Prize Boost is treated as a **server-authoritative promotional
entitlement**.

A boost contains:

-   Boost percentage
-   Game it applies to
-   Game mode it applies to
-   Maximum wager allowed with the boost
-   Expiry time
-   Promotional budget/campaign that funds the additional payout

The client may display these values, but the server is the source of
truth for eligibility, consumption, payout calculation, and promotional
spend.

### Why

The boost directly affects real-money payout, so the client must never
be trusted to decide whether a boost is valid or how much additional
money should be paid.

------------------------------------------------------------------------

## 2. Can multiple boosts be active?

### Decision

**Only one boost can be active for a player at a time. Boosts do not
stack.**

A player may have multiple boost entitlements available in their
inventory, but only one can be selected/active for the next eligible
game entry.

If multiple eligible boosts are available, the player can choose which
one to activate. The selected boost is then consumed when entering the
eligible match.

### Why

Stacking would increase complexity and promotional exposure without
adding enough value for the MVP.

For example, two 25% boosts will not become a 50% boost. This prevents
unexpected promotional liabilities and makes the payout calculation
deterministic.

### Trade-off

This limits some promotional flexibility, but it makes the system easier
to understand, test, audit, and protect against abuse.

------------------------------------------------------------------------

## 3. When is a boost consumed?

### Decision

**A boost is consumed atomically when the player successfully enters an
eligible match.**

It is not consumed when the player wins.

The entry transaction performs all of the following atomically:

1.  Validate that the boost belongs to the player.
2.  Validate that it is still active and has not expired.
3.  Validate the selected game and mode.
4.  Validate that the wager is within the boost's maximum wager.
5.  Debit the player's wager.
6.  Mark the boost as consumed.
7.  Create the match entry.
8.  Snapshot the boost terms onto the match.
9.  Record the wager debit in the ledger.

If any part of the transaction fails, the entire transaction is rolled
back.

### Why

The boost is intended to apply to the **next eligible game the player
enters**. Consuming it only after a win would allow the player to retain
the same boost after losing and potentially reuse it indefinitely.

### Example

``` text
Player owns +25% boost
        ↓
Enters eligible ₹100 match
        ↓
Boost consumed
        ↓
Player loses
        ↓
Boost is not restored
```

------------------------------------------------------------------------

## 4. What happens if the boost expires after match entry?

### Decision

**Expiry is checked at match entry. Once the boost is successfully
applied, its terms are locked to that match and remain valid until
settlement.**

For example:

``` text
Boost expires: 20:00

19:59 - Player enters match
        → boost accepted and consumed

20:00 - Original boost expires

20:05 - Opponent submits score

20:06 - Match settles
        → player still receives the boost if they win
```

### Why

The player should not lose a benefit that was legitimately applied
before its expiry merely because the asynchronous opponent plays later.

This is particularly important because matches are asynchronous and
settlement can occur significantly later than entry.

### Implementation

The match stores a snapshot of the financial terms needed for
settlement, including:

-   `boost_id`
-   `boost_percentage_bps`
-   `boost_max_wager_cents`
-   calculated/recorded promotional payout amount where appropriate

Settlement uses this snapshot rather than looking up the player's
current boost.

------------------------------------------------------------------------

## 5. Boost payout calculation

### Decision

The boost increases the winner's normal payout by the configured
percentage.

All monetary values are stored as integer cents/paise. Percentages are
represented using integer basis points rather than floating-point
values.

For example:

``` text
Normal payout = 19000 cents
Boost         = 2500 bps (25%)

Boost amount = 19000 × 2500 / 10000
             = 4750 cents

Final payout = 23750 cents
```

The rounding rule is deterministic and implemented server-side.

### Why

Floating-point arithmetic must not be used for wallet balances, wagers,
or payouts.

The boosted amount must also be reproducible during retries so that
settlement remains idempotent.

------------------------------------------------------------------------

## 6. Source of promotional money

### Decision

**The additional boost payout is treated as company-funded promotional
spend and is tracked separately from player wager funds.**

The data model contains a promotional budget/campaign that tracks:

-   Allocated promotional budget
-   Promotional amount already spent
-   Maximum promotional spend per match
-   Maximum promotional spend per player over a configured period
-   Campaign status

Each boosted settlement records a promotional ledger entry linked to:

-   Player
-   Match
-   Boost
-   Promotional budget/campaign
-   Promotional amount

### Why

Player wager funds and company promotional funds represent different
sources of money and should be auditable independently.

This also makes it possible to answer:

-   How much has a campaign spent?
-   Which players received promotional money?
-   Which matches generated promotional spend?
-   Is a campaign approaching its budget?
-   How much exposure does a particular boost create?

------------------------------------------------------------------------

## 7. Promotional exposure limits

### Decision

Promotional boosts have multiple server-side exposure limits.

### Per-match cap

A maximum promotional amount is allowed for a single match.

This protects against a configuration bug such as an accidentally large
percentage or wager.

### Per-player cap

A maximum amount of promotional money can be awarded to a player over a
configured period, such as a day.

This limits the impact of abusive behaviour or unexpected repeated
usage.

### Campaign/global cap

Every boost campaign has a finite promotional budget.

Once the budget is exhausted, new boosted entries should not be accepted
unless the campaign is replenished or replaced.

### Percentage and wager validation

The server also validates that:

``` text
boost percentage <= configured maximum
wager <= boost maximum wager
```

The client cannot override either value.

### Why

A promotional feature is effectively a potential financial liability.
Limits must exist independently of the client and should be enforced
inside the same transaction that consumes the boost and creates the
match.

------------------------------------------------------------------------

## 8. What happens if promotional budget is unavailable?

### Decision

**A boost cannot be applied if the required promotional exposure cannot
be safely reserved within the configured limits.**

The player should receive a clear error and the match entry should not
be created using the boost.

The wager and boost must remain unchanged if the entry transaction
fails.

### Why

We should never create a match that promises a promotional payout which
the system cannot safely fund.

------------------------------------------------------------------------

## 9. Boost and asynchronous settlement

### Decision

The boost is part of the match's financial terms once the player enters.

Settlement follows the same atomic and idempotent settlement mechanism
used for normal matches.

Conceptually:

``` text
WAGER_DEBIT
    ↓
Match played
    ↓
Winner determined
    ↓
NORMAL_PAYOUT
    +
PROMO_BOOST_PAYOUT
    ↓
Ledger entries
    ↓
Wallet update
    ↓
Match COMPLETED
```

A retry of settlement must not issue the boosted payout twice.

### Why

Network failures, duplicate API requests, retries, or worker retries
must never result in duplicate promotional payouts.

------------------------------------------------------------------------

# Product Decisions

## 10. Should boost percentage and maximum wager depend on skill/ELO?

### Decision

**Yes, but through configurable server-side rules rather than a complex
dynamic formula for the MVP.**

Boosts can be personalized based on factors such as:

-   ELO/rating
-   Recent activity
-   New-player status
-   Engagement
-   Games played

The goal is not simply to give the strongest players the largest
bonuses. Stronger players are more likely to win, so doing so could
increase promotional cost disproportionately.

A reasonable initial strategy is:

``` text
New / lower-engagement players
→ higher boost percentage
→ conservative maximum wager

Experienced / high-ELO players
→ lower boost percentage
→ controlled maximum wager
```

The exact values should be configurable and can be tuned using actual
player behaviour and promotional ROI.

### Why

Boosts should be used to improve engagement and retention while
controlling company-funded payout exposure.

------------------------------------------------------------------------

## 11. Should boosts encourage players to try new games?

### Decision

**Yes. Game discovery is a good use case for boosts.**

Players can receive stronger promotional incentives for games they have
never played or rarely play.

For example:

``` text
Frequently played game
→ +10% boost

New/unplayed game
→ +25% boost
```

The maximum wager remains capped.

### Why

A boost can be used not only as a retention mechanism but also as a way
to reduce concentration around a single game and encourage players to
discover other games in the product.

### Trade-off

A higher boost for an unfamiliar game may attract experimentation, but
it can also increase promotional cost. The percentage and maximum wager
should therefore remain configurable and capped.

------------------------------------------------------------------------

# Summary of Boost Decisions

  Decision                    Choice
  --------------------------- --------------------------------------------
  Multiple active boosts      No
  Boost stacking              No
  Consumption                 On successful eligible match entry
  Expiry after entry          Boost remains valid until settlement
  Financial terms             Snapshotted onto match
  Percentage representation   Integer basis points
  Money representation        Integer cents/paise
  Promotional funding         Separate company-funded promotional budget
  Per-match exposure          Capped
  Per-player exposure         Capped
  Campaign exposure           Capped by promotional budget
  Client authority            None for validation/payout
  Skill personalization       Configurable, conservative for high-ELO
  New-game discovery          Higher boost can be used as an incentive
  Settlement                  Atomic and idempotent

------------------------------------------------------------------------

# Risks and Future Improvements

The MVP intentionally keeps boost rules simple. Future iterations could
introduce:

-   A/B testing of boost percentages
-   Retention-based targeting
-   Game-specific promotional budgets
-   Fraud/abuse scoring
-   More sophisticated ELO and engagement segmentation
-   Personalized boost recommendations
-   Campaign-level ROI reporting

Any future increase in boost percentage or maximum wager should be
evaluated against actual promotional cost, player retention, conversion,
and abuse rates before being enabled globally.

---

# Streak

## 12. Streak model

### Decision

A **Streak consists of exactly 3 sequential games**.

The player makes **one wager up front** for the entire streak. They must beat
the server-defined target score in all three games to complete the streak.

Quitting any game in the streak counts as a failure.

The streak expires **24 hours after it is started**.

### Why

The one-wager/three-game structure makes Streak a distinct product mode rather
than three independent wagers. Sequential progression creates a clear sense
of risk and achievement.

---

## 13. Where do Streak target scores come from?

### Decision

**Use a server-side, ops-tunable target configuration table.**

Targets are configured per game and can optionally be segmented by a
difficulty/skill tier in a future iteration.

When the streak starts, the targets for all three games are **snapshotted onto
the streak**. Settlement and score validation use the snapshot rather than a
later configuration lookup.

Example:

```text
streak_target_config
--------------------
game_id
target_score
difficulty_tier
active
version
created_at
updated_at
```

The streak stores:

```text
game_1_target
game_2_target
game_3_target
```

### Why this choice

I would not derive the target directly from the individual player's history
for the MVP. An ops-tunable configuration is deterministic, easy to explain,
easy to test, easy to tune, and safer for the economy.

A whole-playerbase percentile is also possible, but it introduces additional
complexity around population size, segmentation, outliers, and changing player
skill.

### House-edge tuning

The target score is an economic parameter because it determines the
probability of completing all three games.

If the probability of beating an individual target is approximately `p`, then:

```text
P(full streak) ~= p^3
```

For example:

```text
Individual target hit rate = 70%

0.70^3 = 34.3% full-streak completion probability
```

This is only an approximation because player skill and game difficulty are not
truly independent, but it is a useful starting point for reasoning about the
economy.

The initial target should therefore be tuned from observed gameplay data, not
from a theoretical formula alone.

### Metrics to monitor

For each game/target configuration, measure:

- Average score
- Median score
- Target hit rate
- Game 1 pass rate
- Game 2 pass rate
- Game 3 pass rate
- Full-streak completion rate
- Failure/quit rate
- Expiry rate
- Completion rate by player skill/experience
- Retention after starting a streak
- Prize cost relative to streak wagers

### How we know the target is wrong

Targets may be too easy if full-streak completion is substantially higher than
the economic model expects, strong players complete streaks at very high rates,
or prize cost grows beyond the intended margin.

Targets may be too hard if very few players complete a streak, a particular
game has a dramatically lower pass rate than the others, players frequently
quit after starting, or starting a streak correlates with reduced retention.

Targets should be adjusted through versioned server configuration rather than
hardcoded client values.

---

## 14. What happens when a Streak expires with games unplayed?

### Decision

**An expired streak fails. There is no automatic refund.**

If the player has not completed all three games by the server-side expiry time,
the streak transitions to `EXPIRED` and is financially settled as a failure.

Example:

```text
Started:  Monday 10:00
Expires:  Tuesday 10:00

Game 1 -> PASS
Game 2 -> PASS
Game 3 -> NOT PLAYED

=> EXPIRED
=> FAILED
=> No 2.5x payout
=> No refund
```

### Why

The wager represents the player's entry into the complete three-game
challenge. Allowing an automatic refund after partial participation would
change the economic contract and could create an undesirable low-risk path.

Expiry is determined using **server time**, never the client clock.

---

## 15. Can a player hold more than one Streak?

### Decision

**No. A player can have only one active Streak at a time.**

A new streak cannot be created while another streak is `ACTIVE`.

The database should enforce this invariant where practical, in addition to
server-side validation.

### Why

One active streak keeps the mode easy to understand and prevents players from
accumulating multiple outstanding wagers and challenges.

---

## 16. What exactly does the 2.5x payout mean?

### Decision

**2.5x means 2.5x the original Streak wager as the player's total return.**

For example:

```text
Wager = ₹100
Multiplier = 2.5x

Total payout = ₹250
Net profit   = ₹150
```

The wager is debited/locked when the streak starts.

The 2.5x payout is awarded **only after all three target scores have been
beaten**.

For integer arithmetic:

```text
2.5x = 25000 basis points

payout = wager_cents * 25000 / 10000
```

The rounding rule is deterministic and server-side.

### Why

This gives the player an unambiguous contract: pay ₹100 to start the streak;
complete all three games and receive ₹250.

---

## 17. When does the money leave the company's side?

### Decision

The player's wager is debited at **Streak creation**, not after the three
games.

```text
Player wallet
    |
    v
WAGER_DEBIT
    |
    v
Active Streak
```

If the streak fails or expires, there is no winning payout.

If the streak succeeds, the server credits the 2.5x total payout through the
existing atomic settlement mechanism and records the balance movement in the
append-only ledger.

The exact funding implementation reuses the existing wallet/ledger
architecture rather than introducing a second balance system.

---

## 18. What happens to targets after a player wins?

### Decision

**Do not immediately increase targets after an individual win.**

For the MVP, targets remain determined by the configured target tier that was
snapshotted when the streak started.

In a future version, repeated successful streaks may move a player into a
higher skill/difficulty tier. That tier would affect future streaks, not the
current streak.

### Why

Increasing the target immediately after a success makes the game feel as
though it is moving the goalposts during a session.

A tier-based system is more predictable:

```text
Repeated strong performance
        |
        v
Higher future skill tier
        |
        v
Higher future targets
```

---

## 19. What happens to targets after a player loses?

### Decision

**Do not immediately lower targets after a single loss.**

A player should not be able to deliberately lose a streak in order to make the
next streak easier.

If adaptive difficulty is introduced later, it should use aggregated
performance over multiple streaks/games and move the player between
server-configured skill tiers.

The change applies only to future streaks.

### Why

This avoids creating an exploitable feedback loop while still allowing the
product to become more accessible to consistently struggling players.

---

## 20. Should the Streak multiplier change with wins/losses?

### Decision

**Keep the multiplier fixed at 2.5x for the MVP.**

Do not increase it after wins and do not increase it after losses.

```text
Target difficulty -> configurable
Payout multiplier  -> fixed at 2.5x
```

### Why

Changing both difficulty and payout dynamically makes the economy difficult
to reason about and harder to audit.

If a player wins repeatedly, increasing the multiplier increases prize exposure
exactly when the player has demonstrated they are more likely to win.

If a player loses repeatedly, increasing the multiplier could encourage
players to pursue higher-value retries and can create undesirable economic
incentives.

For the MVP, adjust challenge difficulty through controlled target tiers while
keeping the payout contract stable.

---

## 21. Streak state and concurrency

### Decision

Streak progression is **server-authoritative, transactional, and idempotent**.

A recommended state model is:

```text
ACTIVE
  |
  +--> FAILED
  |
  +--> EXPIRED
  |
  +--> COMPLETED
```

Each game within the streak should also have an explicit state such as:

```text
PENDING
ACTIVE
PASSED
FAILED
```

The server must prevent:

- Starting game 2 before game 1 has passed
- Starting game 3 before game 2 has passed
- Two concurrent requests from starting the same next game
- Submitting a score for the wrong game
- Replaying an already-settled score submission
- Completing the streak twice
- Creating two active streaks for the same player

Use transactions/row locking or equivalent database concurrency controls.

---

## 22. Streak score validation

### Decision

Streak games reuse the existing server-authoritative score submission and
validation pipeline used by the 1v1 mode.

The client sends the result; the server decides whether the score is accepted.

The server must validate that:

- The player owns the streak.
- The streak is still active.
- The correct game is being submitted.
- The streak has not expired.
- The game has actually been started.
- The score submission has not already been processed.
- The score passes the existing anti-cheat/validation checks.

The target comparison happens on the server:

```text
validated_score >= snapshotted_target
    -> game PASSED

validated_score < snapshotted_target
    -> streak FAILED
```

The client must not be trusted to declare that a target was reached.

---

## 23. Streak + Boost interaction

### Decision

For the MVP, **Prize Boosts apply only to their explicitly configured game
mode**. A boost configured for `1v1` does not automatically apply to a Streak.

A future streak-specific promotional boost can be added as a separate
configuration with explicit payout and exposure rules.

### Why

Boosts apply to a specified game and game mode.
Allowing a normal 1v1 boost to silently apply to a three-game 2.5x Streak would
multiply the company's promotional liability and make the financial contract
ambiguous.

---


# Matchmaking

## 24. Matchmaking model

### Decision

Matchmaking is **first-come-first-served** within the same game and the same stake.

A player may be matched with any other eligible player who entered the same game/stake pool within the **15-minute matchmaking window**.

Rating/ELO is **not used** to influence pairing.

Conceptually:

```text
Eligible pool:
    same game
    same stake
    still waiting
    entered within 15 minutes

            |
            v

First eligible player
        +
Next eligible player
        |
        v
     MATCHED
```

### Why

Keeping matchmaking independent from rating makes the behavior deterministic, easy to understand, easy to test, and consistent with first-come-first-served expectations.

Rating exists as a player statistic, not as a matchmaking mechanism.

---

## 25. What happens when no opponent is found?

### Decision

**Refund the player's stake and expire the entry.**

If no eligible opponent is found within the 15-minute matchmaking window:

```text
Player enters
    |
    v
Stake debited
    |
    v
Waiting for opponent
    |
    | 15 minutes pass
    v
No opponent found
    |
    v
STAKE REFUNDED
    |
    v
ENTRY EXPIRED
```

The player does **not** win by default and the house does **not** fill the seat.

### Why

A refund is the simplest and safest MVP behavior.

Declaring a default win would create an artificial competitive result despite the player never having had an opponent.

Having the house fill the seat would introduce additional complexity around bot/house behavior, fairness, score generation, and economic exposure.

A refund ensures that a player's money can never become stuck simply because matchmaking failed.

The refund must use the same atomic wallet/ledger mechanism used for other money movements.

---

## 26. Matchmaking invariants

The system must guarantee:

- Rating is never part of the matchmaking query.
- Only compatible game/stake entries can match.
- An entry cannot be matched after its 15-minute window has expired.
- An expired unmatched entry receives exactly one refund.
- Refund processing is idempotent.
- A refunded/expired entry cannot later be matched.
- A player's stake remains fully accounted for in the ledger.
- Duplicate matchmaking/expiry workers cannot double-refund the same entry.

---

# Player Rating

## 27. Rating model

### Decision

Use a deliberately simple **ELO-style rating**.

After a settled match:

```text
Win     -> +20
Loss    -> -20
Draw    ->  0
No opponent found -> 0
```

There is no K-factor calculation, provisional rating, skill tier, or probability-based adjustment.

### Why

Rating is a simple number that moves correctly after a settled match, not a sophisticated skill system.

The MVP therefore prioritizes correctness and determinism over a complex rating model.

---

## 28. Rating update rules

Rating changes happen **only after the match outcome is finalized**.

```text
Match
  |
  v
Settlement
  |
  +--> Win  -> winner +20, loser -20
  |
  +--> Draw -> both unchanged
  |
  +--> No opponent -> unchanged
```

The update must be included in the same logical settlement flow or otherwise be idempotently linked to settlement so retries cannot apply the adjustment twice.

Do not update rating merely because a player entered a match, was matched, submitted a score, or timed out. The final outcome determines the rating change.

---

## 29. Rating and matchmaking separation

Rating must never appear in matchmaking selection criteria.

Do not implement rating-range matching, rating-difference ordering, skill buckets, or equivalent logic.

The matchmaking pool is determined only by the required compatibility fields and entry order/time.

---

# Game Timer

## 30. Should the game timer be client-owned or server-authoritative?

### Decision

**Use a server-authoritative future epoch deadline.**

When a game session starts, the server provides an authoritative time reference and deadline, conceptually:

```text
serverNowEpochMs
gameStartEpochMs
gameEndEpochMs
```

The Unity client derives the visible countdown from the server deadline rather than starting its own authoritative timer.

Conceptually:

```text
estimatedServerNowMs = serverNowAtSyncMs + localMonotonicElapsedMs

remainingMs = gameEndEpochMs - estimatedServerNowMs
```

The client timer is **presentation state**, not trusted game state.

### Why

A client-owned countdown can be manipulated through device wall-clock changes, modified client builds, app pausing/freezing, time-scale manipulation, frame-rate-dependent countdown logic, or runtime modification.

An absolute server deadline gives the server a single source of truth for when gameplay should end while allowing Unity to render the timer smoothly.

The client should not continuously poll the server for timer updates during normal gameplay. One authoritative deadline is sufficient.

---

## 31. Client time synchronization

### Decision

**Do not use the device wall clock as the authoritative game clock.**

At game start, the server returns its current epoch time and the authoritative deadline. The client records a local monotonic/realtime reference and derives elapsed time from that reference.

Conceptually:

```text
Server:
    serverNowEpochMs = S
    gameEndEpochMs   = E

Client:
    localMonotonicAtSync = L

Later:
    estimatedServerNow = S + (localMonotonicNow - L)
    remaining = E - estimatedServerNow
```

If the repository already has reliable server-time synchronization, reuse it rather than creating a second time system.

### Why

Changing the phone's wall clock must not give the player extra gameplay time or end the game early merely because the local wall clock changed.

---

## 32. Timer extensions

### Decision

**Timer extensions modify the authoritative game deadline.**

For basketball:

```text
newGameEndEpochMs = currentGameEndEpochMs + bonusDurationMs
```

There should be one authoritative deadline rather than multiple countdown timers.

For example:

```text
Initial deadline
       |
       +---- basket ----> extended deadline
       |
       +---- basket ----> extended deadline
       |
       +---- deadline reached
```

The client renders the current deadline but cannot independently grant itself extra time.

Basketball grants **at most one** +5s buzzer-beater when the clock is already at zero (see §37). Ordinary makes during the run do not extend the deadline.

The exact realtime implementation should reuse the existing game/validation architecture and should not turn the asynchronous game into a realtime networked game solely for timer updates.

---

## 33. Deadline validation

### Decision

The server independently validates the game deadline when accepting the final score/submission.

The client may stop accepting normal input once its estimated server time reaches the deadline, but the server is the final authority.

Conceptually:

```text
server receives submission
        |
        v
validate game state
validate deadline
validate score
        |
        v
accept / reject
```

Client-reported `remainingTime` is untrusted metadata.

Any grace-period/latency rule must be explicit, server-side, configurable, and consistent with the existing score-validation system.

---

## 34. Pause/resume and recovery

### Decision

The authoritative deadline continues while the app is backgrounded or paused.

The client must reconstruct the remaining time from the existing deadline after resume/reload rather than starting a new countdown.

Example:

```text
Game deadline: 12:00:30

App backgrounded: 12:00:10
App resumes:     12:00:40

=> game is expired
```

A duplicate game-start request must not reset or extend an already-started game.

---

## 35. Timer implementation constraints

The timer implementation must:

- Use integer epoch milliseconds or the existing exact timestamp representation for authoritative timing.
- Never trust the client's displayed remaining time for score validation.
- Avoid `Time.deltaTime` as the authoritative game clock.
- Avoid `DateTime.UtcNow` / device wall-clock time as the authoritative client clock.
- Use a monotonic/realtime elapsed-time source for local countdown rendering.
- Preserve the existing first-basket behavior of the basketball game.
- Preserve buzzer-beater and timer-extension behavior.
- Keep deadline state stable across retries and duplicate requests.

---

# Basketball Gameplay Mechanics

## 36. Input and tap-to-lift

### Decision

The control model is **tap-to-lift**, not aim-and-release or a new shot per tap.

Each accepted press is one logical tap (`Began` only). Extra fingers do not create extra taps. Pointers over HUD / UI do not lift the ball.

Taps are accepted only while the round is **Playing** and not paused. Countdown, results, hoop relocation, and ball recovery ignore taps.

On a valid tap the physics tick:

```text
velocity.y = tapVelocity   (set, not AddForce)
velocity.x = toward the current hoop
```

Between taps, gravity acts on Y and X coasts. Rapid taps are cooldown-gated and do not stack pending impulses.

A basket counts only on a **downward** pass through the hoop (upper trigger, then lower). After a make, the hoop relocates to the opposite side at a new height. The next tap aims at the new hoop.

### Why

A single repeating tap is immediately readable on a phone and keeps the 60-second loop fast. Aiming, charging, or a continuous hold would add latency and make the run harder to parse.

---

## 37. Buzzer-beater logic

### Decision

**At most one buzzer-beater per run.** Each run starts with `hasUsedBuzzerBeater = false`.

When the presentation clock reaches `0.0`:

```text
Ball still live (in air / recovering)
AND possession can still score
AND hoop is not relocating
        |
        v
Enter buzzer window
(slow-mo, "Buzz Beater!" callout, clock shows 0)
        |
        +-- make --> +5s once, flags set, window ends, play continues
        |
        +-- miss / floor / recover / window timeout --> run ends
```

If the clock hits 0 and the ball is not live, or the hoop is moving, the run ends immediately. A second clock-zero after the bonus does not grant another +5s.

The +5s extends the **presentation** deadline only. The client cannot grant itself extra time. The server validates once-only via `hasUsedBuzzerBeater` / `buzzerBeaterTriggered` and the duration cap. Visual slow-mo must not create extra authoritative time.

### Why

The last airborne ball is the dramatic beat of the mode. Unlimited extensions would break the 60-second contract and the score-duration cap.

---

# Basketball Game Juice / Presentation

## 38. Core presentation direction

### Decision

Keep the existing **simple tap-to-shoot basketball mechanic**, but significantly improve its visual and sensory presentation rather than adding many new mechanics.

The target direction is **stylized arcade/street basketball**: energetic, readable, premium, and immediately understandable.

### Why

A polished simple loop demonstrates stronger game-design judgment than several unfinished mechanics.

The main investment should be:

```text
better art
+
better ball/hoop feel
+
better score feedback
+
better VFX/audio/haptics
+
better pacing
```

The underlying scoring, wagering, async match flow, and server authority should remain unchanged.

---

## 39. Scoring model

### Decision

Basketball scoring is intentionally simple for the MVP:

```text
Two-point basket  -> +2
Three-point basket -> +3
```

The score awarded depends on whether the made shot is a **two-pointer or three-pointer**, using the court/shooting-zone rules defined by the game.

A clean swish does **not** introduce an additional combo multiplier in the MVP. If the existing design distinguishes clean shots for presentation or a separately defined bonus, that behavior must remain explicit and must not be confused with the base two-point/three-point scoring values.

The server-authoritative score pipeline remains the source of truth for the final submitted score.

### Why

Using standard basketball point values makes the scoring immediately understandable and gives players a clear reason to attempt harder three-point shots. It also keeps the scoring system easy to validate, communicate, and balance.

Adding combo multipliers would introduce unnecessary complexity to the scoring economy and make score validation harder to reason about.

---

## 40. Future combo system

### Decision

**Do not implement score multipliers for consecutive made baskets in the MVP.**

A future version may introduce a combo system for consecutive successful shots, for example:

```text
Basket -> Combo x1
Basket -> Combo x2
Basket -> Combo x3
Miss   -> Combo resets
```

The future system should be evaluated separately from the base `+2 / +3` scoring rules and should be introduced only with explicit rules for:

- How a combo is started
- How consecutive nets are counted
- What breaks the combo
- Whether the combo affects score, time, or presentation
- Maximum multiplier/cap
- Interaction with swishes and three-pointers

For now, consecutive baskets may use stronger **visual/audio presentation** without changing the underlying score formula.

---

## 41. Gameplay feedback / juice

### Decision

Successful actions should have progressively stronger feedback.

Normal basket:

```text
+2 / +3
```

Clean swish:

```text
SWISH!
+2 / +3
```

Important streak/milestone moments may use stronger screen-space feedback where appropriate.

Juice can include:

- Score popups
- Small camera punch
- Ball squash/stretch on launch
- Ball rotation/trail
- Net deformation
- Rim/backboard impact feedback
- Small particle bursts
- Audio layering
- Selective haptics
- Future combo/momentum presentation without changing MVP scoring

The feedback should be fast enough that it never delays the next shot.

---

## 42. Hoop movement and pacing

### Decision

The moving hoop should use smooth, readable, intentional motion rather than simple constant linear movement.

Use easing, acceleration/deceleration, anticipation, short pauses, and controlled progression where practical.

Difficulty should build gradually without making the hoop feel random or unfair.

Presentation intensity can increase toward the end of a run, while preserving gameplay readability.

---

## 43. Buzzer-beater presentation

### Decision

The buzzer-beater moment should receive the strongest presentation treatment while preserving the authoritative timer rules.

Possible presentation elements:

- Short slow-motion effect
- Reduced background motion
- Music ducking / tension sound
- Stronger ball trail
- Camera emphasis
- Rim/net emphasis
- Strong haptic on a made shot
- Larger celebration on success

The visual slowdown is presentation only. It must not implicitly create extra authoritative time. Rules for when the window opens, the single +5s grant, and how a miss ends the run are in §37.

---

## 44. Art and performance

### Decision

Prefer a cohesive stylized 2D/2.5D art direction with lightweight assets suitable for mobile.

Priority order:

```text
1. Ball
2. Hoop / backboard / net
3. Court
4. Background
5. VFX / polish
```

Avoid heavyweight assets or excessive particle/overdraw cost.

Reuse/pool high-frequency temporary VFX such as score popups and particles where practical.

---

# Responsive Mobile UI / Safe Area

## 45. Safe-area handling

### Decision

The basketball UI must be **safe-area aware and responsive across modern phones**.

Critical HUD elements must remain inside `Screen.safeArea` or the project's equivalent safe-area system.

This applies to:

- Score
- Timer
- Combo
- Pause/menu controls
- Notifications
- Score popups where they can approach screen edges
- End-of-game UI
- Buzzer-beater messaging

The implementation must support devices with:

- iPhone notches
- Dynamic Island
- Android camera cutouts
- Edge-to-edge displays
- Different navigation/gesture areas
- Tall and short portrait aspect ratios

### Why

A game that looks correct on the development phone but clips the HUD on a notched or tall device is not production-ready.

---

## 46. Canvas scaling and anchors

### Decision

Use responsive Canvas scaling and anchors instead of fixed pixel positions for critical UI.

Inspect and configure the existing `CanvasScaler` appropriately for the project's portrait resolution.

Use anchors/pivots so that HUD elements remain positioned relative to the safe region.

Do not hardcode a single development-device resolution.

The gameplay composition may adapt camera framing within controlled bounds, but the player must retain clear visibility of the ball and hoop.

---

## 47. Aspect-ratio validation

### Decision

The UI and gameplay presentation should be verified against representative mobile aspect ratios, including:

```text
16:9
18:9
19.5:9
20:9
```

Also verify at least one smaller and one larger phone profile.

Test:

- Launch
- Orientation
- Pause/resume
- Background/foreground
- Scene reload
- Unity embedded in React Native
- End-game flow

The UI must not be clipped, overlap system UI, or become unusably small.

---

## 48. UI animation and safe-area constraints

### Decision

Animated feedback must respect the safe area.

Large messages such as:

```text
SWISH!
ON FIRE!
BUZZER BEATER!
```

must remain readable and must not animate underneath a notch, Dynamic Island, gesture area, or outside the visible screen.

Contextual feedback may be positioned relative to gameplay space, but it must be clamped or otherwise constrained when necessary.

---

# Summary of Matchmaking, Rating, Timer, and Presentation Decisions

| Decision | Choice |
|---|---|
| Matchmaking window | 15 minutes |
| Matchmaking pairing | First-come-first-served |
| Matchmaking criteria | Same game + same stake |
| Rating affects matchmaking | No |
| No-opponent outcome | Full stake refund + entry expiry |
| Default win when unmatched | No |
| House fills unmatched seat | No |
| Refund | Atomic + idempotent |
| Rating model | Simple ELO-style |
| Win | +20 |
| Loss | -20 |
| Draw | 0 |
| No opponent | 0 |
| K-factor / provisional rating | No |
| Skill tiers for rating | No |
| Game timer authority | Server future epoch deadline |
| Client timer | Derived/presentation only |
| Client wall clock | Not trusted |
| Timer elapsed source | Monotonic/realtime elapsed time |
| Timer extension | Extend authoritative deadline |
| Timer polling | No continuous polling |
| Deadline validation | Server |
| App pause/background | Deadline continues |
| Basketball art direction | Stylized arcade/street basketball |
| Core mechanic | Tap-to-lift + moving hoop |
| Input | One Began tap; set Y + X toward hoop; no hold/aim |
| Taps accepted | Playing only; UI / countdown / recovery ignored |
| Basket direction | Downward only (upper then lower) |
| Buzzer-beater | Once per run; clock 0 + live ball |
| Buzzer make | +5s presentation; flags set |
| Buzzer miss / timeout | Run ends |
| Scoring | Two-pointer +2; three-pointer +3 |
| MVP combo scoring | None |
| Future combos | Consecutive nets may introduce combos later |
| Juice priority | Art, feedback, VFX/audio/haptics, pacing |
| Buzzer-beater presentation | Strongest cinematic feedback |
| UI safe area | Required |
| Canvas scaling | Responsive / anchor-based |
| Notch/Dynamic Island support | Required |
| Aspect-ratio testing | 16:9, 18:9, 19.5:9, 20:9 |

# Summary of Decisions

| Decision | Choice |
|---|---|
| Boost stacking | No |
| Boost consumption | On successful eligible match entry |
| Boost expiry after entry | Terms remain valid until settlement |
| Boost financial terms | Snapshotted onto match |
| Boost percentage | Integer basis points |
| Money representation | Integer cents/paise |
| Boost funding | Separate company-funded promotional budget |
| Boost exposure | Per-match, per-player, and campaign caps |
| Boost client authority | None for validation/payout |
| Boost skill personalization | Configurable server-side rules |
| Boost new-game discovery | Higher incentive can be used |
| Boost settlement | Atomic and idempotent |
| Streak length | 3 games |
| Streak wager | One wager upfront |
| Streak target source | Ops-tunable server-side configuration |
| Streak target snapshot | Yes, at streak creation |
| Streak expiry | 24 hours |
| Unfinished streak at expiry | Failure, no refund |
| Active streaks per player | One |
| Streak payout | 2.5x total return |
| Streak payout timing | After all 3 targets are beaten |
| Streak multiplier | Fixed at 2.5x |
| Targets after wins | No immediate increase; future tiering only |
| Targets after losses | No immediate decrease; future tiering only |
| Adaptive difficulty | Future aggregated skill tiers |
| Streak score authority | Server |
| Streak settlement | Atomic and idempotent |
| Streak + 1v1 Boost | No automatic application |
| Input | Tap-to-lift; one Began tap; set Y + X toward hoop |
| Basket direction | Downward only |
| Buzzer-beater | Once per run; +5s on make; miss ends the run |

---

# Risks and Future Improvements

The MVP intentionally keeps both Boost and Streak rules simple and
server-authoritative.

Future iterations could introduce:

- A/B testing of boost percentages
- Retention-based Boost targeting
- Game-specific promotional budgets
- Fraud/abuse scoring
- More sophisticated ELO and engagement segmentation
- Personalized boost recommendations
- Campaign-level ROI reporting
- Skill-tiered Streak targets
- Dynamic target calibration from score distributions
- Streak-specific promotional boosts
- Player-facing streak history and statistics
- Consecutive-basket combo system and tuning

Any future change to target difficulty, payout multiplier, boost percentage, or
maximum wager should be evaluated against actual completion probability,
promotional/prize cost, player retention, conversion, and abuse rates before
being enabled globally.
