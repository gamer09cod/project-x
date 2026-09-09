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
        int _moveGen;

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

            _moveGen++;
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

            int gen = ++_moveGen;
            LeanTween.move(hoop.gameObject, dest.position, config.moveDuration)
                .setEaseOutCubic()
                .setOnComplete(() =>
                {
                    if (gen != _moveGen)
                        return;
                    OnSlideInComplete();
                });
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
            ApplyScoringLock();
        }

        /// <summary>Cancel a slide and snap to the current side. Safe to call from BeginRound.</summary>
        public void ResetForNewRound()
        {
            _moveGen++;
            if (hoop != null)
                LeanTween.cancel(hoop.gameObject);

            _pendingRelocation = false;
            _relocating = false;

            Transform rest = _atLeft ? leftAnchor : rightAnchor;
            if (hoop != null && rest != null)
            {
                hoop.position = rest.position;
                hoop.localScale = rest.localScale;
            }

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            if (scoreDetector != null)
                scoreDetector.BeginNewCycle();
        }

        void ApplyScoringLock()
        {
            if (scoreDetector == null)
                return;

            ArcadeRoundController round = GetComponent<ArcadeRoundController>();
            bool allowScore = !_pendingRelocation && !_relocating
                && (round == null
                    || (round.State == ArcadeRoundState.Playing && !round.IsPaused));
            scoreDetector.SetScoringLocked(!allowScore);
        }

        public bool AtLeft => _atLeft;

        public bool IsMoving => _relocating || _pendingRelocation;

        public Vector3 DebugHoopPosition => hoop != null ? hoop.position : transform.position;

        public Vector3 DebugLeftAnchor => leftAnchor != null ? leftAnchor.position : default;

        public Vector3 DebugRightAnchor => rightAnchor != null ? rightAnchor.position : default;

        public Vector3 DebugHoopTarget => hoopTarget != null ? hoopTarget.position : default;

        /// <summary>Debug: cancel a slide and snap to an anchor.</summary>
        public void DebugSnapToSide(bool left)
        {
            if (hoop == null || leftAnchor == null || rightAnchor == null)
                return;

            LeanTween.cancel(hoop.gameObject);
            _moveGen++;
            _pendingRelocation = false;
            _relocating = false;
            _atLeft = left;

            Transform rest = _atLeft ? leftAnchor : rightAnchor;
            hoop.position = rest.position;
            hoop.localScale = rest.localScale;

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            if (scoreDetector == null)
                return;

            scoreDetector.BeginNewCycle();
            ApplyScoringLock();
        }

        public void DebugFlipSide()
        {
            DebugSnapToSide(!_atLeft);
        }
    }
}
