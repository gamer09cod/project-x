using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Scores only a downward pass: Upper first, then Lower, vy &lt; 0.
    /// A visit that hits Lower first (bottom-to-top) is blocked until the ball
    /// leaves both triggers.
    /// </summary>
    public sealed class BasketScoreDetector : MonoBehaviour
    {
        enum CycleState
        {
            Ready,
            UpperEntered,
            BlockedFromBelow,
            Scored,
        }

        [SerializeField]
        Rigidbody2D ballBody;

        [Tooltip("Log each made basket. Uncheck after Phase 8 validation.")]
        [SerializeField]
        bool logScores = true;

        /// <summary>Fired once per successful downward pass, with shot quality.</summary>
        public event Action<ArcadeShotQuality> OnBasketScored;

        public int CycleId { get; private set; }

        public bool ScoringLocked { get; private set; }

        public Rigidbody2D BallBody => ballBody;

        CycleState _state;
        bool _inUpper;
        bool _inLower;
        BasketballArcadeController _arcade;

        void Awake()
        {
            if (ballBody == null)
            {
                BasketballArcadeController ball = FindFirstObjectByType<BasketballArcadeController>();
                if (ball != null)
                {
                    _arcade = ball;
                    ballBody = ball.GetComponent<Rigidbody2D>();
                }
            }

            if (ballBody == null)
                Debug.LogError("[ArcadeBasketball] BasketScoreDetector has no ball Rigidbody2D.", this);
            else if (_arcade == null)
                _arcade = ballBody.GetComponent<BasketballArcadeController>();
        }

        void OnDisable()
        {
            _inUpper = false;
            _inLower = false;
            _state = CycleState.Ready;
        }

        public void SetOverlap(BasketTriggerKind kind, bool overlapping)
        {
            if (kind == BasketTriggerKind.Upper)
                _inUpper = overlapping;
            else
                _inLower = overlapping;
        }

        public void SetScoringLocked(bool locked)
        {
            ScoringLocked = locked;
        }

        /// <summary>Clears the cycle so the next dunk can score. Call after the hoop finishes relocating.</summary>
        public void BeginNewCycle()
        {
            CycleId++;
            _state = CycleState.Ready;
            if (_arcade != null)
                _arcade.ClearShotContact();
        }

        void FixedUpdate()
        {
            if (ScoringLocked || ballBody == null)
                return;

            float vy = ballBody.linearVelocity.y;
            bool clear = !_inUpper && !_inLower;

            if (_state == CycleState.Scored || _state == CycleState.BlockedFromBelow)
            {
                if (clear)
                    _state = CycleState.Ready;
                return;
            }

            if (_state == CycleState.Ready)
            {
                if (!_inUpper && !_inLower)
                    return;

                // Lower first, or both while rising: this visit came from below.
                bool fromBelow = _inLower && (!_inUpper || vy > 0f);
                if (fromBelow)
                {
                    _state = CycleState.BlockedFromBelow;
                    return;
                }

                if (_inUpper && vy < 0f)
                    _state = CycleState.UpperEntered;
            }

            if (_state != CycleState.UpperEntered)
                return;

            if (clear)
            {
                _state = CycleState.Ready;
                return;
            }

            if (!_inLower || vy >= 0f)
                return;

            _state = CycleState.Scored;
            ArcadeShotQuality quality = ArcadeShotQuality.Perfect;
            if (_arcade != null)
                quality = _arcade.ClassifyShot();

            if (logScores)
                Debug.Log($"[ArcadeBasketball] basket scored quality={quality}", this);

            OnBasketScored?.Invoke(quality);
        }

        /// <summary>Debug: fire a make without the ball passing the triggers.</summary>
        public void DebugForceScore(ArcadeShotQuality quality)
        {
            if (ScoringLocked)
                return;

            _state = CycleState.Scored;
            if (logScores)
                Debug.Log($"[ArcadeBasketball] debug basket quality={quality}", this);
            OnBasketScored?.Invoke(quality);
        }
    }
}
