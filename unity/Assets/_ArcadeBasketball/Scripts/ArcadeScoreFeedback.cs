using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Arcade +1 popups and score HUD. Pooled. No physics. No Main ScoreFeedback / Game.
    /// Overlay canvas has no GraphicRaycaster so taps are not stolen.
    /// Score and timer labels are authored in the scene, not created at runtime.
    /// </summary>
    public sealed class ArcadeScoreFeedback : MonoBehaviour
    {
        const int PoolSize = 8;
        const float TimerWarnSeconds = 10f;
        const float TimerCriticalSeconds = 3f;
        static readonly Color TimerUrgent = new Color(1f, 0.18f, 0.18f, 1f);

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
        TextMeshProUGUI _buzzerCallout;
        Vector3 _hudRestScale = Vector3.one;
        Vector3 _timerRestScale = Vector3.one;
        float _hudBump;
        float _timerRemaining;
        int _shownTimer = int.MinValue;
        readonly List<ArcadeScorePopup> _free = new List<ArcadeScorePopup>(PoolSize);
        readonly List<ArcadeScorePopup> _all = new List<ArcadeScorePopup>(PoolSize);

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
        }

        public void ResetRound()
        {
            SetHud(0);
            SetTimer(0f);
            SetBuzzerActive(false);
            StopAll();
        }

        public void SetBuzzerActive(bool active)
        {
            EnsureBuzzerCallout();
            if (_buzzerCallout != null)
                _buzzerCallout.gameObject.SetActive(active);
        }

        public void SetTimer(float remainingSeconds)
        {
            if (_timer == null)
                return;

            _timerRemaining = Mathf.Max(0f, remainingSeconds);
            int seconds = Mathf.CeilToInt(_timerRemaining);
            if (seconds == _shownTimer)
                return;

            _shownTimer = seconds;
            _timer.text = seconds.ToString();
        }

        void PulseTimer()
        {
            if (_timer == null)
                return;

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
            EnsureBuzzerCallout();
        }

        void EnsureBuzzerCallout()
        {
            if (_buzzerCallout != null)
                return;

            Transform parent = _canvasRect != null ? _canvasRect : _safeRect;
            if (parent == null)
                return;

            var go = new GameObject("BuzzerCallout", typeof(RectTransform), typeof(TextMeshProUGUI));
            go.transform.SetParent(parent, false);

            RectTransform rect = go.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0.62f);
            rect.anchorMax = new Vector2(0.5f, 0.62f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = new Vector2(920f, 140f);
            rect.anchoredPosition = Vector2.zero;

            TextMeshProUGUI label = go.GetComponent<TextMeshProUGUI>();
            TMP_FontAsset font = ResolveFont(hudFont);
            if (font != null)
            {
                label.font = font;
                if (font.material != null)
                    label.fontSharedMaterial = font.material;
            }

            label.text = "Buzz Beater!";
            label.fontSize = 72f;
            label.alignment = TextAlignmentOptions.Center;
            label.color = SwishColor;
            label.raycastTarget = false;
            go.SetActive(false);
            _buzzerCallout = label;
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
