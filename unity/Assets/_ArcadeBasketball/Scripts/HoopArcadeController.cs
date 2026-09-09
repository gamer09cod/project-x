using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// After a score and a floor bounce, the hoop slides in from off-screen
    /// on the other side. It does not travel across the court.
    /// </summary>
    public sealed class HoopArcadeController : MonoBehaviour
    {
        /// <summary>Hoop started sliding in from off-screen.</summary>
        public event Action OnHoopMove;

        [SerializeField]
        Transform hoop;

        [SerializeField]
        Transform hoopTarget;

        [SerializeField]
        Transform leftAnchor;

        [SerializeField]
        Transform rightAnchor;

        [SerializeField]
        BasketScoreDetector scoreDetector;

        [SerializeField]
        BasketballArcadeController ball;

        [SerializeField]
        HoopGameplayConfig hoopConfig;

        bool _atLeft = true;
        bool _pendingRelocation;
        bool _relocating;

        void Awake()
        {
            if (hoop == null)
                Debug.LogError("[ArcadeBasketball] HoopArcadeController needs the hoop transform.", this);
            if (leftAnchor == null || rightAnchor == null)
                Debug.LogError("[ArcadeBasketball] HoopArcadeController needs left and right anchors.", this);
            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();
            if (scoreDetector == null)
                Debug.LogError("[ArcadeBasketball] HoopArcadeController needs BasketScoreDetector.", this);
            if (ball == null)
                ball = FindFirstObjectByType<BasketballArcadeController>();

            HoopGameplayConfig.TryGet(hoopConfig, this, out hoopConfig);
        }

        void OnEnable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored += HandleBasketScored;

            if (ball != null)
                ball.OnGroundHit += HandleGroundHit;

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);
        }

        void OnDisable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored -= HandleBasketScored;

            if (ball != null)
                ball.OnGroundHit -= HandleGroundHit;

            if (hoop != null)
                LeanTween.cancel(hoop.gameObject);

            _pendingRelocation = false;
            _relocating = false;
        }

        void HandleBasketScored(ArcadeShotQuality _)
        {
            if (_pendingRelocation || _relocating || hoop == null || leftAnchor == null || rightAnchor == null)
                return;

            _pendingRelocation = true;
            if (scoreDetector != null)
                scoreDetector.SetScoringLocked(true);
        }

        void HandleGroundHit()
        {
            if (!_pendingRelocation || _relocating)
                return;

            _pendingRelocation = false;
            SlideInFromOffscreen();
        }

        void SlideInFromOffscreen()
        {
            if (!HoopGameplayConfig.TryGet(hoopConfig, this, out HoopGameplayConfig config))
                return;

            Transform dest = _atLeft ? rightAnchor : leftAnchor;
            _relocating = true;

            LeanTween.cancel(hoop.gameObject);

            OnHoopMove?.Invoke();

            hoop.localScale = dest.localScale;

            float fromXSign = dest.position.x >= 0f ? 1f : -1f;
            Vector3 start = dest.position;
            start.x += fromXSign * config.enterDistance;
            hoop.position = start;

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            LeanTween.move(hoop.gameObject, dest.position, config.moveDuration)
                .setEaseOutCubic()
                .setOnComplete(OnSlideInComplete);
        }

        void OnSlideInComplete()
        {
            _atLeft = !_atLeft;
            _relocating = false;

            Transform rest = _atLeft ? leftAnchor : rightAnchor;
            if (rest != null)
            {
                hoop.position = rest.position;
                hoop.localScale = rest.localScale;
            }

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            if (scoreDetector == null)
                return;

            scoreDetector.BeginNewCycle();

            ArcadeRoundController round = GetComponent<ArcadeRoundController>();
            bool allowScore = round == null
                || (round.State == ArcadeRoundState.Playing && !round.IsPaused);
            scoreDetector.SetScoringLocked(!allowScore);
        }
    }
}
