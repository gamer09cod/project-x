using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Nudges a HUD RectTransform clear of notches / Dynamic Island without
    /// reparenting (World UI Animator clips address children by path).
    ///
    /// Handles top/bottom pins, full stretch, and upper-half side pins (e.g. score
    /// anchored mid-right under a top chrome bar). When <see cref="Screen.safeArea"/>
    /// reports no cutout (common for Unity embedded in React Native), applies a
    /// minimum top inset on mobile so HUD is not flush with the status bar.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class HudSafeInset : MonoBehaviour
    {
        [Tooltip("Extra padding in canvas units applied on top of the safe area.")]
        public Vector2 extraPadding = new Vector2(12f, 16f);

        /// <summary>Fallback top inset in screen pixels when safeArea has no cutout.</summary>
        const float FallbackTopPixels = 72f;

        RectTransform _rect;
        Canvas _canvas;
        Vector2 _basePosition;
        Vector2 _baseOffsetMin;
        Vector2 _baseOffsetMax;
        bool _captured;

        Rect _lastSafeArea;
        int _lastWidth;
        int _lastHeight;
        float _lastScaleFactor = -1f;

        void Awake()
        {
            _rect = GetComponent<RectTransform>();
            _canvas = GetComponentInParent<Canvas>();
            Capture();
        }

        void OnEnable()
        {
            Capture();
            Apply(true);
        }

        void Update()
        {
            Apply(false);
        }

        void Capture()
        {
            if (_captured || _rect == null)
            {
                return;
            }
            _basePosition = _rect.anchoredPosition;
            _baseOffsetMin = _rect.offsetMin;
            _baseOffsetMax = _rect.offsetMax;
            _captured = true;
        }

        void Apply(bool force)
        {
            if (_rect == null || !_captured)
            {
                return;
            }

            Rect area = Screen.safeArea;
            float scale = (_canvas != null && _canvas.scaleFactor > 0f)
                ? _canvas.scaleFactor
                : 1f;

            if (!force
                && area == _lastSafeArea
                && Screen.width == _lastWidth
                && Screen.height == _lastHeight
                && Mathf.Approximately(scale, _lastScaleFactor))
            {
                return;
            }

            _lastSafeArea = area;
            _lastWidth = Screen.width;
            _lastHeight = Screen.height;
            _lastScaleFactor = scale;

            int w = Screen.width;
            int h = Screen.height;
            if (w <= 0 || h <= 0)
            {
                return;
            }

            float leftPx = Mathf.Max(0f, area.xMin);
            float rightPx = Mathf.Max(0f, w - area.xMax);
            float bottomPx = Mathf.Max(0f, area.yMin);
            float topPx = Mathf.Max(0f, h - area.yMax);

            // Embedded Unity often reports safeArea == full screen. Keep HUD
            // out of the status bar / camera cutout band on device.
            if (topPx < 1f && Application.isMobilePlatform)
            {
                topPx = FallbackTopPixels;
            }

            float left = leftPx / scale;
            float right = rightPx / scale;
            float bottom = bottomPx / scale;
            float top = topPx / scale;

            bool stretchY = _rect.anchorMin.y <= 0.01f && _rect.anchorMax.y >= 0.99f;
            bool stretchX = _rect.anchorMin.x <= 0.01f && _rect.anchorMax.x >= 0.99f;
            bool topPinned = Approx1(_rect.anchorMin.y) && Approx1(_rect.anchorMax.y);
            bool bottomPinned = Approx0(_rect.anchorMin.y) && Approx0(_rect.anchorMax.y);
            bool leftPinned = Approx0(_rect.anchorMin.x) && Approx0(_rect.anchorMax.x);
            bool rightPinned = Approx1(_rect.anchorMin.x) && Approx1(_rect.anchorMax.x);
            bool upperHalf = _rect.anchorMin.y >= 0.45f || _rect.anchorMax.y >= 0.55f;

            if (stretchY)
            {
                // Stretch-fill children of a HUD chip (timer panel, etc.) are not
                // screen panels. Insetting them by safe-area + padding collapses
                // a 100px box and TMP auto-size falls to its minimum.
                if (!ParentIsScreenStretch(_rect))
                {
                    return;
                }

                float minY = _baseOffsetMin.y + (bottom + extraPadding.y);
                float maxY = _baseOffsetMax.y - (top + extraPadding.y);
                float minX = stretchX
                    ? _baseOffsetMin.x + (left + extraPadding.x)
                    : _baseOffsetMin.x;
                float maxX = stretchX
                    ? _baseOffsetMax.x - (right + extraPadding.x)
                    : _baseOffsetMax.x;
                _rect.offsetMin = new Vector2(minX, minY);
                _rect.offsetMax = new Vector2(maxX, maxY);
                return;
            }

            Vector2 offset = Vector2.zero;

            if (topPinned || (!bottomPinned && upperHalf))
            {
                offset.y -= top + extraPadding.y;
            }
            else if (bottomPinned)
            {
                offset.y += bottom + extraPadding.y;
            }

            if (rightPinned)
            {
                offset.x -= right + extraPadding.x;
            }
            else if (leftPinned)
            {
                offset.x += left + extraPadding.x;
            }

            _rect.anchoredPosition = _basePosition + offset;
        }

        static bool ParentIsScreenStretch(RectTransform rect)
        {
            Transform parentT = rect.parent;
            if (parentT == null || parentT.GetComponent<Canvas>() != null)
            {
                return true;
            }

            var parent = parentT as RectTransform;
            if (parent == null)
            {
                return true;
            }

            return parent.anchorMin.y <= 0.01f && parent.anchorMax.y >= 0.99f;
        }

        static bool Approx0(float v)
        {
            return Mathf.Approximately(v, 0f);
        }

        static bool Approx1(float v)
        {
            return Mathf.Approximately(v, 1f);
        }
    }
}
