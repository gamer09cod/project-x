using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Graded camera punch. Deliberately small: the player is aiming, so the
    /// frame has to stay stable. A swish reads stronger than an ordinary make
    /// through amplitude, not duration.
    ///
    /// This is the single owner of camera position offsets. The legacy
    /// CameraShake is disabled at install time so the two cannot fight.
    /// </summary>
    public sealed class CameraEffect : MonoBehaviour
    {
        public const float LightAmplitude = 0.045f;
        public const float MediumAmplitude = 0.085f;
        public const float StrongAmplitude = 0.16f;

        Transform _camera;
        Vector3 _basePosition;

        float _amplitude;
        float _duration;
        float _elapsed;
        bool _shaking;

        public void Init(Camera cam)
        {
            if (cam == null)
            {
                return;
            }
            _camera = cam.transform;
            _basePosition = _camera.localPosition;
        }

        public void Punch(float amplitude, float duration)
        {
            if (_camera == null || amplitude <= 0f || duration <= 0f)
            {
                return;
            }

            // Re-punching mid-shake takes the stronger of the two rather than
            // stacking, so rapid scoring cannot compound into a screen-wrecker.
            if (_shaking && amplitude < _amplitude)
            {
                return;
            }

            _amplitude = amplitude;
            _duration = duration;
            _elapsed = 0f;
            _shaking = true;
        }

        void LateUpdate()
        {
            if (!_shaking || _camera == null)
            {
                return;
            }

            _elapsed += Time.unscaledDeltaTime;

            if (_elapsed >= _duration)
            {
                _shaking = false;
                _camera.localPosition = _basePosition;
                return;
            }

            float falloff = 1f - (_elapsed / _duration);
            float decay = falloff * falloff;
            float angle = _elapsed * 46f;

            float x = Mathf.Sin(angle) * _amplitude * decay;
            float y = Mathf.Cos(angle * 1.37f) * _amplitude * decay * 0.6f;

            _camera.localPosition = new Vector3(
                _basePosition.x + x,
                _basePosition.y + y,
                _basePosition.z);
        }

        /// <summary>Snap back immediately — used on run reset.</summary>
        public void ResetNow()
        {
            _shaking = false;
            if (_camera != null)
            {
                _camera.localPosition = _basePosition;
            }
        }
    }
}
