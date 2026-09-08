using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Arcade +1 popups and score HUD. Pooled. No physics. No Main ScoreFeedback / Game.
    /// Canvas has no GraphicRaycaster so taps are not stolen.
    /// </summary>
    public sealed class ArcadeScoreFeedback : MonoBehaviour
    {
        const int PoolSize = 8;

        [SerializeField]
        Camera worldCamera;

        RectTransform _canvasRect;
        TextMeshProUGUI _hud;
        Vector3 _hudRestScale = Vector3.one;
        float _hudBump;
        readonly List<ArcadeScorePopup> _free = new List<ArcadeScorePopup>(PoolSize);

        void Awake()
        {
            if (worldCamera == null)
                worldCamera = Camera.main;

            BuildCanvas();
            TMP_FontAsset font = TMP_Settings.defaultFontAsset;
            for (int i = 0; i < PoolSize; i++)
                _free.Add(CreatePopup(i, font));
        }

        void Update()
        {
            if (_hud == null || _hudBump <= 0f)
                return;

            _hudBump -= Time.unscaledDeltaTime;
            float t = Mathf.Clamp01(_hudBump / 0.18f);
            float scale = Mathf.Lerp(1f, 1.22f, t);
            _hud.rectTransform.localScale = _hudRestScale * scale;
        }

        public void ResetRound()
        {
            SetHud(0);
            StopAll();
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
            ArcadeScorePopup[] popups = GetComponentsInChildren<ArcadeScorePopup>(true);
            for (int i = 0; i < popups.Length; i++)
            {
                if (popups[i] != null)
                    popups[i].Stop();
            }
        }

        void SetHud(int score)
        {
            if (_hud != null)
                _hud.text = score.ToString();
        }

        void BuildCanvas()
        {
            var canvasGo = new GameObject("ArcadeScoreCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler));
            canvasGo.transform.SetParent(transform, false);

            Canvas canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 20;

            CanvasScaler scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            _canvasRect = canvasGo.GetComponent<RectTransform>();

            var hudGo = new GameObject("ScoreHud", typeof(RectTransform), typeof(TextMeshProUGUI));
            hudGo.transform.SetParent(canvasGo.transform, false);
            RectTransform hudRect = hudGo.GetComponent<RectTransform>();
            hudRect.anchorMin = new Vector2(0.5f, 1f);
            hudRect.anchorMax = new Vector2(0.5f, 1f);
            hudRect.pivot = new Vector2(0.5f, 1f);
            hudRect.anchoredPosition = new Vector2(0f, -36f);
            hudRect.sizeDelta = new Vector2(280f, 96f);

            _hud = hudGo.GetComponent<TextMeshProUGUI>();
            TMP_FontAsset font = TMP_Settings.defaultFontAsset;
            if (font != null)
                _hud.font = font;
            _hud.alignment = TextAlignmentOptions.Center;
            _hud.fontSize = 64f;
            _hud.color = Color.white;
            _hud.raycastTarget = false;
            _hud.text = "0";
            _hudRestScale = hudRect.localScale;
        }

        ArcadeScorePopup CreatePopup(int index, TMP_FontAsset font)
        {
            var go = new GameObject(
                "ScorePopup" + index,
                typeof(RectTransform),
                typeof(TextMeshProUGUI));
            go.transform.SetParent(_canvasRect, false);
            ArcadeScorePopup popup = go.AddComponent<ArcadeScorePopup>();
            popup.Init(font, Release);
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
            if (_canvasRect == null)
                return Vector2.zero;

            Camera cam = worldCamera != null ? worldCamera : Camera.main;
            if (cam == null)
                return Vector2.zero;

            Vector3 screen = cam.WorldToScreenPoint(worldPos);
            Vector2 local;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    _canvasRect, screen, null, out local))
                return Vector2.zero;

            return local;
        }
    }
}
