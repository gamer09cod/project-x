using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Put on rim / backboard colliders in BasketBall.unity.
    /// Kind distinguishes iron from glass. Do not use GameObject names.
    /// </summary>
    public sealed class HoopSolidMarker : MonoBehaviour
    {
        [SerializeField]
        HoopSolidKind kind = HoopSolidKind.Rim;

        public HoopSolidKind Kind => kind;
    }
}
