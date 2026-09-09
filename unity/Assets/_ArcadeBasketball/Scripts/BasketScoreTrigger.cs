using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    public enum BasketTriggerKind
    {
        Upper = 0,
        Lower = 1,
    }

    /// <summary>
    /// Forwards hoop-mouth trigger overlap to <see cref="BasketScoreDetector"/>.
    /// </summary>
    public sealed class BasketScoreTrigger : MonoBehaviour
    {
        [SerializeField]
        BasketTriggerKind kind;

        BasketScoreDetector _detector;

        void Awake()
        {
            _detector = GetComponentInParent<BasketScoreDetector>();
            if (_detector == null)
                Debug.LogError("[ArcadeBasketball] BasketScoreTrigger needs a BasketScoreDetector on a parent.", this);
        }

        void OnTriggerEnter2D(Collider2D other)
        {
            if (!IsBall(other))
                return;

            _detector?.SetOverlap(kind, true);
        }

        void OnTriggerExit2D(Collider2D other)
        {
            if (!IsBall(other))
                return;

            _detector?.SetOverlap(kind, false);
        }

        bool IsBall(Collider2D other)
        {
            return other != null
                && _detector != null
                && other.attachedRigidbody == _detector.BallBody;
        }
    }
}
