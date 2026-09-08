using System;
using TMPro;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// One pooled "+1" label. Unscaled time so pause / timeScale do not freeze it.
    /// </summary>
    public sealed class ArcadeScorePopup : MonoBehaviour
    {
        const float PopDuration = 0.16f;
        const float HoldDuration = 0.18f;
        const float FadeDuration = 0.28f;
        const float Rise = 52f;

        RectTransform _rect;
        TextMeshProUGUI _label;
        Action<ArcadeScorePopup> _onDone;
        Vector2 _origin;
        float _elapsed;
        bool _playing;

        public void Init(TMP_FontAsset font, Action<ArcadeScorePopup> onDone)
        {
            _rect = GetComponent<RectTransform>();
            _label = GetComponent<TextMeshProUGUI>();
            _onDone = onDone;

            if (font != null)
                _label.font = font;

            _label.alignment = TextAlignmentOptions.Center;
            _label.raycastTarget = false;
            _rect.anchorMin = new Vector2(0.5f, 0.5f);
            _rect.anchorMax = new Vector2(0.5f, 0.5f);
            _rect.pivot = new Vector2(0.5f, 0.5f);
            _rect.sizeDelta = new Vector2(200f, 80f);
            gameObject.SetActive(false);
        }

        public bool Play(string text, Color color, float sizePx, Vector2 anchoredPosition)
        {
            if (_label == null || _rect == null)
                return false;

            _label.text = text;
            _label.color = color;
            _label.fontSize = sizePx;
            _label.alpha = 1f;
            _origin = anchoredPosition;
            _rect.anchoredPosition = anchoredPosition;
            _rect.localScale = Vector3.zero;
            _elapsed = 0f;
            _playing = true;
            gameObject.SetActive(true);
            return true;
        }

        void Update()
        {
            if (!_playing)
                return;

            _elapsed += Time.unscaledDeltaTime;
            float total = PopDuration + HoldDuration + FadeDuration;
            float scale;
            float rise;
            float alpha = 1f;

            if (_elapsed <= PopDuration)
            {
                float t = Mathf.Clamp01(_elapsed / PopDuration);
                float eased = 1f - (1f - t) * (1f - t);
                scale = Mathf.LerpUnclamped(0f, 1.16f, eased);
                rise = 0f;
            }
            else if (_elapsed <= PopDuration + HoldDuration)
            {
                float t = Mathf.Clamp01((_elapsed - PopDuration) / HoldDuration);
                scale = Mathf.Lerp(1.16f, 1f, t);
                rise = Mathf.Lerp(0f, Rise * 0.4f, t);
            }
            else
            {
                float t = Mathf.Clamp01((_elapsed - PopDuration - HoldDuration) / FadeDuration);
                scale = 1f;
                rise = Mathf.Lerp(Rise * 0.4f, Rise, t);
                alpha = 1f - t;
            }

            _rect.localScale = new Vector3(scale, scale, 1f);
            _rect.anchoredPosition = new Vector2(_origin.x, _origin.y + rise);
            _label.alpha = alpha;

            if (_elapsed >= total)
                Stop();
        }

        public void Stop()
        {
            bool wasPlaying = _playing;
            _playing = false;
            gameObject.SetActive(false);
            if (wasPlaying)
                _onDone?.Invoke(this);
        }
    }
}
