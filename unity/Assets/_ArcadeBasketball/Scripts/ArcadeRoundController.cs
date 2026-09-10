using System;
using System.Collections.Generic;
using ProjectX.Gameplay;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    public struct ArcadeShotLogEntry
    {
        public int TMs;
        public string Result;
        public int PointsClaimed;
    }

    public enum ArcadeRoundState
    {
        Initializing = 0,
        Ready = 1,
        Countdown = 2,
        Playing = 3,
        RoundEnding = 4,
        Results = 5,
    }

    /// <summary>
    /// Arcade round flow for BasketBall.unity. Taps and the clock run only in Playing.
    /// Does not start Main ShotClock / Game.
    /// </summary>
    public sealed class ArcadeRoundController : MonoBehaviour
    {
        [SerializeField]
        RoundGameplayConfig roundConfig;

        [SerializeField]
        TapInputController tapInput;

        [SerializeField]
        BasketballArcadeController ball;

        [SerializeField]
        Rigidbody2D ballBody;

        [SerializeField]
        BasketScoreDetector scoreDetector;

        [Tooltip("Editor Play only. Device/embed waits for RN startRun.")]
        [SerializeField]
        bool autoStart = true;

        [Tooltip("Editor overlay: state, clock, score. No gameplay effect.")]
        [SerializeField]
        bool showEditorOverlay = true;

        [SerializeField]
        ArcadeScoreFeedback scoreFeedback;

        [SerializeField]
        HoopArcadeController hoopArcade;

        [SerializeField]
        ArcadeCameraFeel cameraFeel;

        public ArcadeRoundState State { get; private set; } = ArcadeRoundState.Initializing;

        public int Score { get; private set; }

        public float RemainingSeconds { get; private set; }

        public bool IsPaused { get; private set; }

        public IReadOnlyList<ArcadeShotLogEntry> ShotLog => _shotLog;

        public bool HasUsedBuzzerBeater { get; private set; }

        public bool BuzzerBeaterTriggered { get; private set; }

        public bool IsBuzzerActive => _buzzerActive;

        /// <summary>Clock and taps just went live (after countdown, or restart into Playing).</summary>
        public event Action OnPlayingStarted;

        /// <summary>Clock hit 0 and the round-ending beat finished. Embed host emits payload.</summary>
        public event Action OnResults;

        /// <summary>Slow-mo buzzer window started. ArcadeAudio plays the buzzer clip.</summary>
        public event Action OnBuzzerBegin;

        /// <summary>Clock expired and the round-ending beat started. Game-over sting.</summary>
        public event Action OnRoundEnding;

        /// <summary>A miss was committed to the shot log. Combo reset.</summary>
        public event Action OnMiss;

        /// <summary>BeginRound / AbortRound. Audio drops delayed stings from the previous run.</summary>
        public event Action OnRoundReset;

        enum PossessionPhase
        {
            None = 0,
            Open = 1,
            AfterMake = 2,
        }

        Vector3 _ballSpawnPosition;
        float _phaseSecondsLeft;
        AuthoritativeGameTimer _authTimer;
        float _localElapsedMs;
        PossessionPhase _possession;
        bool _missArmed;
        bool _buzzerActive;
        float _buzzerUnscaled;
        readonly List<ArcadeShotLogEntry> _shotLog = new List<ArcadeShotLogEntry>(64);

        void Awake()
        {
            RoundGameplayConfig.TryGet(roundConfig, this, out roundConfig);

            if (tapInput == null)
                tapInput = FindFirstObjectByType<TapInputController>();

            if (ball == null)
                ball = FindFirstObjectByType<BasketballArcadeController>();

            if (ballBody == null && ball != null)
                ballBody = ball.GetComponent<Rigidbody2D>();

            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();

            if (scoreFeedback == null)
                scoreFeedback = GetComponent<ArcadeScoreFeedback>();

            if (hoopArcade == null)
                hoopArcade = GetComponent<HoopArcadeController>();

            if (cameraFeel == null)
                cameraFeel = GetComponent<ArcadeCameraFeel>();

            if (ballBody != null)
                _ballSpawnPosition = ballBody.position;

            ApplyInputAndScoring(false);
            HoldBallAtSpawn();
        }

        void OnEnable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored += HandleBasketScored;
            if (ball != null)
            {
                ball.OnGroundSettled += HandleGroundSettled;
                ball.OnRecovered += HandleRecovered;
                ball.OnTapApplied += HandleTapApplied;
            }
            if (hoopArcade != null)
                hoopArcade.OnRelocateComplete += HandleRelocateComplete;
        }

        void OnDisable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored -= HandleBasketScored;
            if (ball != null)
            {
                ball.OnGroundSettled -= HandleGroundSettled;
                ball.OnRecovered -= HandleRecovered;
                ball.OnTapApplied -= HandleTapApplied;
            }
            if (hoopArcade != null)
                hoopArcade.OnRelocateComplete -= HandleRelocateComplete;

            if (IsPaused)
                SetPaused(false);
        }

        void Start()
        {
#if UNITY_EDITOR
            if (autoStart)
                BeginRound();
#endif
        }

        public void SetAuthTimer(AuthoritativeGameTimer timer)
        {
            _authTimer = timer;
        }

        /// <summary>Stop the round without Results / payload. Used by RN abortRun.</summary>
        public void AbortRound()
        {
            if (IsPaused)
                SetPaused(false);

            OnRoundReset?.Invoke();
            State = ArcadeRoundState.Initializing;
            Score = 0;
            RemainingSeconds = 0f;
            _phaseSecondsLeft = 0f;
            ClearShotLog();
            ClearBuzzer(true);
            Time.timeScale = 1f;
            ApplyInputAndScoring(false);
            if (ball != null)
                ball.ResetForNewRound();
            if (hoopArcade != null)
                hoopArcade.ResetForNewRound();
            if (cameraFeel != null)
                cameraFeel.ResetNow();
            HoldBallAtSpawn();
            if (ball != null)
                ball.ClearShotContact();
            if (scoreFeedback != null)
                scoreFeedback.ResetRound();
        }

        void Update()
        {
#if UNITY_EDITOR
            if (Input.GetKeyDown(KeyCode.P))
                SetPaused(!IsPaused);

            if (Input.GetKeyDown(KeyCode.R) && State == ArcadeRoundState.Results)
                BeginRound();
#endif

            if (IsPaused)
            {
                PushTimer();
                return;
            }

            switch (State)
            {
                case ArcadeRoundState.Countdown:
                    TickCountdown();
                    break;
                case ArcadeRoundState.Playing:
                    TickPlaying();
                    break;
                case ArcadeRoundState.RoundEnding:
                    TickRoundEnding();
                    break;
            }

            PushTimer();
        }

        public void BeginRound()
        {
            OnRoundReset?.Invoke();
            Score = 0;
            RemainingSeconds = ReadRemainingOrConfig();
            ClearShotLog();
            ClearBuzzer(true);
            IsPaused = false;
            Time.timeScale = 1f;

            State = ArcadeRoundState.Initializing;
            ApplyInputAndScoring(false);
            if (ball != null)
                ball.ResetForNewRound();
            if (hoopArcade != null)
                hoopArcade.ResetForNewRound();
            if (cameraFeel != null)
                cameraFeel.ResetNow();
            HoldBallAtSpawn();
            if (ball != null)
                ball.ClearShotContact();
            if (scoreFeedback != null)
            {
                scoreFeedback.ResetRound();
                scoreFeedback.SetTimer(RemainingSeconds);
            }

            State = ArcadeRoundState.Ready;
            EnterCountdown();
        }

        void PushTimer()
        {
            if (scoreFeedback != null)
                scoreFeedback.SetTimer(RemainingSeconds);
        }

        public void SetPaused(bool paused)
        {
            if (paused == IsPaused)
                return;

            if (paused && State != ArcadeRoundState.Playing && State != ArcadeRoundState.Countdown)
                return;

            IsPaused = paused;
            RestoreTimeScale();

            if (ballBody != null)
                ballBody.simulated = !paused && State == ArcadeRoundState.Playing;

            bool taps = !paused && State == ArcadeRoundState.Playing;
            ApplyInputAndScoring(taps);
        }

        void EnterCountdown()
        {
            State = ArcadeRoundState.Countdown;
            _phaseSecondsLeft = roundConfig != null ? roundConfig.countdownSeconds : 3f;
            ApplyInputAndScoring(false);
            HoldBallAtSpawn();
        }

        void EnterPlaying()
        {
            State = ArcadeRoundState.Playing;
            RemainingSeconds = ReadRemainingOrConfig();
            ApplyInputAndScoring(true);

            if (ballBody != null)
            {
                ballBody.simulated = true;
                ballBody.gravityScale = 0f;
            }

            OpenPossession();
            OnPlayingStarted?.Invoke();
        }

        void EnterRoundEnding()
        {
            State = ArcadeRoundState.RoundEnding;
            _phaseSecondsLeft = roundConfig != null ? roundConfig.roundEndingSeconds : 0.4f;
            ApplyInputAndScoring(false);
            OnRoundEnding?.Invoke();
        }

        void EnterResults()
        {
            State = ArcadeRoundState.Results;
            ApplyInputAndScoring(false);
            if (ballBody != null)
                ballBody.simulated = false;

            Debug.Log($"[ArcadeBasketball] results score={Score}", this);
            OnResults?.Invoke();
        }

        void TickCountdown()
        {
            _phaseSecondsLeft -= Time.deltaTime;
            if (_phaseSecondsLeft > 0f)
            {
                HoldBallAtSpawn();
                return;
            }

            EnterPlaying();
        }

        void TickPlaying()
        {
            _localElapsedMs += Time.unscaledDeltaTime * 1000f;

            if (_buzzerActive)
            {
                RemainingSeconds = 0f;
                _buzzerUnscaled += Time.unscaledDeltaTime;
                float cap = roundConfig != null ? roundConfig.buzzerMaxSeconds : 8f;
                if (_buzzerUnscaled >= cap)
                {
                    TryLogMiss();
                    FinishFromClock();
                }
                return;
            }

            if (_authTimer != null && _authTimer.IsSynced)
                RemainingSeconds = _authTimer.GetRemainingMs() / 1000f;
            else
                RemainingSeconds -= Time.deltaTime;

            if (RemainingSeconds > 0f)
                return;

            RemainingSeconds = 0f;
            OnClockExpired();
        }

        void TickRoundEnding()
        {
            _phaseSecondsLeft -= Time.deltaTime;
            if (_phaseSecondsLeft > 0f)
                return;

            EnterResults();
        }

        void HandleBasketScored(ArcadeShotQuality quality)
        {
            if (State != ArcadeRoundState.Playing || IsPaused)
                return;

            int points = 1;
            if (ball != null && ball.GameplayConfig != null)
                points = ball.GameplayConfig.PointsFor(quality);

            Score += points;
            AppendShot(true, points);
            _possession = PossessionPhase.AfterMake;
            _missArmed = false;
            if (_buzzerActive)
                ResolveBuzzerMake();
            if (scoreFeedback != null)
            {
                Vector3 at = scoreDetector != null
                    ? scoreDetector.transform.position
                    : ballBody != null ? (Vector3)ballBody.position : Vector3.zero;
                scoreFeedback.PlayBasket(Score, at, quality, points);
            }
        }

        float ReadRemainingOrConfig()
        {
            if (_authTimer != null && _authTimer.IsSynced)
                return Mathf.Max(0f, _authTimer.GetRemainingMs() / 1000f);
            return roundConfig != null ? roundConfig.roundDuration : 60f;
        }

        void HandleTapApplied()
        {
            if (State != ArcadeRoundState.Playing || IsPaused)
                return;
            if (_possession != PossessionPhase.Open)
                return;
            _missArmed = true;
        }

        void OpenPossession()
        {
            _possession = PossessionPhase.Open;
            _missArmed = false;
        }

        void ClearShotLog()
        {
            _shotLog.Clear();
            _possession = PossessionPhase.None;
            _missArmed = false;
            _localElapsedMs = 0f;
        }

        void HandleGroundSettled()
        {
            TryLogMiss();
            if (_buzzerActive)
                FinishFromClock();
        }

        void HandleRecovered()
        {
            TryLogMiss();
            if (_buzzerActive)
                FinishFromClock();
        }

        void HandleRelocateComplete()
        {
            if (State != ArcadeRoundState.Playing || IsPaused)
                return;
            OpenPossession();
        }

        void TryLogMiss()
        {
            if (State != ArcadeRoundState.Playing || IsPaused)
                return;
            if (_possession != PossessionPhase.Open || !_missArmed)
                return;

            AppendShot(false, 0);
            OnMiss?.Invoke();
            OpenPossession();
            if (_buzzerActive)
                FinishFromClock();
        }

        void AppendShot(bool make, int pointsClaimed)
        {
            int tMs = ReadElapsedMs();
            if (_shotLog.Count > 0)
            {
                int last = _shotLog[_shotLog.Count - 1].TMs;
                if (tMs < last)
                    tMs = last;
            }

            _shotLog.Add(new ArcadeShotLogEntry
            {
                TMs = tMs,
                Result = make ? "make" : "miss",
                PointsClaimed = make ? pointsClaimed : 0,
            });
        }

        int ReadElapsedMs()
        {
            if (_authTimer != null && _authTimer.IsSynced)
            {
                long elapsed = _authTimer.GetEstimatedServerNowMs() - _authTimer.GameStartEpochMs;
                if (elapsed < 0)
                    elapsed = 0;
                if (elapsed > int.MaxValue)
                    elapsed = int.MaxValue;
                return (int)elapsed;
            }

            return Mathf.Max(0, Mathf.FloorToInt(_localElapsedMs));
        }

        void OnClockExpired()
        {
            if (_buzzerActive)
                return;

            if (BallIsLive() && CanScoreThisPossession())
            {
                BeginBuzzer();
                return;
            }

            EnterRoundEnding();
        }

        bool BallIsLive()
        {
            return ball != null && (ball.IsInAir || ball.IsRecovering);
        }

        bool CanScoreThisPossession()
        {
            if (_possession != PossessionPhase.Open)
                return false;
            if (hoopArcade != null && hoopArcade.IsMoving)
                return false;
            return true;
        }

        void BeginBuzzer()
        {
            _buzzerActive = true;
            _buzzerUnscaled = 0f;
            RemainingSeconds = 0f;
            RestoreTimeScale();
            if (scoreFeedback != null)
            {
                scoreFeedback.SetBuzzerActive(true);
                scoreFeedback.SetTimer(RemainingSeconds);
            }
            OnBuzzerBegin?.Invoke();
        }

        void ResolveBuzzerMake()
        {
            if (!_buzzerActive)
                return;

            if (!HasUsedBuzzerBeater)
            {
                GrantBuzzerBonus();
                return;
            }

            FinishFromClock();
        }

        void GrantBuzzerBonus()
        {
            HasUsedBuzzerBeater = true;
            BuzzerBeaterTriggered = true;
            _buzzerActive = false;
            _buzzerUnscaled = 0f;

            float bonus = roundConfig != null ? roundConfig.buzzerBonusSeconds : 5f;
            if (bonus < 0f)
                bonus = 0f;
            long bonusMs = Mathf.RoundToInt(bonus * 1000f);
            if (_authTimer != null && _authTimer.IsSynced)
            {
                _authTimer.ExtendPresentationEndMs(bonusMs);
                RemainingSeconds = Mathf.Max(bonus, _authTimer.GetRemainingMs() / 1000f);
            }
            else
            {
                RemainingSeconds = bonus;
            }

            RestoreTimeScale();
            if (scoreFeedback != null)
            {
                scoreFeedback.SetBuzzerActive(false);
                scoreFeedback.SetTimer(RemainingSeconds);
            }
        }

        void FinishFromClock()
        {
            ClearBuzzer(false);
            if (State == ArcadeRoundState.Playing)
                EnterRoundEnding();
        }

        void ClearBuzzer(bool resetFlags)
        {
            _buzzerActive = false;
            _buzzerUnscaled = 0f;
            if (resetFlags)
            {
                HasUsedBuzzerBeater = false;
                BuzzerBeaterTriggered = false;
            }

            if (!IsPaused)
                Time.timeScale = 1f;

            if (scoreFeedback != null)
                scoreFeedback.SetBuzzerActive(false);
        }

        void RestoreTimeScale()
        {
            if (IsPaused)
            {
                Time.timeScale = 0f;
                return;
            }

            if (!_buzzerActive)
            {
                Time.timeScale = 1f;
                return;
            }

            float scale = roundConfig != null ? roundConfig.buzzerTimeScale : 0.25f;
            if (scale <= 0f)
                scale = 0.25f;
            Time.timeScale = scale;
        }

        void ApplyInputAndScoring(bool playing)
        {
            if (tapInput != null)
                tapInput.SetInputEnabled(playing);

            if (scoreDetector != null)
            {
                bool hoopBusy = hoopArcade != null && hoopArcade.IsMoving;
                scoreDetector.SetScoringLocked(!playing || hoopBusy);
            }
        }

        void HoldBallAtSpawn()
        {
            if (ballBody == null)
                return;

            ballBody.simulated = false;
            ballBody.linearVelocity = Vector2.zero;
            ballBody.angularVelocity = 0f;
            ballBody.position = _ballSpawnPosition;
        }

#if UNITY_EDITOR
        void OnGUI()
        {
            if (!showEditorOverlay)
                return;

            string clock = State == ArcadeRoundState.Countdown
                ? $"GO {Mathf.CeilToInt(Mathf.Max(0f, _phaseSecondsLeft))}"
                : $"{Mathf.CeilToInt(Mathf.Max(0f, RemainingSeconds))}";

            const float width = 280f;
            const float height = 112f;
            Rect box = new Rect(12f, 132f, width, height);
            GUI.Box(box, "Arcade round");
            GUI.Label(new Rect(20f, 152f, width - 16f, 20f),
                $"{State}{(IsPaused ? " PAUSED" : "")}{(_buzzerActive ? " BUZZER" : "")}");
            GUI.Label(new Rect(20f, 172f, width - 16f, 20f),
                $"clock {clock}   score {Score}   log {_shotLog.Count}");
            GUI.Label(new Rect(20f, 192f, width - 16f, 20f),
                "P pause   R restart results");
        }
#endif
    }
}
