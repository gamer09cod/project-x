using TMPro;
using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Urgency styling for the clock readout.
    ///
    /// Presentation only. This reads ShotClock.remaining and never writes to it:
    /// the play clock is derived from server epochs by AuthoritativeGameTimer
    /// and must stay the single source of truth. Nothing here may influence
    /// when the run actually ends.
    ///
    /// UI.UpdateClock still owns the text; this only touches colour and scale.
    /// </summary>
    public sealed class TimerPresenter : MonoBehaviour
    {
        const float WarnSeconds = 10f;
        const float UrgentSeconds = 5f;
        const float CriticalSeconds = 3f;

        static readonly Color Normal = new Color(0.19f, 0.19f, 0.19f, 1f);
        static readonly Color Warn = new Color(0.95f, 0.62f, 0.16f, 1f);
        static readonly Color Urgent = new Color(0.96f, 0.35f, 0.20f, 1f);
        static readonly Color Critical = new Color(1f, 0.18f, 0.18f, 1f);

        TextMeshProUGUI _clock;
        RectTransform _rect;
        Vector3 _baseScale = Vector3.one;
        Color _baseColor = Normal;
        bool _ready;

        public void Init(TextMeshProUGUI clock)
        {
            _clock = clock;
            if (_clock == null)
            {
                return;
            }

            _rect = _clock.rectTransform;
            _baseScale = _rect.localScale;
            _baseColor = _clock.color;
            _ready = true;
        }

        void LateUpdate()
        {
            if (!_ready || _clock == null)
            {
                return;
            }

            Game game = Game.Instance;
            if (game == null || game.shotClock == null || !game.shotClock.started)
            {
                Restore();
                return;
            }

            float remaining = game.shotClock.remaining;
            if (remaining > WarnSeconds)
            {
                Restore();
                return;
            }

            Color color;
            float pulseHz;
            float pulseAmount;

            if (remaining <= CriticalSeconds)
            {
                color = Critical;
                pulseHz = 6f;
                pulseAmount = 0.14f;
            }
            else if (remaining <= UrgentSeconds)
            {
                color = Urgent;
                pulseHz = 4f;
                pulseAmount = 0.09f;
            }
            else
            {
                color = Warn;
                pulseHz = 2f;
                pulseAmount = 0.05f;
            }

            _clock.color = color;

            // Pulse on the beat of the remaining second so it reads as a
            // countdown rather than generic wobble. Kept small — the ball
            // trajectory must stay the easiest thing to track.
            float pulse = 1f + Mathf.Abs(Mathf.Sin(Time.unscaledTime * Mathf.PI * pulseHz * 0.5f)) * pulseAmount;
            _rect.localScale = _baseScale * pulse;
        }

        void Restore()
        {
            if (_clock == null)
            {
                return;
            }
            _clock.color = _baseColor;
            if (_rect != null)
            {
                _rect.localScale = _baseScale;
            }
        }
    }
}
