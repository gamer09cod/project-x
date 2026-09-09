using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    [CreateAssetMenu(
        menuName = "Project X/Arcade Basketball/Round Gameplay Config",
        fileName = "RoundGameplayConfig")]
    public sealed class RoundGameplayConfig : ScriptableObject
    {
        [Tooltip("Seconds the player can tap. Timer runs only in Playing.")]
        public float roundDuration = 60f;

        [Tooltip("Seconds of countdown before Playing. Taps are ignored.")]
        public float countdownSeconds = 3f;

        [Tooltip("Brief beat after the clock hits 0 before Results.")]
        public float roundEndingSeconds = 0.4f;

        public static bool TryGet(
            RoundGameplayConfig config,
            Object context,
            out RoundGameplayConfig ready)
        {
            ready = config;
            if (config != null)
                return true;

            Debug.LogError("[ArcadeBasketball] RoundGameplayConfig is not assigned.", context);
            Debug.Assert(false, "RoundGameplayConfig is required.", context);
            return false;
        }

        void OnValidate()
        {
            roundDuration = Mathf.Max(1f, roundDuration);
            countdownSeconds = Mathf.Max(0f, countdownSeconds);
            roundEndingSeconds = Mathf.Max(0f, roundEndingSeconds);
        }
    }
}
