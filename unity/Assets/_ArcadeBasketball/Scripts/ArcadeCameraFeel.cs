using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Camera punch + layered parallax on a made basket. Arcade-only;
    /// does not use Main CameraEffect / EffectDirector.
    /// </summary>
    public sealed class ArcadeCameraFeel : MonoBehaviour
    {
        [SerializeField]
        Camera worldCamera;

        [Tooltip("Far scenery (GameBG). Lags the camera punch.")]
        [SerializeField]
        Transform farLayer;

        [Tooltip("Mid scenery (Court). Follows more than the far layer.")]
        [SerializeField]
        Transform midLayer;

        [SerializeField]
        BasketScoreDetector scoreDetector;

        [SerializeField]
        HoopGameplayConfig hoopConfig;

        Transform _cam;
        Vector3 _camRest;
        Vector3 _farRest;
        Vector3 _midRest;
        float _amplitude;
        float _duration;
        float _elapsed;
        bool _punching;
        float _farFollow = 0.28f;
        float _midFollow = 0.58f;

        void Awake()
        {
            if (worldCamera == null)
                worldCamera = Camera.main;
            _cam = worldCamera != null ? worldCamera.transform : null;
            if (_cam != null)
                _camRest = _cam.localPosition;

            if (farLayer == null)
            {
                GameObject bg = GameObject.Find("GameBG");
                if (bg != null)
                    farLayer = bg.transform;
            }

            if (midLayer == null)
            {
                GameObject court = GameObject.Find("Court");
                if (court != null)
                    midLayer = court.transform;
            }

            if (farLayer != null)
                _farRest = farLayer.localPosition;
            if (midLayer != null)
                _midRest = midLayer.localPosition;

            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();

            HoopGameplayConfig.TryGet(hoopConfig, this, out hoopConfig);
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
            ResetNow();
        }

        void LateUpdate()
        {
            if (!_punching)
                return;

            _elapsed += Time.deltaTime;
            if (_elapsed >= _duration)
            {
                ResetNow();
                return;
            }

            float falloff = 1f - (_elapsed / _duration);
            float decay = falloff * falloff;
            float angle = _elapsed * 48f;
            Vector3 offset = new Vector3(
                Mathf.Sin(angle) * _amplitude * decay,
                Mathf.Cos(angle * 1.37f) * _amplitude * decay * 0.62f
                    - _amplitude * 0.22f * decay,
                0f);

            if (_cam != null)
                _cam.localPosition = _camRest + offset;
            if (farLayer != null)
                farLayer.localPosition = _farRest + offset * _farFollow;
            if (midLayer != null)
                midLayer.localPosition = _midRest + offset * _midFollow;
        }

        void HandleBasketScored(ArcadeShotQuality quality)
        {
            if (!HoopGameplayConfig.TryGet(hoopConfig, this, out HoopGameplayConfig config))
                return;

            float amplitude = config.shakeBackboard;
            if (quality == ArcadeShotQuality.Perfect)
                amplitude = config.shakePerfect;
            else if (quality == ArcadeShotQuality.Rim)
                amplitude = config.shakeRim;

            Punch(amplitude, config.shakeDuration, config.parallaxFar, config.parallaxMid);
        }

        void Punch(float amplitude, float duration, float farFollow, float midFollow)
        {
            if (amplitude <= 0f || duration <= 0f)
                return;

            if (_punching && amplitude < _amplitude)
                return;

            _amplitude = amplitude;
            _duration = duration;
            _elapsed = 0f;
            _farFollow = farFollow;
            _midFollow = midFollow;
            _punching = true;
        }

        public void ResetNow()
        {
            _punching = false;
            if (_cam != null)
                _cam.localPosition = _camRest;
            if (farLayer != null)
                farLayer.localPosition = _farRest;
            if (midLayer != null)
                midLayer.localPosition = _midRest;
        }
    }
}
