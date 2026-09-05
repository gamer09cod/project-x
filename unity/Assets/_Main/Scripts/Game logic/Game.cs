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
        // Ranked embed waits for RN startRun; arcade mode freezes until first make.
        if (!embedMatchMode)
            shotClock.ResetFrozen();
    }

    void Update()
    {
        if (embedMatchMode && shotClock != null && shotClock.started && !paused)
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
    /// project-x RN handshake. Starts the 60s clock immediately; ends with scorePayload.
    /// </summary>
    public void BeginEmbedMatch(
        float durationSeconds,
        string clientRunId,
        string unityBuildId,
        Action<string> onScorePayloadEnvelope)
    {
        embedMatchMode = true;
        _embedClientRunId = clientRunId ?? "";
        _embedUnityBuildId = unityBuildId ?? "";
        _embedOnFinished = onScorePayloadEnvelope;
        hasUsedBuzzerBeater = false;
        buzzerBeaterTriggered = false;
        _embedElapsed = 0f;
        _embedLog.Clear();

        continued = false;
        stage = 0;
        if (Progress.Instance != null)
        {
            Progress.Instance.gameCoins = 0;
            Progress.Instance.score = 0;
        }

        Resume();
        UpdateGame();
        float seconds = durationSeconds > 0f ? durationSeconds : (config != null ? config.gameTime : 60f);
        shotClock.StartClock(seconds);
        ui?.UpdateScores(true);
        ui?.UpdateClock();
    }

    /// <summary>
    /// RN left / remounted before scorePayload. Do not emit a payload — server owns zero.
    /// </summary>
    public void CancelEmbedMatch()
    {
        if (!embedMatchMode)
            return;
        _embedOnFinished = null;
        embedMatchMode = false;
        _embedLog.Clear();
        shotClock?.ResetFrozen();
        Pause();
    }

    public void AddPoint()
    {
        ShotQuality quality = ClassifyShot();
        int p = config.PointsFor(quality);
        Progress.Instance.SetScore(p);
        if (stage == 2) Progress.Instance.SetCoins(p);

        if (embedMatchMode)
            AppendEmbedShot(true, p);

        if (!shotClock.started)
            shotClock.StartClock(config.gameTime);

        if (shotClock.isBuzzerBeater)
            shotClock.ResolveBuzzerMake();

        ui.UpdateScores();
        GameAudio.Instance?.PlayScore(quality);
        if (quality == ShotQuality.Perfect)
            CameraShake.PlayPerfect();
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
    }

    public void GameOver()
    {
        shotClock.SetInFlight(false);
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
    }

    public void Resume()
    {
        paused = false;
        Time.timeScale = 1;
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
        // Stop input / clock; RN will unmount UnityView on scorePayload.
        Pause();
        cb(payload);
    }

    static string EscapeJson(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
