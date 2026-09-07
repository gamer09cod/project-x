using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Pooled, safe-area-clamped scoring feedback.
    ///
    /// Popups are positioned from the scoring position in world space, then
    /// clamped so they can never animate under a notch or off-screen. The pool
    /// is pre-warmed so a hot streak never allocates mid-run.
    /// </summary>
    public sealed class ScoreFeedback : MonoBehaviour
    {
        const int PoolSize = 10;

        static readonly Color PointsColor = new Color(1f, 1f, 1f, 1f);
        static readonly Color SwishColor = new Color(1f, 0.72f, 0.2f, 1f);
        static readonly Color ComboColor = new Color(0.45f, 0.85f, 1f, 1f);
        static readonly Color MilestoneColor = new Color(1f, 0.36f, 0.26f, 1f);

        RectTransform _root;
        Camera _worldCamera;
        Camera _uiCamera;
        TMP_FontAsset _font;

        readonly List<ScorePopup> _free = new List<ScorePopup>(PoolSize);

        public void Init(RectTransform root, Camera worldCamera, Camera uiCamera, TMP_FontAsset font)
        {
            _root = root;
            _worldCamera = worldCamera;
            _uiCamera = uiCamera;
            _font = font;

            for (int i = 0; i < PoolSize; i++)
            {
                _free.Add(CreatePopup(i));
            }
        }

        ScorePopup CreatePopup(int index)
        {
            var go = new GameObject("ScorePopup" + index, typeof(RectTransform), typeof(TextMeshProUGUI));
            go.transform.SetParent(_root, false);

            var popup = go.AddComponent<ScorePopup>();
            popup.Init(_font, Release);
            return popup;
        }

        void Release(ScorePopup popup)
        {
            if (popup != null && !_free.Contains(popup))
            {
                _free.Add(popup);
            }
        }

        ScorePopup Take()
        {
            int last = _free.Count - 1;
            if (last < 0)
            {
                // Every popup is in flight. Steal nothing and skip this one
                // rather than allocating during a run.
                return null;
            }

            ScorePopup popup = _free[last];
            _free.RemoveAt(last);
            return popup;
        }

        // Line offsets from the anchor. Kept as constants because the clamp has
        // to reserve exactly this much headroom to keep the stack on screen.
        const float TopLine = 70f;
        const float MidLine = -2f;
        const float ComboLine = -64f;

        /// <summary>Feedback for a made basket, escalating with quality and combo.</summary>
        public void ShowBasket(ShotQuality quality, int points, Vector3 worldPos, int combo)
        {
            // One anchor for the whole stack, clamped with room reserved for the
            // highest and lowest lines. Clamping each line separately would keep
            // them all on screen but collapse them onto the same point near an
            // edge, so the lines would overlap instead of stacking.
            Vector2 anchor = WorldToClamped(worldPos, TopLine, -ComboLine);

            if (quality == ShotQuality.Perfect)
            {
                Show("SWISH!", SwishColor, 84f, anchor + new Vector2(0f, TopLine));
                Show("+" + points, PointsColor, 62f, anchor + new Vector2(0f, MidLine));
            }
            else
            {
                Show("+" + points, PointsColor, 66f, anchor + new Vector2(0f, TopLine));
            }

            if (combo >= 2)
            {
                Show("COMBO x" + combo, ComboColor, 52f, anchor + new Vector2(0f, ComboLine));
            }
        }

        /// <summary>Large centred announcement (milestones, buzzer beater).</summary>
        public void ShowMilestone(string text)
        {
            float y = 180f;

            // Upper third reads best, but never outside the safe region.
            if (_root != null)
            {
                Rect rect = _root.rect;
                y = Mathf.Clamp(y, rect.yMin + MarginY, rect.yMax - MarginY);
            }

            Show(text, MilestoneColor, 92f, new Vector2(0f, y));
        }

        public void Show(string text, Color color, float sizePx, Vector2 anchoredPosition)
        {
            ScorePopup popup = Take();
            if (popup == null)
            {
                return;
            }

            if (!popup.Play(text, color, sizePx, anchoredPosition))
            {
                // Never leak a popup out of the pool — ten silent losses would
                // stop feedback for the rest of the session.
                Release(popup);
            }
        }

        /// <summary>Clears everything in flight. Used on run start/end.</summary>
        public void StopAll()
        {
            var popups = GetComponentsInChildren<ScorePopup>(true);
            for (int i = 0; i < popups.Length; i++)
            {
                if (popups[i] != null)
                {
                    popups[i].Stop();
                }
            }
        }

        const float MarginX = 220f;
        const float MarginY = 110f;

        /// <summary>
        /// Projects a world position into the safe-area rect and clamps it so
        /// the whole feedback stack stays visible on every aspect ratio.
        /// Headroom reserves space for lines drawn above and below the anchor.
        /// </summary>
        Vector2 WorldToClamped(Vector3 worldPos, float headroomAbove, float headroomBelow)
        {
            if (_root == null)
            {
                return Vector2.zero;
            }

            Camera cam = _worldCamera != null ? _worldCamera : Camera.main;
            if (cam == null)
            {
                return Vector2.zero;
            }

            Vector3 screenPoint = cam.WorldToScreenPoint(worldPos);

            Vector2 local;
            // The canvas is Screen Space - Camera, so its camera is required
            // here; passing null would misplace every popup.
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    _root, screenPoint, _uiCamera, out local))
            {
                return Vector2.zero;
            }

            Rect rect = _root.rect;

            local.x = Mathf.Clamp(local.x, rect.xMin + MarginX, rect.xMax - MarginX);

            float minY = rect.yMin + MarginY + headroomBelow;
            float maxY = rect.yMax - MarginY - headroomAbove;

            // On a short screen the reserved band can exceed the safe height;
            // centring is the least-bad answer and still never clips.
            local.y = minY > maxY
                ? (rect.yMin + rect.yMax) * 0.5f
                : Mathf.Clamp(local.y, minY, maxY);

            return local;
        }
    }
}
