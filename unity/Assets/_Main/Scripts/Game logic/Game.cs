using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

public class Game : MonoBehaviour
{
    public static Game Instance
    {
        get
        {
            if (!instance)
                instance = FindFirstObjectByType<Game>();

            return instance;
        }
    }

    private static Game instance;

    public const int STAGE_1 = 5;
    public const int STAGE_2 = 15;
    public const float RESET_DURATION = 0.25f;
    public const float EmbedBuzzerBonusSeconds = 5f;

    [NonSerialized]
    public bool paused = false;
    [NonSerialized]
    public bool continued = false;
    [NonSerialized]
    public int stage = 0;
    [NonSerialized]
    public GameConfig config;
    [NonSerialized]
    public ShotClock shotClock;

    /// <summary>project-x ranked embed: gated by RN startRun, emits scorePayload.</summary>
    [NonSerialized]
    public bool embedMatchMode;

    [NonSerialized]
    public bool hasUsedBuzzerBeater;

    [NonSerialized]
    public bool buzzerBeaterTriggered;

    /// <summary>Server-synced play clock (embed). Null when idle.</summary>
    [NonSerialized]
    public ProjectX.Gameplay.AuthoritativeGameTimer authTimer;

    public UI ui;
    public Ball ball;
    public Hoop hoop;

    string _embedClientRunId;
    string _embedUnityBuildId;
    float _embedElapsed;
    Action<string> _embedOnFinished;
    readonly List<EmbedShot> _embedLog = new List<EmbedShot>();

    struct EmbedShot
    {
        public int TMs;
        public string Result;
        public int PointsClaimed;
    }

    protected void Awake()
    {
        instance = this;
        config = GameConfig.Load();
        shotClock = GetComponent<ShotClock>();
        if (!shotClock)
            shotClock = gameObject.AddComponent<ShotClock>();
        shotClock.Bind(this);
    }

    protected void Start()
    {
        if (Progress.Instance != null && Progress.Instance.currentBallSkin != null)
            ball.SetSkin(Progress.Instance.currentBallSkin);
        ui.UpdateScores(true);
        // Mobile embed always has RnBridge and waits for RN startRun / BeginEmbedMatch.
        // Starting arcade here would play BGM (and the clock) before the ranked run,
        // so the user hears music twice when startRun enables audio again.
        if (!embedMatchMode && !Application.isMobilePlatform)
            StartArcadeClock();
    }

    void StartArcadeClock()
    {
        float seconds = config != null && config.gameTime > 0f ? config.gameTime : 60f;
        shotClock.StartClockExact(seconds);
        GameAudio.Instance?.SetGameplayActive(true);
    }

    void Update()
    {
        // Must mirror ShotClock.Update's guard: the buzzer window runs at
        // timeScale 0.3 with input blocked, so its wall time is not run time.
        // Unscaled delta is deliberate — a lowered timeScale must not buy budget.
        if (embedMatchMode && shotClock != null && shotClock.started && !paused
            && !shotClock.frozen && !shotClock.isBuzzerBeater)
            _embedElapsed += Time.unscaledDeltaTime;
    }

    public void UpdateGame()
    {
        ball.UpdateBall();
        hoop.UpdateHoop();
        shotClock.SetInFlight(false);
    }

    public ShotQuality ClassifyShot()
    {
        if (!ball.touchedRim && !ball.touchedBackboard)
            return ShotQuality.Perfect;
        if (ball.touchedRim)
            return ShotQuality.Hoop;
        return ShotQuality.Backboard;
    }

    /// <summary>
    /// Snap playfield to a fresh embed idle. Synchronous — do not use arcade ResetGame.
    /// </summary>
    public void ResetPlayfieldForEmbed()
    {
        _embedOnFinished = null;
        _embedClientRunId = "";
        _embedUnityBuildId = "";
        _embedElapsed = 0f;
        _embedLog.Clear();
        hasUsedBuzzerBeater = false;
        buzzerBeaterTriggered = false;
        continued = false;
        stage = 0;
        if (Progress.Instance != null)
        {
            Progress.Instance.gameCoins = 0;
            Progress.Instance.score = 0;
        }

        if (ball != null)
        {
            LeanTween.cancel(ball.gameObject);
            ball.StopAllCoroutines();
            ball.UpdateBall();
        }

        // The run can end while the quit card is open (RN abortRun on unmount).
        // Closes the hosting panel too, so a rematch cannot start behind it.
        ui?.CloseQuitUI();
        hoop?.ResetToIdle();
        shotClock?.ResetFrozen();
        shotClock?.SetInFlight(false);
        if (authTimer != null)
            authTimer.Clear();
        // Unpause the simulation only — do not touch GameAudio here.
        // CancelEmbedMatch will Pause (mute); BeginEmbedMatch enables BGM once.
        paused = false;
        Time.timeScale = 1f;
        ui?.UpdateScores(true);
        ui?.UpdateClock();
    }

    /// <summary>
    /// project-x RN handshake. Play clock starts immediately from server epochs.
    /// </summary>
    public void BeginEmbedMatch(
        long serverNowEpochMs,
        long gameStartEpochMs,
        long gameEndEpochMs,
        string clientRunId,
        string unityBuildId,
        Action<string> onScorePayloadEnvelope)
    {
        ResetPlayfieldForEmbed();
        embedMatchMode = true;
        _embedClientRunId = clientRunId ?? "";
        _embedUnityBuildId = unityBuildId ?? "";
        _embedOnFinished = onScorePayloadEnvelope;

        if (authTimer == null)
            authTimer = new ProjectX.Gameplay.AuthoritativeGameTimer();
        authTimer.Sync(serverNowEpochMs, gameStartEpochMs, gameEndEpochMs);
        shotClock.StartClockFromAuthTimer(authTimer);
        ui?.UpdateScores(true);
        ui?.UpdateClock();
        GameAudio.Instance?.SetGameplayActive(true);
        ProjectX.Effect.EffectEvents.RaiseRunStarted();
    }

    /// <summary>Legacy float duration — derives a sync from now (tests / stub only).</summary>
    public void BeginEmbedMatch(
        float durationSeconds,
        string clientRunId,
        string unityBuildId,
        Action<string> onScorePayloadEnvelope)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        long durMs = (long)(Mathf.Max(0f, durationSeconds) * 1000f);
        if (durMs <= 0)
            durMs = 60_000;
        BeginEmbedMatch(now, now, now + durMs, clientRunId, unityBuildId, onScorePayloadEnvelope);
    }

    /// <summary>
    /// RN left / remounted before scorePayload, or next startRun after a finished payload.
    /// Do not emit a payload — server owns zero on abort.
    /// </summary>
    public void CancelEmbedMatch()
    {
        // Without this, an aborted run leaves the ball trail emitting and
        // popups animating until the next run starts.
        ProjectX.Effect.EffectEvents.RaiseRunEnded();
        ResetPlayfieldForEmbed();
        embedMatchMode = false;
        Pause();
    }

    /// <summary>
    /// True while an early quit is a legal action: a ranked run is live and no
    /// shot is unresolved. Quitting mid-flight would append the attempt to the
    /// shot log after the payload had already been built.
    /// </summary>
    public bool CanQuitEmbedRun()
    {
        if (!embedMatchMode || _embedOnFinished == null)
            return false;
        if (shotClock == null)
            return false;
        return !shotClock.inFlight && !shotClock.isBuzzerBeater;
    }

    /// <summary>
    /// Player confirmed an early exit. The run ends here and the score they
    /// already have is submitted, using the same payload path as the clock
    /// running out — the server still owns settlement either way.
    /// </summary>
    public bool QuitEmbedRun()
    {
        if (!CanQuitEmbedRun())
            return false;

        shotClock.SetInFlight(false);
        ProjectX.Effect.EffectEvents.RaiseRunEnded();
        EmitEmbedScorePayload();

        // Leave no live timer behind: without this the clock stays bound and
        // started, so any later Resume would restart a real countdown that ends
        // in the arcade game-over screen behind RN's result screen.
        shotClock.ResetFrozen();
        return true;
    }

    public void AddPoint()
    {
        ShotQuality quality = ClassifyShot();
        int p = config.PointsFor(quality);
        Progress.Instance.SetScore(p);
        if (stage == 2) Progress.Instance.SetCoins(p);

        if (embedMatchMode)
            AppendEmbedShot(true, p);

        // Raised before the buzzer can resolve: ResolveBuzzerMake may end the
        // run, and this basket's feedback must not play over the game-over
        // screen. Camera punch comes from the effect layer, which grades it by
        // shot quality and combo — CameraShake is disabled at install so the
        // two never write the camera transform together.
        ProjectX.Effect.EffectEvents.RaiseBasket(
            quality, p, hoop != null ? hoop.transform.position : transform.position);

        if (!shotClock.started)
            shotClock.StartClock(config.gameTime);

        if (shotClock.isBuzzerBeater)
            shotClock.ResolveBuzzerMake();

        ui.UpdateScores();
        GameAudio.Instance?.PlayScore(quality);
        UpdateStage();
    }

    public void UpdateStage()
    {
        int score = Progress.Instance.score;

        if (stage == 0 && score >= STAGE_1 && score < STAGE_2)
        {
            stage = 1;
            Progress.Instance.SetCoins(1);
        }
        else if (stage == 1 && score >= STAGE_2)
        {
            stage = 2;
            Progress.Instance.SetCoins(3);
        }
        else if (stage == 2)
        {
            hoop.IncreaseSpeed(0.035f);
        }
    }

    public void OnShotMissed()
    {
        shotClock.SetInFlight(false);
        ProjectX.Effect.EffectEvents.RaiseMiss();

        if (embedMatchMode)
            AppendEmbedShot(false, 0);

        if (shotClock.isBuzzerBeater)
        {
            shotClock.ResolveBuzzerMiss();
            return;
        }

        if (shotClock.started && shotClock.remaining <= 0)
            OnClockExpired();
    }

    public void OnClockExpired()
    {
        if (paused)
            return;
        if (shotClock.inFlight || shotClock.isBuzzerBeater)
            return;
        GameOver();
    }

    public IEnumerator ResetGame()
    {
        continued = false;
        Progress.Instance.gameCoins = Progress.Instance.score = stage = 0;
        UpdateGame();
        shotClock.ResetFrozen();

        yield return new WaitForSecondsRealtime(AnimationDurations.GAME_OVER_OUT);

        ui.UpdateScores(true);
        ui.gameOver.uicb.VerifyState();
        ball.animator.updateMode = AnimatorUpdateMode.UnscaledTime;

        yield return new WaitForSecondsRealtime(AnimationDurations.RESET_SCORE);

        Resume();
        ball.animator.updateMode = AnimatorUpdateMode.Normal;
        if (!embedMatchMode)
            StartArcadeClock();
    }

    public void GameOver()
    {
        ui?.CloseQuitUI();
        shotClock.SetInFlight(false);
        ProjectX.Effect.EffectEvents.RaiseRunEnded();
        if (embedMatchMode)
        {
            EmitEmbedScorePayload();
            return;
        }

        Pause();
        ui.GameOver();
    }

    public void Pause()
    {
        paused = true;
        Time.timeScale = 0;
        GameAudio.Instance?.SetGameplayActive(false);
    }

    public void Resume()
    {
        paused = false;
        Time.timeScale = 1;
        GameAudio.Instance?.SetGameplayActive(true);
    }

    public void ContinueOnce()
    {
        if (embedMatchMode)
            return;
        if (continued)
            return;

        continued = true;
        shotClock.GrantContinue(config.clockContinueSeconds);
        ui.Continue();
    }

    public void NotifyThrow()
    {
        shotClock.SetInFlight(true);
        GameAudio.Instance?.PlayThrow();
        ProjectX.Effect.EffectEvents.RaiseLaunch();
    }

    void AppendEmbedShot(bool make, int points)
    {
        int tMs = Mathf.Max(0, Mathf.FloorToInt(_embedElapsed * 1000f));
        if (_embedLog.Count > 0 && tMs < _embedLog[_embedLog.Count - 1].TMs)
            tMs = _embedLog[_embedLog.Count - 1].TMs;
        _embedLog.Add(new EmbedShot
        {
            TMs = tMs,
            Result = make ? "make" : "miss",
            PointsClaimed = points,
        });
    }

    void EmitEmbedScorePayload()
    {
        if (_embedOnFinished == null)
            return;

        int durationMs = Mathf.Max(0, Mathf.FloorToInt(_embedElapsed * 1000f));
        int score = Progress.Instance != null ? Progress.Instance.score : 0;
        var sb = new StringBuilder(512);
        sb.Append("{\"v\":1,\"type\":\"scorePayload\",\"payload\":{");
        sb.Append("\"schemaVersion\":1,");
        sb.Append("\"score\":").Append(score).Append(',');
        sb.Append("\"durationMs\":").Append(durationMs).Append(',');
        sb.Append("\"clockEndedAtMs\":").Append(durationMs).Append(',');
        sb.Append("\"hasUsedBuzzerBeater\":").Append(hasUsedBuzzerBeater ? "true" : "false").Append(',');
        sb.Append("\"buzzerBeaterTriggered\":").Append(buzzerBeaterTriggered ? "true" : "false").Append(',');
        sb.Append("\"shotLog\":[");
        for (int i = 0; i < _embedLog.Count; i++)
        {
            if (i > 0) sb.Append(',');
            var s = _embedLog[i];
            sb.Append("{\"tMs\":").Append(s.TMs)
                .Append(",\"result\":\"").Append(s.Result)
                .Append("\",\"pointsClaimed\":").Append(s.PointsClaimed)
                .Append('}');
        }
        sb.Append("],");
        sb.Append("\"clientRunId\":\"").Append(EscapeJson(_embedClientRunId)).Append("\",");
        sb.Append("\"unityBuildId\":\"").Append(EscapeJson(_embedUnityBuildId)).Append('"');
        sb.Append("}}");

        var payload = sb.ToString();
        var cb = _embedOnFinished;
        _embedOnFinished = null;
        embedMatchMode = false;
        // Stop input / clock; RN keeps Unity mounted (paused) behind result/tabs.
        Pause();
        cb(payload);
    }

    static string EscapeJson(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
