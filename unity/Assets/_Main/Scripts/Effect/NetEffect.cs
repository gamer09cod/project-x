using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Adds the hoop net and makes it react to a made basket.
    ///
    /// The art already shipped with the project (basketball-hoop-net.png) but
    /// was never placed in the scene; a copy lives in Resources so it can be
    /// loaded without editing Main.unity.
    ///
    /// Size and position are derived from the rim's rendered bounds at runtime
    /// rather than hardcoded offsets, so the net stays aligned regardless of the
    /// rim's authored scale.
    /// </summary>
    public sealed class NetEffect : MonoBehaviour
    {
        public const int SortingOrder = -1;

        /// <summary>Soft nylon look — off-white / light gray.</summary>
        static readonly Color NetTint = new Color(0.88f, 0.90f, 0.93f, 1f);

        const string SpritePath = "Effect/net";
        const float WidthRatio = 0.88f;
        const float VerticalOverlap = 0.12f;
        const float SettleDuration = 0.45f;

        Transform _net;
        Vector3 _restScale;
        float _elapsed = -1f;
        float _intensity;

        public void Init(Transform rim, int sortingLayerId)
        {
            if (rim == null)
            {
                return;
            }

            var rimRenderer = rim.GetComponent<SpriteRenderer>();
            if (rimRenderer == null)
            {
                return;
            }

            Sprite sprite = Resources.Load<Sprite>(SpritePath);
            if (sprite == null)
            {
                return;
            }

            var go = new GameObject("HoopNet");
            go.transform.SetParent(rim, false);

            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.color = NetTint;
            // Scene stack: Pole -3, Backboard -2, Net -1, Rim 0 (ball above).
            sr.sortingLayerID = sortingLayerId;
            sr.sortingOrder = SortingOrder;

            Vector3 spriteSize = sprite.bounds.size;
            if (spriteSize.x <= 0f || spriteSize.y <= 0f)
            {
                Object.Destroy(go);
                return;
            }

            Bounds rimBounds = rimRenderer.bounds;
            float targetWidth = rimBounds.size.x * WidthRatio;
            float scale = targetWidth / spriteSize.x;
            float netHeight = spriteSize.y * scale;

            // Convert the desired world scale into local space so the rim's own
            // scale does not double-apply.
            Vector3 lossy = rim.lossyScale;
            float sx = Mathf.Approximately(lossy.x, 0f) ? 1f : lossy.x;
            float sy = Mathf.Approximately(lossy.y, 0f) ? 1f : lossy.y;

            _net = go.transform;
            _net.localScale = new Vector3(scale / sx, scale / sy, 1f);
            _net.position = new Vector3(
                rimBounds.center.x,
                rimBounds.min.y - netHeight * 0.5f + netHeight * VerticalOverlap,
                rim.position.z);

            _restScale = _net.localScale;
        }

        /// <summary>
        /// The net is parented to the rim, not to the effect root, so destroying
        /// the root would otherwise orphan it and leave a second net behind.
        /// </summary>
        void OnDestroy()
        {
            if (_net != null)
            {
                Destroy(_net.gameObject);
            }
        }

        /// <summary>Ripple the net. Intensity 1 is an ordinary make, higher is a swish.</summary>
        public void Ripple(float intensity)
        {
            if (_net == null)
            {
                return;
            }
            _intensity = Mathf.Clamp(intensity, 0.5f, 2f);
            _elapsed = 0f;
        }

        void Update()
        {
            if (_net == null || _elapsed < 0f)
            {
                return;
            }

            _elapsed += Time.unscaledDeltaTime;

            if (_elapsed >= SettleDuration)
            {
                _elapsed = -1f;
                _net.localScale = _restScale;
                return;
            }

            float t = _elapsed / SettleDuration;

            // Damped oscillation: stretches down on impact, settles back.
            float decay = 1f - t;
            float wave = Mathf.Sin(t * Mathf.PI * 3f) * decay * decay;

            float stretchY = 1f + wave * 0.22f * _intensity;
            float squashX = 1f - wave * 0.10f * _intensity;

            _net.localScale = new Vector3(
                _restScale.x * squashX,
                _restScale.y * stretchY,
                _restScale.z);
        }
    }
}
