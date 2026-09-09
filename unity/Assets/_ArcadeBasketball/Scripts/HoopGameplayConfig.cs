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
        public float moveDuration = 0.28f;

        [Tooltip("How far off-screen the hoop starts, past the destination anchor.")]
        public float enterDistance = 3.2f;

        [Header("Net (fallback ripple if Animator is missing)")]
        [Tooltip("Seconds for the procedural squash/stretch.")]
        public float netSettleDuration = 0.45f;

        [Tooltip("Peak Y stretch of the fallback ripple.")]
        public float netStretch = 0.22f;

        [Tooltip("Peak X squash of the fallback ripple.")]
        public float netSquash = 0.10f;

        [Tooltip("Ripple intensity on a Perfect / SWISH. 1 = rim or bank.")]
        public float netPerfectIntensity = 1.7f;

        [Header("Score camera / parallax")]
        [Tooltip("Shake length on a make.")]
        public float shakeDuration = 0.28f;

        [Tooltip("Camera punch amplitude on a SWISH.")]
        public float shakePerfect = 0.16f;

        [Tooltip("Camera punch amplitude on a rim make.")]
        public float shakeRim = 0.1f;

        [Tooltip("Camera punch amplitude on a bank.")]
        public float shakeBackboard = 0.07f;

        [Tooltip("How much GameBG follows the camera punch. 0 = locked far, 1 = glued to camera.")]
        public float parallaxFar = 0.28f;

        [Tooltip("How much Court follows the camera punch.")]
        public float parallaxMid = 0.58f;

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
            shakeDuration = Mathf.Max(0.05f, shakeDuration);
            shakePerfect = Mathf.Max(0f, shakePerfect);
            shakeRim = Mathf.Max(0f, shakeRim);
            shakeBackboard = Mathf.Max(0f, shakeBackboard);
            parallaxFar = Mathf.Clamp01(parallaxFar);
            parallaxMid = Mathf.Clamp01(parallaxMid);
        }
    }
}
