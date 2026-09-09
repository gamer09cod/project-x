using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    [CreateAssetMenu(
        menuName = "Project X/Arcade Basketball/Hoop Gameplay Config",
        fileName = "HoopGameplayConfig")]
    public sealed class HoopGameplayConfig : ScriptableObject
    {
        [Header("Relocation")]
        [Tooltip("Seconds to slide in from off-screen.")]
        public float moveDuration = 0.3f;

        [Tooltip("How far off-screen the hoop starts, past the destination anchor.")]
        public float enterDistance = 3.5f;

        [Header("Net (fallback ripple if Animator is missing)")]
        [Tooltip("Seconds for the procedural squash/stretch.")]
        public float netSettleDuration = 0.45f;

        [Tooltip("Peak Y stretch of the fallback ripple.")]
        public float netStretch = 0.22f;

        [Tooltip("Peak X squash of the fallback ripple.")]
        public float netSquash = 0.10f;

        [Tooltip("Ripple intensity on a Perfect / SWISH. 1 = rim or bank.")]
        public float netPerfectIntensity = 1.7f;

        public static bool TryGet(
            HoopGameplayConfig config,
            Object context,
            out HoopGameplayConfig ready)
        {
            ready = config;
            if (config != null)
                return true;

            Debug.LogError("[ArcadeBasketball] HoopGameplayConfig is not assigned.", context);
            Debug.Assert(false, "HoopGameplayConfig is required.", context);
            return false;
        }

        void OnValidate()
        {
            moveDuration = Mathf.Max(0.05f, moveDuration);
            enterDistance = Mathf.Max(0f, enterDistance);
            netSettleDuration = Mathf.Max(0.05f, netSettleDuration);
            netStretch = Mathf.Max(0f, netStretch);
            netSquash = Mathf.Max(0f, netSquash);
            netPerfectIntensity = Mathf.Max(1f, netPerfectIntensity);
        }
    }
}
