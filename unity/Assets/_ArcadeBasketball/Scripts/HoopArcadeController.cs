using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// After a score and a floor bounce, the hoop slides in from off-screen
    /// on the other side at a random Y. It does not travel across the court.
    /// </summary>
    public sealed class HoopArcadeController : MonoBehaviour
    {
        /// <summary>Hoop started sliding in from off-screen.</summary>
        public event Action OnHoopMove;

        /// <summary>Hoop finished sliding onto the new side.</summary>
        public event Action OnRelocateComplete;

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

        ArcadeRoundController _round;

        bool _atLeft = true;
        bool _pendingRelocation;
        bool _relocating;
        int _moveGen;
        float _hoopY;

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

            _round = GetComponent<ArcadeRoundController>();

            HoopGameplayConfig.TryGet(hoopConfig, this, out hoopConfig);
            _atLeft = true;
            ApplyStartHeight();
            SnapToRest();
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

            Transform destAnchor = _atLeft ? rightAnchor : leftAnchor;
            if (destAnchor == null || hoop == null)
                return;

            RollHoopY();
            Vector3 dest = RestLocal(destAnchor);
            _relocating = true;

            LeanTween.cancel(hoop.gameObject);

            OnHoopMove?.Invoke();

            hoop.localScale = destAnchor.localScale;

            float fromXSign = dest.x >= 0f ? 1f : -1f;
            Vector3 start = dest;
            start.x += fromXSign * config.enterDistance;
            hoop.localPosition = start;

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            int gen = ++_moveGen;
            LeanTween.moveLocal(hoop.gameObject, dest, config.moveDuration)
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

            SnapToRest();

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            if (scoreDetector != null)
            {
                scoreDetector.BeginNewCycle();
                ApplyScoringLock();
            }

            OnRelocateComplete?.Invoke();
        }

        /// <summary>Cancel a slide and snap to the current side. Safe to call from BeginRound.</summary>
        public void ResetForNewRound()
        {
            _moveGen++;
            if (hoop != null)
                LeanTween.cancel(hoop.gameObject);

            _pendingRelocation = false;
            _relocating = false;
            _atLeft = true;
            ApplyStartHeight();
            SnapToRest();

            if (ball != null && hoopTarget != null)
                ball.SetTargetHoop(hoopTarget);

            if (scoreDetector != null)
                scoreDetector.BeginNewCycle();
        }

        void RollHoopY()
        {
            if (!HoopGameplayConfig.TryGet(hoopConfig, this, out HoopGameplayConfig config))
                return;

            float min = config.hoopYMin;
            float max = config.hoopYMax;
            if (max < min)
            {
                float swap = min;
                min = max;
                max = swap;
            }

            _hoopY = Mathf.Approximately(min, max) ? min : UnityEngine.Random.Range(min, max);
        }

        void ApplyStartHeight()
        {
            _hoopY = hoopConfig != null ? hoopConfig.hoopYStart : 0.3f;
        }

        void SnapToRest()
        {
            Transform rest = _atLeft ? leftAnchor : rightAnchor;
            if (hoop == null || rest == null)
                return;

            hoop.localPosition = RestLocal(rest);
            hoop.localScale = rest.localScale;
        }

        Vector3 RestLocal(Transform anchor)
        {
            if (anchor == null)
                return default;

            Vector3 local = anchor.localPosition;
            local.y = _hoopY;
            return local;
        }

        Vector3 RestPosition(Transform anchor)
        {
            if (anchor == null)
                return default;

            Vector3 local = RestLocal(anchor);
            Transform parent = anchor.parent;
            return parent != null ? parent.TransformPoint(local) : local;
        }

        void ApplyScoringLock()
        {
            if (scoreDetector == null)
                return;

            ArcadeRoundController round = _round;
            bool allowScore = !_pendingRelocation && !_relocating
                && (round == null
                    || (round.State == ArcadeRoundState.Playing && !round.IsPaused));
            scoreDetector.SetScoringLocked(!allowScore);
        }

        public bool AtLeft => _atLeft;

        public bool IsMoving => _relocating || _pendingRelocation;

        public Vector3 DebugHoopPosition => hoop != null ? hoop.position : transform.position;

        public Vector3 DebugLeftAnchor => RestPosition(leftAnchor);

        public Vector3 DebugRightAnchor => RestPosition(rightAnchor);

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

            RollHoopY();
            SnapToRest();

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
