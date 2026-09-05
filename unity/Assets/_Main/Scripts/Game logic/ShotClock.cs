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
        game.ui?.UpdateClock();
    }

    public void StartClock(float seconds)
    {
        remaining = Mathf.Max(remaining, seconds);
        frozen = false;
        started = true;
        game.ui?.UpdateClock();
    }

    public void AddTime(float seconds)
    {
        remaining += seconds;
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
        if (game == null || game.paused || frozen || isBuzzerBeater || !started)
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
            return;
        }

        remaining = 0;
        game.GameOver();
    }

    public void ResolveBuzzerMiss()
    {
        EndBuzzerVisual();
        isBuzzerBeater = false;
        inFlight = false;
        game.GameOver();
    }

    void EndBuzzerVisual()
    {
        if (Time.timeScale != 1f && !game.paused)
            Time.timeScale = 1f;
    }
}
