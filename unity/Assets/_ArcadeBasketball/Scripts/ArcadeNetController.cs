using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Net Idle → Swish on a made basket. Visual only; no colliders.
    /// Play from time 0 so successive scores retrigger.
    /// </summary>
    public sealed class ArcadeNetController : MonoBehaviour
    {
        static readonly int SwishState = Animator.StringToHash("Swish");

        [SerializeField]
        BasketScoreDetector scoreDetector;

        [SerializeField]
        Animator netAnimator;

        [SerializeField]
        HoopGameplayConfig hoopConfig;

        Vector3 _restScale;
        float _elapsed = -1f;
        float _intensity = 1f;
        bool _useAnimator;

        void Awake()
        {
            _restScale = transform.localScale;

            if (netAnimator == null)
                netAnimator = GetComponent<Animator>();

            _useAnimator = netAnimator != null && netAnimator.runtimeAnimatorController != null;

            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();

            if (scoreDetector == null)
                Debug.LogError("[ArcadeBasketball] ArcadeNetController has no BasketScoreDetector.", this);

            HoopGameplayConfig.TryGet(hoopConfig, this, out hoopConfig);
        }

        void OnEnable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored += PlaySwish;
        }

        void OnDisable()
        {
            if (scoreDetector != null)
                scoreDetector.OnBasketScored -= PlaySwish;

            transform.localScale = _restScale;
            _elapsed = -1f;
        }

        void Update()
        {
            if (_useAnimator || _elapsed < 0f)
                return;

            if (!HoopGameplayConfig.TryGet(hoopConfig, this, out HoopGameplayConfig config))
                return;

            _elapsed += Time.deltaTime;
            if (_elapsed >= config.netSettleDuration)
            {
                _elapsed = -1f;
                transform.localScale = _restScale;
                return;
            }

            float t = _elapsed / config.netSettleDuration;
            float decay = 1f - t;
            float wave = Mathf.Sin(t * Mathf.PI * 3f) * decay * decay;
            float stretchY = 1f + wave * config.netStretch * _intensity;
            float squashX = 1f - wave * config.netSquash * _intensity;
            transform.localScale = new Vector3(
                _restScale.x * squashX,
                _restScale.y * stretchY,
                _restScale.z);
        }

        void PlaySwish(ArcadeShotQuality quality)
        {
            _intensity = 1f;
            if (HoopGameplayConfig.TryGet(hoopConfig, this, out HoopGameplayConfig config)
                && quality == ArcadeShotQuality.Perfect)
                _intensity = config.netPerfectIntensity;

            if (_useAnimator)
            {
                netAnimator.Play(SwishState, 0, 0f);
                return;
            }

            _elapsed = 0f;
        }
    }
}
