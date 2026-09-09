using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Scores a downward pass through Upper then Lower. Raises OnBasketScored; no UI.
    /// </summary>
    public sealed class BasketScoreDetector : MonoBehaviour
    {
        enum CycleState
        {
            Ready,
            UpperEntered,
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

        CycleState _state;
        bool _inUpper;
        bool _inLower;

        void Awake()
        {
            if (ballBody == null)
            {
                BasketballArcadeController ball = FindFirstObjectByType<BasketballArcadeController>();
                if (ball != null)
                    ballBody = ball.GetComponent<Rigidbody2D>();
            }

            if (ballBody == null)
                Debug.LogError("[ArcadeBasketball] BasketScoreDetector has no ball Rigidbody2D.", this);
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
            if (ballBody != null)
            {
                BasketballArcadeController arcade = ballBody.GetComponent<BasketballArcadeController>();
                if (arcade != null)
                    arcade.ClearShotContact();
            }
        }

        void FixedUpdate()
        {
            if (ScoringLocked || ballBody == null)
                return;

            float vy = ballBody.linearVelocity.y;

            if (_state == CycleState.Scored)
            {
                if (!_inUpper && !_inLower)
                    _state = CycleState.Ready;
                return;
            }

            if (_state == CycleState.Ready)
            {
                if (_inUpper && vy < 0f)
                    _state = CycleState.UpperEntered;
            }

            if (_state != CycleState.UpperEntered)
                return;

            if (!_inUpper && !_inLower)
            {
                _state = CycleState.Ready;
                return;
            }

            if (!_inLower || vy >= 0f)
                return;

            _state = CycleState.Scored;
            ArcadeShotQuality quality = ArcadeShotQuality.Perfect;
            if (ballBody != null)
            {
                BasketballArcadeController arcade = ballBody.GetComponent<BasketballArcadeController>();
                if (arcade != null)
                    quality = arcade.ClassifyShot();
            }

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
