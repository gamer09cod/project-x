using System;
using TMPro;
using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// A single pooled feedback label: pops in with a small overshoot, drifts
    /// up, fades, then returns itself to the pool.
    ///
    /// Driven by unscaled time on purpose. The buzzer window runs at
    /// Time.timeScale 0.3 and pausing sets it to 0, neither of which should
    /// make feedback crawl or freeze mid-flight.
    /// </summary>
    public sealed class ScorePopup : MonoBehaviour
    {
        const float PopDuration = 0.18f;
        const float HoldDuration = 0.22f;
        const float FadeDuration = 0.34f;
        const float RiseDistance = 46f;
        const float Overshoot = 1.18f;

        RectTransform _rect;
        TextMeshProUGUI _label;
        Action<ScorePopup> _onDone;

        Vector2 _origin;
        float _elapsed;
        float _peakScale;
        bool _playing;

        public RectTransform Rect
        {
            get { return _rect; }
        }

        public void Init(TMP_FontAsset font, Action<ScorePopup> onDone)
        {
            _rect = GetComponent<RectTransform>();
            _onDone = onDone;

            _label = GetComponent<TextMeshProUGUI>();
            if (_label == null)
            {
                _label = gameObject.AddComponent<TextMeshProUGUI>();
            }

            if (font != null)
            {
                _label.font = font;
            }

            _label.alignment = TextAlignmentOptions.Center;
            _label.raycastTarget = false;

            // Explicit centre anchoring: ScoreFeedback clamps against the safe
            // root's rect, which is symmetric about its centre, so the popup has
            // to share that space for the maths to line up.
            _rect.anchorMin = new Vector2(0.5f, 0.5f);
            _rect.anchorMax = new Vector2(0.5f, 0.5f);
            _rect.pivot = new Vector2(0.5f, 0.5f);
            _rect.sizeDelta = new Vector2(420f, 120f);

            gameObject.SetActive(false);
        }

        /// <summary>Returns false when the popup is unusable, so the caller can re-pool it.</summary>
        public bool Play(string text, Color color, float sizePx, Vector2 anchoredPosition)
        {
            if (_label == null || _rect == null)
            {
                return false;
            }

            _label.text = text;
            _label.color = color;
            _label.fontSize = sizePx;
            _label.alpha = 1f;

            _origin = anchoredPosition;
            _rect.anchoredPosition = anchoredPosition;
            _rect.localScale = Vector3.zero;

            _peakScale = 1f;
            _elapsed = 0f;
            _playing = true;
            gameObject.SetActive(true);
            return true;
        }

        void Update()
        {
            if (!_playing)
            {
                return;
            }

            _elapsed += Time.unscaledDeltaTime;

            float total = PopDuration + HoldDuration + FadeDuration;
            float scale;
            float rise;
            float alpha = 1f;

            if (_elapsed <= PopDuration)
            {
                // Ease-out with a short overshoot that settles back to 1.
                float t = Mathf.Clamp01(_elapsed / PopDuration);
                float eased = 1f - (1f - t) * (1f - t);
                scale = Mathf.LerpUnclamped(0f, _peakScale * Overshoot, eased);
                rise = 0f;
            }
            else if (_elapsed <= PopDuration + HoldDuration)
            {
                float t = Mathf.Clamp01((_elapsed - PopDuration) / HoldDuration);
                scale = Mathf.Lerp(_peakScale * Overshoot, _peakScale, t);
                rise = Mathf.Lerp(0f, RiseDistance * 0.35f, t);
            }
            else
            {
                float t = Mathf.Clamp01((_elapsed - PopDuration - HoldDuration) / FadeDuration);
                scale = _peakScale;
                rise = Mathf.Lerp(RiseDistance * 0.35f, RiseDistance, t);
                alpha = 1f - t;
            }

            _rect.localScale = new Vector3(scale, scale, 1f);
            _rect.anchoredPosition = new Vector2(_origin.x, _origin.y + rise);
            _label.alpha = alpha;

            if (_elapsed >= total)
            {
                Stop();
            }
        }

        public void Stop()
        {
            _playing = false;
            gameObject.SetActive(false);
            if (_onDone != null)
            {
                _onDone(this);
            }
        }
    }
}
