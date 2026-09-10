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

        [Tooltip("Slow-mo scale while the ball is in the air at 0.0.")]
        public float buzzerTimeScale = 0.25f;

        [Tooltip("Seconds added once on a buzzer make. Must stay at 5 for payload duration caps.")]
        public float buzzerBonusSeconds = 5f;

        [Tooltip("Real-time cap on the slow-mo window so the clock cannot stall.")]
        public float buzzerMaxSeconds = 8f;

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
            buzzerTimeScale = Mathf.Clamp(buzzerTimeScale, 0.05f, 1f);
            buzzerBonusSeconds = Mathf.Clamp(buzzerBonusSeconds, 0f, 5f);
            buzzerMaxSeconds = Mathf.Clamp(buzzerMaxSeconds, 1f, 15f);
        }
    }
}
