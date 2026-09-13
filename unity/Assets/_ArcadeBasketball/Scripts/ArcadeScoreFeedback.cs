using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Arcade +1 popups and score HUD. Pooled. No physics. No Main ScoreFeedback / Game.
    /// Overlay canvas has no GraphicRaycaster so taps are not stolen.
    /// Score, timer, and Buzz Beater labels are authored in the scene, not created at runtime.
    /// </summary>
    public sealed class ArcadeScoreFeedback : MonoBehaviour
    {
        const int PoolSize = 8;
        const float TimerWarnSeconds = 10f;
        const float TimerCriticalSeconds = 3f;
        const float BuzzerFontSize = 132f;
        const float BuzzerPopIn = 0.28f;
        const float BuzzerSettle = 0.2f;
        const float BuzzerPopOut = 0.18f;
        const float BuzzerPeakScale = 1.18f;
        const float WorldCalloutWidthFrac = 0.62f;
        const float WorldCalloutHeightFrac = 0.12f;
        static readonly Color TimerUrgent = new Color(1f, 0.18f, 0.18f, 1f);
        static readonly Color TimerBuzzer = new Color(1f, 0.72f, 0.2f, 1f);

        [SerializeField]
        Camera worldCamera;

        [Tooltip("Main in-game score font (Lilita One).")]
        [SerializeField]
        TMP_FontAsset hudFont;

        [Tooltip("Main score-popup font. Falls back to hudFont.")]
        [SerializeField]
        TMP_FontAsset popupFont;

        [Tooltip("World-space countdown on timer-bg. Assigned in the scene, not created at runtime.")]
        [SerializeField]
        TextMeshProUGUI timerLabel;

        [Tooltip("World-space Buzz Beater callout, sorting behind the ball. Assigned in the scene.")]
        [SerializeField]
        TextMeshProUGUI buzzerLabel;

        [Tooltip("Overlay score readout. Assigned in the scene, not created at runtime.")]
        [SerializeField]
        TextMeshProUGUI scoreLabel;

        [Tooltip("Safe-area root for pooled +N / SWISH popups.")]
        [SerializeField]
        RectTransform popupRoot;

        RectTransform _canvasRect;
        RectTransform _safeRect;
        TextMeshProUGUI _hud;
        TextMeshProUGUI _timer;
        readonly CenterCallout _buzzer = new CenterCallout();
        readonly CenterCallout _gameOver = new CenterCallout();
        Vector3 _hudRestScale = Vector3.one;
        Vector3 _timerRestScale = Vector3.one;
        float _hudBump;
        float _timerRemaining;
        int _shownTimer = int.MinValue;
        bool _timerBuzzer;
        readonly List<ArcadeScorePopup> _free = new List<ArcadeScorePopup>(PoolSize);
        readonly List<ArcadeScorePopup> _all = new List<ArcadeScorePopup>(PoolSize);

        enum CalloutAnim
        {
            Off = 0,
            In = 1,
            Settle = 2,
            Hold = 3,
            Out = 4,
        }

        void Awake()
        {
            if (worldCamera == null)
                worldCamera = Camera.main;

            if (timerLabel == null)
                Debug.LogError("ArcadeScoreFeedback: timerLabel is not assigned.", this);
            _timer = timerLabel;
            if (_timer != null)
                _timerRestScale = _timer.rectTransform.localScale;

            BindSceneHud();
            TMP_FontAsset popup = ResolveFont(popupFont);
            for (int i = 0; i < PoolSize; i++)
                _free.Add(CreatePopup(i, popup));
        }

        void Update()
        {
            if (_hud != null && _hudBump > 0f)
            {
                _hudBump -= Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(_hudBump / 0.18f);
                float scale = Mathf.Lerp(1f, 1.22f, t);
                _hud.rectTransform.localScale = _hudRestScale * scale;
            }

            PulseTimer();
            _buzzer.Tick();
            _gameOver.Tick();
        }

        public void ResetRound()
        {
            SetHud(0);
            _timerBuzzer = false;
            SetTimer(0f);
            _buzzer.HideImmediate();
            _gameOver.HideImmediate();
            StopAll();
        }

        public void SetBuzzerActive(bool active)
        {
            if (_buzzer.Label != null)
            {
                if (active)
                {
                    FitWorldCallout(_buzzer.Label);
                    _gameOver.HideImmediate();
                    _buzzer.PlayIn();
                }
                else
                    _buzzer.PlayOut();
            }

            ApplyTimerBuzzer(active);
        }

        public void ShowGameOver()
        {
            EnsureCallout(_gameOver, "GameOverCallout", "GAME OVER", Color.white);
            if (_gameOver.Label == null)
                return;

            _buzzer.HideImmediate();
            _gameOver.PlayIn();
        }

        public void SetTimer(float remainingSeconds)
        {
            if (_timer == null)
                return;

            _timerRemaining = Mathf.Max(0f, remainingSeconds);
            if (_timerBuzzer)
                return;

            int seconds = Mathf.CeilToInt(_timerRemaining);
            if (seconds == _shownTimer)
                return;

            _shownTimer = seconds;
            _timer.text = seconds.ToString();
        }

        void ApplyTimerBuzzer(bool active)
        {
            _timerBuzzer = active;
            _shownTimer = int.MinValue;
            if (_timer == null)
                return;

            if (active)
            {
                _timer.text = "+5";
                _timer.color = TimerBuzzer;
            }
        }

        void PulseTimer()
        {
            if (_timer == null)
                return;

            if (_timerBuzzer)
            {
                _timer.color = TimerBuzzer;
                float buzzerPulse = 1f + Mathf.Abs(Mathf.Sin(Time.unscaledTime * Mathf.PI * 4f)) * 0.12f;
                _timer.rectTransform.localScale = _timerRestScale * buzzerPulse;
                return;
            }

            if (_timerRemaining > TimerWarnSeconds)
            {
                _timer.color = Color.white;
                _timer.rectTransform.localScale = _timerRestScale;
                return;
            }

            _timer.color = TimerUrgent;
            if (_timerRemaining <= 0f)
            {
                _timer.rectTransform.localScale = _timerRestScale;
                return;
            }

            float pulseHz;
            float pulseAmount;
            if (_timerRemaining <= TimerCriticalSeconds && _timerRemaining > 0f)
            {
                pulseHz = 5f;
                pulseAmount = 0.12f;
            }
            else
            {
                pulseHz = 3f;
                pulseAmount = 0.08f;
            }

            float pulse = 1f + Mathf.Abs(Mathf.Sin(Time.unscaledTime * Mathf.PI * pulseHz)) * pulseAmount;
            _timer.rectTransform.localScale = _timerRestScale * pulse;
        }

        static readonly Color PointsColor = Color.white;
        static readonly Color SwishColor = new Color(1f, 0.72f, 0.2f, 1f);
        static readonly Color RimColor = new Color(0.55f, 0.9f, 1f, 1f);
        static readonly Color BankColor = new Color(0.75f, 0.95f, 0.55f, 1f);

        public void PlayBasket(int score, Vector3 worldPos, ArcadeShotQuality quality, int points)
        {
            SetHud(score);
            _hudBump = 0.18f;

            Vector2 anchor = WorldToCanvas(worldPos);
            string callout;
            Color calloutColor;
            switch (quality)
            {
                case ArcadeShotQuality.Perfect:
                    callout = "SWISH!";
                    calloutColor = SwishColor;
                    break;
                case ArcadeShotQuality.Backboard:
                    callout = "BANK!";
                    calloutColor = BankColor;
                    break;
                default:
                    callout = "RIM!";
                    calloutColor = RimColor;
                    break;
            }

            ShowPopup(callout, calloutColor, 52f, anchor + new Vector2(0f, 48f));
            ShowPopup("+" + points, PointsColor, 56f, anchor);
        }

        void ShowPopup(string text, Color color, float sizePx, Vector2 anchoredPosition)
        {
            ArcadeScorePopup popup = Take();
            if (popup == null)
                return;

            if (!popup.Play(text, color, sizePx, anchoredPosition))
                Release(popup);
        }

        public void StopAll()
        {
            for (int i = 0; i < _all.Count; i++)
            {
                if (_all[i] != null)
                    _all[i].Stop();
            }
        }

        void SetHud(int score)
        {
            if (_hud != null)
                _hud.text = score.ToString();
        }

        void BindSceneHud()
        {
            if (scoreLabel == null)
                Debug.LogError("ArcadeScoreFeedback: scoreLabel is not assigned.", this);
            _hud = scoreLabel;
            if (_hud != null)
                _hudRestScale = _hud.rectTransform.localScale;

            if (popupRoot == null)
                Debug.LogError("ArcadeScoreFeedback: popupRoot is not assigned.", this);
            _safeRect = popupRoot;

            Canvas canvas = null;
            if (_hud != null)
                canvas = _hud.GetComponentInParent<Canvas>();
            if (canvas == null && _safeRect != null)
                canvas = _safeRect.GetComponentInParent<Canvas>();
            _canvasRect = canvas != null ? canvas.transform as RectTransform : _safeRect;

            if (buzzerLabel == null)
                Debug.LogError("ArcadeScoreFeedback: buzzerLabel is not assigned.", this);
            else
            {
                FitWorldCallout(buzzerLabel);
                buzzerLabel.gameObject.SetActive(false);
                _buzzer.Bind(buzzerLabel);
            }

            EnsureCallout(_gameOver, "GameOverCallout", "GAME OVER", Color.white);
        }

        void FitWorldCallout(TextMeshProUGUI label)
        {
            if (label == null)
                return;

            Canvas canvas = label.GetComponentInParent<Canvas>();
            if (canvas == null || canvas.renderMode != RenderMode.WorldSpace)
                return;

            Camera cam = worldCamera != null ? worldCamera : canvas.worldCamera;
            if (cam == null)
                cam = Camera.main;
            if (cam == null || !cam.orthographic)
                return;

            RectTransform canvasRect = canvas.transform as RectTransform;
            if (canvasRect == null)
                return;

            float sx = Mathf.Abs(canvasRect.lossyScale.x);
            float sy = Mathf.Abs(canvasRect.lossyScale.y);
            if (sx < 0.0001f || sy < 0.0001f)
                return;

            float worldW = 2f * cam.orthographicSize * cam.aspect * WorldCalloutWidthFrac;
            float worldH = 2f * cam.orthographicSize * WorldCalloutHeightFrac;
            canvasRect.sizeDelta = new Vector2(worldW / sx, worldH / sy);

            label.enableAutoSizing = true;
            label.enableWordWrapping = false;
            label.overflowMode = TextOverflowModes.Ellipsis;
            label.fontSizeMin = 18f;
            label.fontSizeMax = 72f;
        }

        void EnsureCallout(CenterCallout callout, string name, string text, Color color)
        {
            if (callout == null || callout.Label != null)
                return;

            Transform parent = _canvasRect != null ? _canvasRect : _safeRect;
            if (parent == null)
                return;

            var go = new GameObject(name, typeof(RectTransform), typeof(TextMeshProUGUI));
            go.transform.SetParent(parent, false);

            RectTransform rect = go.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0.5f);
            rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = new Vector2(1600f, 280f);
            rect.anchoredPosition = Vector2.zero;

            TextMeshProUGUI label = go.GetComponent<TextMeshProUGUI>();
            TMP_FontAsset font = ResolveFont(hudFont);
            if (font != null)
            {
                label.font = font;
                if (font.material != null)
                    label.fontSharedMaterial = font.material;
            }

            label.text = text;
            label.fontSize = BuzzerFontSize;
            label.enableAutoSizing = false;
            label.enableWordWrapping = false;
            label.overflowMode = TextOverflowModes.Overflow;
            label.alignment = TextAlignmentOptions.Center;
            label.color = color;
            label.raycastTarget = false;
            go.SetActive(false);
            callout.Bind(label);
        }

        sealed class CenterCallout
        {
            public TextMeshProUGUI Label;
            public Vector3 RestScale = Vector3.one;
            public CalloutAnim Anim;
            public float AnimT;

            public void Bind(TextMeshProUGUI label)
            {
                Label = label;
                RestScale = label != null ? label.rectTransform.localScale : Vector3.one;
            }

            public void PlayIn()
            {
                if (Label == null)
                    return;

                Label.alpha = 1f;
                Label.rectTransform.localScale = Vector3.zero;
                Label.gameObject.SetActive(true);
                Anim = CalloutAnim.In;
                AnimT = 0f;
            }

            public void PlayOut()
            {
                if (Label == null || !Label.gameObject.activeSelf)
                {
                    HideImmediate();
                    return;
                }

                if (Anim == CalloutAnim.Out || Anim == CalloutAnim.Off)
                    return;

                Anim = CalloutAnim.Out;
                AnimT = 0f;
            }

            public void HideImmediate()
            {
                Anim = CalloutAnim.Off;
                AnimT = 0f;
                if (Label == null)
                    return;

                Label.rectTransform.localScale = RestScale;
                Label.alpha = 1f;
                Label.gameObject.SetActive(false);
            }

            public void Tick()
            {
                if (Label == null || Anim == CalloutAnim.Off || Anim == CalloutAnim.Hold)
                    return;

                AnimT += Time.unscaledDeltaTime;
                RectTransform rect = Label.rectTransform;

                if (Anim == CalloutAnim.In)
                {
                    float t = Mathf.Clamp01(AnimT / BuzzerPopIn);
                    float scale = Mathf.LerpUnclamped(0f, BuzzerPeakScale, EaseOutCubic(t));
                    rect.localScale = RestScale * scale;
                    if (t < 1f)
                        return;

                    Anim = CalloutAnim.Settle;
                    AnimT = 0f;
                    return;
                }

                if (Anim == CalloutAnim.Settle)
                {
                    float t = Mathf.Clamp01(AnimT / BuzzerSettle);
                    float scale = Mathf.Lerp(BuzzerPeakScale, 1f, EaseInCubic(t));
                    rect.localScale = RestScale * scale;
                    if (t < 1f)
                        return;

                    rect.localScale = RestScale;
                    Anim = CalloutAnim.Hold;
                    return;
                }

                float outT = Mathf.Clamp01(AnimT / BuzzerPopOut);
                rect.localScale = RestScale * Mathf.Lerp(1f, 0f, EaseInCubic(outT));
                Label.alpha = 1f - outT;
                if (outT < 1f)
                    return;

                HideImmediate();
            }
        }

        static float EaseOutCubic(float t)
        {
            float inv = 1f - t;
            return 1f - inv * inv * inv;
        }

        static float EaseInCubic(float t)
        {
            return t * t * t;
        }

        ArcadeScorePopup CreatePopup(int index, TMP_FontAsset font)
        {
            var go = new GameObject(
                "ScorePopup" + index,
                typeof(RectTransform),
                typeof(TextMeshProUGUI));
            Transform popupParent = _safeRect != null ? _safeRect : _canvasRect;
            go.transform.SetParent(popupParent, false);
            ArcadeScorePopup popup = go.AddComponent<ArcadeScorePopup>();
            popup.Init(font, Release);
            _all.Add(popup);
            return popup;
        }

        ArcadeScorePopup Take()
        {
            int last = _free.Count - 1;
            if (last < 0)
                return null;

            ArcadeScorePopup popup = _free[last];
            _free.RemoveAt(last);
            return popup;
        }

        void Release(ArcadeScorePopup popup)
        {
            if (popup != null && !_free.Contains(popup))
                _free.Add(popup);
        }

        Vector2 WorldToCanvas(Vector3 worldPos)
        {
            RectTransform root = _safeRect != null ? _safeRect : _canvasRect;
            if (root == null)
                return Vector2.zero;

            Camera cam = worldCamera != null ? worldCamera : Camera.main;
            if (cam == null)
                return Vector2.zero;

            Vector3 screen = cam.WorldToScreenPoint(worldPos);
            Vector2 local;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    root, screen, null, out local))
                return Vector2.zero;

            return ClampToSafe(local, 70f, 8f);
        }

        Vector2 ClampToSafe(Vector2 local, float headroomAbove, float headroomBelow)
        {
            RectTransform root = _safeRect != null ? _safeRect : _canvasRect;
            if (root == null)
                return local;

            Rect rect = root.rect;
            const float MarginX = 80f;
            const float MarginY = 48f;
            local.x = Mathf.Clamp(local.x, rect.xMin + MarginX, rect.xMax - MarginX);

            float minY = rect.yMin + MarginY + headroomBelow;
            float maxY = rect.yMax - MarginY - headroomAbove;
            if (minY > maxY)
                local.y = (rect.yMin + rect.yMax) * 0.5f;
            else
                local.y = Mathf.Clamp(local.y, minY, maxY);

            return local;
        }

        TMP_FontAsset ResolveFont(TMP_FontAsset assigned)
        {
            if (assigned != null)
                return assigned;
            if (hudFont != null)
                return hudFont;
            if (popupFont != null)
                return popupFont;
            return TMP_Settings.defaultFontAsset;
        }
    }
}
