using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Drives a RectTransform to Unity's reported safe area.
    ///
    /// Attach to a full-stretch child of a Canvas; everything parented under it
    /// stays clear of notches, Dynamic Island, camera cutouts and the home
    /// indicator. Only apply this to hierarchies no Animator drives by path —
    /// the World UI clips animate child paths and must not be reparented.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaPanel : MonoBehaviour
    {
        RectTransform _rect;
        Rect _lastSafeArea;
        int _lastWidth;
        int _lastHeight;
        ScreenOrientation _lastOrientation;

        void Awake()
        {
            _rect = GetComponent<RectTransform>();
            Apply(true);
        }

        void OnEnable()
        {
            Apply(true);
        }

        void Update()
        {
            Apply(false);
        }

        /// <summary>Current safe area as a fraction of the screen, clamped to 0..1.</summary>
        public static void GetNormalisedSafeArea(out Vector2 min, out Vector2 max)
        {
            Rect area = Screen.safeArea;
            int w = Screen.width;
            int h = Screen.height;

            if (w <= 0 || h <= 0)
            {
                min = Vector2.zero;
                max = Vector2.one;
                return;
            }

            min = new Vector2(area.xMin / w, area.yMin / h);
            max = new Vector2(area.xMax / w, area.yMax / h);

            min.x = Mathf.Clamp01(min.x);
            min.y = Mathf.Clamp01(min.y);
            max.x = Mathf.Clamp01(max.x);
            max.y = Mathf.Clamp01(max.y);

            // A degenerate rect would collapse the UI; fall back to full screen.
            if (max.x - min.x <= 0f || max.y - min.y <= 0f)
            {
                min = Vector2.zero;
                max = Vector2.one;
            }

            // Embedded Unity often reports no cutout. Keep a minimum top band on
            // mobile so feedback / overlays stay below the status bar.
            if (Application.isMobilePlatform && min.y <= 0.001f && max.y >= 0.999f)
            {
                float topFrac = Mathf.Clamp(72f / h, 0.02f, 0.12f);
                max.y = 1f - topFrac;
            }
        }

        void Apply(bool force)
        {
            if (_rect == null)
            {
                return;
            }

            Rect area = Screen.safeArea;
            if (!force
                && area == _lastSafeArea
                && Screen.width == _lastWidth
                && Screen.height == _lastHeight
                && Screen.orientation == _lastOrientation)
            {
                return;
            }

            _lastSafeArea = area;
            _lastWidth = Screen.width;
            _lastHeight = Screen.height;
            _lastOrientation = Screen.orientation;

            Vector2 min;
            Vector2 max;
            GetNormalisedSafeArea(out min, out max);

            _rect.anchorMin = min;
            _rect.anchorMax = max;
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;
        }
    }
}
