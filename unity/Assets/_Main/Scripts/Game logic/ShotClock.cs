using UnityEngine;

public class ShotClock : MonoBehaviour
{
    public const float BuzzerTimeScale = 0.3f;

    public bool frozen { get; private set; } = true;
    public bool started { get; private set; }
    public bool inFlight { get; private set; }
    public bool isBuzzerBeater { get; private set; }
    public float remaining { get; private set; }

    Game game;
    ProjectX.Gameplay.AuthoritativeGameTimer _authTimer;

    public void Bind(Game owner)
    {
        game = owner;
    }

    public void ResetFrozen()
    {
        EndBuzzerVisual();
        frozen = true;
        started = false;
        inFlight = false;
        isBuzzerBeater = false;
        remaining = 0;
        _authTimer = null;
        game.ui?.UpdateClock();
    }

    public void StartClock(float seconds)
    {
        _authTimer = null;
        remaining = Mathf.Max(remaining, seconds);
        frozen = false;
        started = true;
        game.ui?.UpdateClock();
    }

    /// <summary>Embed startRun: assign remaining, do not keep leftover time.</summary>
    public void StartClockExact(float seconds)
    {
        _authTimer = null;
        remaining = Mathf.Max(0f, seconds);
        frozen = false;
        started = true;
        game.ui?.UpdateClock();
    }

    /// <summary>Ranked embed: countdown from server epoch deadline.</summary>
    public void StartClockFromAuthTimer(ProjectX.Gameplay.AuthoritativeGameTimer timer)
    {
        _authTimer = timer;
        frozen = false;
        started = true;
        remaining = timer != null ? Mathf.Max(0f, timer.GetRemainingMs() / 1000f) : 0f;
        game.ui?.UpdateClock();
    }

    public void AddTime(float seconds)
    {
        if (_authTimer != null)
        {
            long bonusMs = (long)(Mathf.Max(0f, seconds) * 1000f);
            _authTimer.ExtendPresentationEndMs(bonusMs);
            remaining = Mathf.Max(0f, _authTimer.GetRemainingMs() / 1000f);
        }
        else
        {
            remaining += seconds;
        }
        if (remaining > 0)
            frozen = false;
        game.ui?.UpdateClock();
    }

    public void GrantContinue(float seconds)
    {
        EndBuzzerVisual();
        isBuzzerBeater = false;
        inFlight = false;
        StartClock(seconds);
    }

    public void SetInFlight(bool value)
    {
        inFlight = value;
    }

    public bool BlocksNewShot()
    {
        if (game.paused || isBuzzerBeater)
            return true;
        // Embed: clock already running from startRun — block only when expired and not in flight.
        if (game.embedMatchMode)
        {
            if (started && remaining <= 0 && !inFlight)
                return true;
            return false;
        }
        if (started && remaining <= 0 && !inFlight)
            return true;
        return false;
    }

    void Update()
    {
        if (game == null || frozen || !started)
            return;

        if (_authTimer != null && game.embedMatchMode)
        {
            // Authoritative path: monotonic server estimate — keeps ticking while app is backgrounded.
            remaining = Mathf.Max(0f, _authTimer.GetRemainingMs() / 1000f);
            if (!game.paused && !isBuzzerBeater)
                game.ui?.UpdateClock();

            if (isBuzzerBeater || remaining > 0f)
                return;

            remaining = 0f;
            if (inFlight)
                BeginBuzzer();
            else if (!game.paused)
                game.OnClockExpired();
            return;
        }

        if (game.paused || isBuzzerBeater)
            return;

        remaining -= Time.deltaTime;
        game.ui?.UpdateClock();

        if (remaining > 0)
            return;

        remaining = 0;
        if (inFlight)
            BeginBuzzer();
        else
            game.OnClockExpired();
    }

    void BeginBuzzer()
    {
        if (isBuzzerBeater)
            return;

        isBuzzerBeater = true;
        float scale = game.config != null ? game.config.buzzerTimeScale : BuzzerTimeScale;
        if (scale <= 0f)
            scale = BuzzerTimeScale;
        Time.timeScale = scale;
        GameAudio.Instance?.PlayBuzzer();
        ProjectX.Effect.EffectEvents.RaiseBuzzerBegin();
    }

    public void ResolveBuzzerMake()
    {
        EndBuzzerVisual();
        isBuzzerBeater = false;
        inFlight = false;

        // project-x ranked: one +5s extension (skill / Phase 6). Arcade ends on buzzer make.
        if (game.embedMatchMode && !game.hasUsedBuzzerBeater)
        {
            game.hasUsedBuzzerBeater = true;
            game.buzzerBeaterTriggered = true;
            AddTime(Game.EmbedBuzzerBonusSeconds);
            ProjectX.Effect.EffectEvents.RaiseBuzzerResolved(true, true);
            return;
        }

        // Made, but no extension: announce the make without promising time.
        ProjectX.Effect.EffectEvents.RaiseBuzzerResolved(true, false);
        remaining = 0;
        game.GameOver();
    }

    public void ResolveBuzzerMiss()
    {
        EndBuzzerVisual();
        isBuzzerBeater = false;
        inFlight = false;
        ProjectX.Effect.EffectEvents.RaiseBuzzerResolved(false, false);
        game.GameOver();
    }

    void EndBuzzerVisual()
    {
        if (Time.timeScale != 1f && !game.paused)
            Time.timeScale = 1f;
    }
}
