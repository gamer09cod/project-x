using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Flight trail for the ball, plus temporary sorting so the ball can draw
    /// behind the net while falling through the rim.
    ///
    /// Deliberately does NOT drive squash/stretch: BallThrow.anim already
    /// animates the ball's scale (1.9 -> 0.75) through an Animator, and a second
    /// scale driver would fight it every frame. The launch "pop" therefore stays
    /// owned by the existing clip; this adds only what does not conflict.
    ///
    /// The trail is short and thin so it reads as motion without obscuring the
    /// trajectory the player is tracking.
    /// </summary>
    public sealed class BallEffect : MonoBehaviour
    {
        static readonly Color TrailWarm = new Color(1f, 0.55f, 0.15f, 0.55f);
        static readonly Color TrailHot = new Color(1f, 0.82f, 0.3f, 0.85f);

        /// <summary>Scene stack: Pole -3, Backboard -2, Net -1, Rim 0.</summary>
        const int NettedBallOrder = NetEffect.SortingOrder - 1;

        TrailRenderer _trail;
        SpriteRenderer _ballRenderer;
        Transform _ball;
        float _hotUntil;

        int _restBallOrder;
        int _restTrailOrder;
        bool _behindNet;

        public void Init(Transform ball, int sortingLayerId, int ballSortingOrder)
        {
            _ball = ball;
            if (_ball == null)
            {
                return;
            }

            _ballRenderer = _ball.GetComponent<SpriteRenderer>();
            _restBallOrder = ballSortingOrder;
            if (_ballRenderer != null)
            {
                _restBallOrder = _ballRenderer.sortingOrder;
            }

            var go = new GameObject("BallTrail");
            go.transform.SetParent(_ball, false);
            go.transform.localPosition = Vector3.zero;

            _trail = go.AddComponent<TrailRenderer>();
            _trail.time = 0.22f;
            _trail.startWidth = 0.30f;
            _trail.endWidth = 0f;
            _trail.minVertexDistance = 0.05f;
            _trail.autodestruct = false;
            _trail.emitting = false;
            _trail.numCapVertices = 4;
            _trail.alignment = LineAlignment.View;

            Shader shader = Shader.Find("Sprites/Default");
            if (shader != null)
            {
                _trail.material = new Material(shader);
            }

            _trail.startColor = TrailWarm;
            _trail.endColor = new Color(TrailWarm.r, TrailWarm.g, TrailWarm.b, 0f);

            // Strictly behind the ball sprite so the ball stays the focal point.
            // Equal orders would leave the draw order between them undefined.
            _trail.sortingLayerID = sortingLayerId;
            _restTrailOrder = _restBallOrder - 1;
            _trail.sortingOrder = _restTrailOrder;
            _behindNet = false;
        }

        /// <summary>
        /// Draw the ball under the net (Order -2) while it falls through the rim.
        /// Rim stays at 0 so it still occludes the top of the ball.
        /// </summary>
        public void SetBehindNet(bool behind)
        {
            if (_behindNet == behind)
            {
                return;
            }

            _behindNet = behind;

            if (_ballRenderer != null)
            {
                _ballRenderer.sortingOrder = behind ? NettedBallOrder : _restBallOrder;
            }

            if (_trail != null)
            {
                _trail.sortingOrder = behind ? NettedBallOrder - 1 : _restTrailOrder;
            }
        }

        public void SetEmitting(bool emitting)
        {
            if (_trail == null)
            {
                return;
            }

            if (emitting)
            {
                _trail.Clear();
            }
            _trail.emitting = emitting;
        }

        /// <summary>Brief brighter trail after a clean make.</summary>
        public void FlashHot(float seconds)
        {
            _hotUntil = Time.unscaledTime + Mathf.Max(0f, seconds);
        }

        void Update()
        {
            if (_trail == null)
            {
                return;
            }

            bool hot = Time.unscaledTime < _hotUntil;
            Color target = hot ? TrailHot : TrailWarm;

            _trail.startColor = target;
            _trail.endColor = new Color(target.r, target.g, target.b, 0f);
        }

        public void ClearTrail()
        {
            if (_trail != null)
            {
                _trail.Clear();
                _trail.emitting = false;
            }
        }

        /// <summary>
        /// The trail is parented to the ball, not to the effect root, so
        /// destroying the root would otherwise orphan it and a reinstall would
        /// stack a second trail on the ball.
        /// </summary>
        void OnDestroy()
        {
            SetBehindNet(false);
            if (_trail != null)
            {
                Destroy(_trail.gameObject);
            }
        }
    }
}
