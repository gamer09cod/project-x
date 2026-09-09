using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
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

        /// <summary>Clock and taps just went live (after countdown, or restart into Playing).</summary>
        public event Action OnPlayingStarted;

        Vector3 _ballSpawnPosition;
        float _phaseSecondsLeft;

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
        }

        void OnEnable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored += HandleBasketScored;
        }

        void OnDisable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored -= HandleBasketScored;

            if (IsPaused)
                SetPaused(false);
        }

        void Start()
        {
            if (autoStart)
                BeginRound();
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
            Score = 0;
            RemainingSeconds = roundConfig != null ? roundConfig.roundDuration : 60f;
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
            Time.timeScale = paused ? 0f : 1f;

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
            RemainingSeconds = roundConfig != null ? roundConfig.roundDuration : 60f;
            ApplyInputAndScoring(true);

            if (ballBody != null)
            {
                ballBody.simulated = true;
                ballBody.gravityScale = 0f;
            }

            OnPlayingStarted?.Invoke();
        }

        void EnterRoundEnding()
        {
            State = ArcadeRoundState.RoundEnding;
            _phaseSecondsLeft = roundConfig != null ? roundConfig.roundEndingSeconds : 0.4f;
            ApplyInputAndScoring(false);
        }

        void EnterResults()
        {
            State = ArcadeRoundState.Results;
            ApplyInputAndScoring(false);
            if (ballBody != null)
                ballBody.simulated = false;

            Debug.Log($"[ArcadeBasketball] results score={Score}", this);
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
            RemainingSeconds -= Time.deltaTime;
            if (RemainingSeconds > 0f)
                return;

            RemainingSeconds = 0f;
            EnterRoundEnding();
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
            if (scoreFeedback != null)
            {
                Vector3 at = scoreDetector != null
                    ? scoreDetector.transform.position
                    : ballBody != null ? (Vector3)ballBody.position : Vector3.zero;
                scoreFeedback.PlayBasket(Score, at, quality, points);
            }
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
            const float height = 92f;
            Rect box = new Rect(12f, 132f, width, height);
            GUI.Box(box, "Arcade round");
            GUI.Label(new Rect(20f, 152f, width - 16f, 20f),
                $"{State}{(IsPaused ? " PAUSED" : "")}");
            GUI.Label(new Rect(20f, 172f, width - 16f, 20f),
                $"clock {clock}   score {Score}");
            GUI.Label(new Rect(20f, 192f, width - 16f, 20f),
                "P pause   R restart results");
        }
#endif
    }
}
