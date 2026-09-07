using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Nudges a single HUD element inside the safe area without touching the
    /// hierarchy.
    ///
    /// The World UI canvas is driven by an Animator whose clips address children
    /// by transform path, so wrapping those children in a safe-area container
    /// would silently break every animation. This shifts the element's
    /// anchoredPosition instead, which no clip in this project animates.
    ///
    /// The offset is derived from the element's own anchors, so it only insets
    /// the edges it is actually pinned to.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class HudSafeInset : MonoBehaviour
    {
        [Tooltip("Extra padding in canvas units applied on top of the safe area.")]
        public Vector2 extraPadding = new Vector2(12f, 12f);

        RectTransform _rect;
        Canvas _canvas;
        Vector2 _basePosition;
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

        /// <summary>
        /// Remember the authored position once so repeated applies stay
        /// idempotent rather than compounding the inset every frame.
        /// </summary>
        void Capture()
        {
            if (_captured || _rect == null)
            {
                return;
            }
            _basePosition = _rect.anchoredPosition;
            _captured = true;
        }

        void Apply(bool force)
        {
            if (_rect == null || !_captured)
            {
                return;
            }

            Rect area = Screen.safeArea;

            // scaleFactor is part of the dirty check because the inset is
            // divided by it. CanvasScaler may not have resolved it on the first
            // enabled frame, and without this the wrong value would stick.
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

            // Pixel insets per edge, converted into canvas units.
            float left = Mathf.Max(0f, area.xMin) / scale;
            float right = Mathf.Max(0f, w - area.xMax) / scale;
            float bottom = Mathf.Max(0f, area.yMin) / scale;
            float top = Mathf.Max(0f, h - area.yMax) / scale;

            Vector2 offset = Vector2.zero;

            if (Mathf.Approximately(_rect.anchorMax.y, 1f) && Mathf.Approximately(_rect.anchorMin.y, 1f))
            {
                offset.y -= top + extraPadding.y;
            }
            else if (Mathf.Approximately(_rect.anchorMax.y, 0f) && Mathf.Approximately(_rect.anchorMin.y, 0f))
            {
                offset.y += bottom + extraPadding.y;
            }

            if (Mathf.Approximately(_rect.anchorMax.x, 1f) && Mathf.Approximately(_rect.anchorMin.x, 1f))
            {
                offset.x -= right + extraPadding.x;
            }
            else if (Mathf.Approximately(_rect.anchorMax.x, 0f) && Mathf.Approximately(_rect.anchorMin.x, 0f))
            {
                offset.x += left + extraPadding.x;
            }

            _rect.anchoredPosition = _basePosition + offset;
        }
    }
}
