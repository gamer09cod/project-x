using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Tunable arcade-ball values for BasketBall.unity.
    /// Phase 2: data only — no movement until BasketballArcadeController (Phase 3).
    /// </summary>
    [CreateAssetMenu(
        menuName = "Project X/Arcade Basketball/Basketball Gameplay Config",
        fileName = "BasketballGameplayConfig")]
    public sealed class BasketballGameplayConfig : ScriptableObject
    {
        [Header("Tap")]
        [Tooltip("Y velocity set on each accepted tap. Sets Y; does not AddForce.")]
        public float tapVelocity = 6f;

        [Tooltip("Seconds between accepted taps.")]
        public float tapCooldown = 0.075f;

        [Tooltip("Hard cap on upward velocity. Default matches tapVelocity.")]
        public float maxUpwardVelocity = 6f;

        [Header("Horizontal")]
        [Tooltip("X speed on tap toward the hoop's side of the court. Full value even at the rim so the ball can pass through.")]
        public float horizontalSpeed = 2f;

        [Tooltip("Unused. Tap X stays at horizontalSpeed so the ball can pass HoopTarget.")]
        public float horizontalArriveDistance = 1.25f;

        [Tooltip("How quickly X velocity approaches horizontalSpeed. Unused while X is set on tap.")]
        public float horizontalAcceleration = 20f;

        [Header("Fall")]
        [Tooltip("Fall acceleration as a multiple of Physics2D.gravity. 1 = default gravity. Does not change the project gravity vector.")]
        public float gravityMultiplier = 1.75f;

        [Tooltip("Clamp on downward speed (positive). High enough that taller falls still hit harder.")]
        public float maxFallSpeed = 14f;

        [Tooltip("Outbound Y after a floor hit, as a fraction of inbound fall speed.")]
        public float groundBounciness = 0.62f;

        [Tooltip("Cap on bounce-up speed after a floor hit. Independent of tap cap.")]
        public float maxBounceSpeed = 8.5f;

        [Tooltip("Landings slower than this (positive) settle instead of bouncing.")]
        public float groundRestSpeed = 3.5f;

        [Tooltip("Rolling slowdown on the floor (units/s²). ~2 lets it roll a beat then settle. Air X still coasts.")]
        public float groundDrag = 2f;

        [Header("Collision steering")]
        [Tooltip("Blend toward hoop X on tap after a rim/backboard hit. 1 = full tap X, 0.25 keeps most of the bounce.")]
        public float collisionSteeringMultiplier = 0.25f;

        [Tooltip("Seconds to keep reduced steering after a hit. Refresh on repeat hits.")]
        public float collisionSteeringDuration = 0.12f;

        [Tooltip("Ignore glancing hits below this |linearVelocity| for steering suppression.")]
        public float minimumCollisionSpeedForSuppression = 0.5f;

        [Header("Recovery")]
        [Tooltip("World Y below the court. Ball recovers if it falls under this.")]
        public float outOfBoundsY = -6.5f;

        [Tooltip("World |X| used as a wrap line if WallLeft / WallRight are not assigned.")]
        public float outOfBoundsX = 6f;

        [Tooltip("Delay after OOB before snapping the same Rigidbody back.")]
        public float ballRecoveryDelay = 0.25f;

        [Header("Visual")]
        [Tooltip("Spin scale. 1 = roll without slipping (distance / radius).")]
        public float spinMultiplier = 1f;

        [Tooltip("Shadow scale at max height, as a fraction of rest scale.")]
        public float shadowMinScale = 0.45f;

        [Tooltip("Shadow alpha when the ball is on the floor.")]
        public float shadowMaxAlpha = 0.5f;

        [Tooltip("Shadow alpha at max fade height.")]
        public float shadowMinAlpha = 0.12f;

        [Tooltip("Ball height above the floor where the shadow is smallest and faintest.")]
        public float shadowFadeHeight = 3.5f;

        [Header("Scoring")]
        [Tooltip("Points for a clean swish (no rim, no backboard).")]
        public int pointsPerfect = 3;

        [Tooltip("Points when the ball hits the rim on the way in.")]
        public int pointsRim = 2;

        [Tooltip("Points when the ball hits only the backboard.")]
        public int pointsBackboard = 1;

        public int PointsFor(ArcadeShotQuality quality)
        {
            switch (quality)
            {
                case ArcadeShotQuality.Perfect:
                    return pointsPerfect;
                case ArcadeShotQuality.Rim:
                    return pointsRim;
                default:
                    return pointsBackboard;
            }
        }

        /// <summary>
        /// Logs and asserts when the reference is missing. Returns false so callers
        /// can skip work instead of NullReferenceException.
        /// </summary>
        public static bool TryGet(
            BasketballGameplayConfig config,
            Object context,
            out BasketballGameplayConfig ready)
        {
            ready = config;
            if (config != null)
                return true;

            Debug.LogError(
                "[ArcadeBasketball] BasketballGameplayConfig is not assigned.",
                context);
            Debug.Assert(false, "BasketballGameplayConfig is required.", context);
            return false;
        }

        void OnValidate()
        {
            tapVelocity = Mathf.Max(0f, tapVelocity);
            tapCooldown = Mathf.Max(0f, tapCooldown);
            maxUpwardVelocity = Mathf.Max(0f, maxUpwardVelocity);
            horizontalSpeed = Mathf.Max(0f, horizontalSpeed);
            horizontalArriveDistance = Mathf.Max(0.05f, horizontalArriveDistance);
            horizontalAcceleration = Mathf.Max(0f, horizontalAcceleration);
            gravityMultiplier = Mathf.Max(0f, gravityMultiplier);
            maxFallSpeed = Mathf.Max(0f, maxFallSpeed);
            groundBounciness = Mathf.Clamp01(groundBounciness);
            maxBounceSpeed = Mathf.Max(0f, maxBounceSpeed);
            groundRestSpeed = Mathf.Max(0f, groundRestSpeed);
            groundDrag = Mathf.Max(0f, groundDrag);
            collisionSteeringMultiplier = Mathf.Max(0f, collisionSteeringMultiplier);
            collisionSteeringDuration = Mathf.Max(0f, collisionSteeringDuration);
            minimumCollisionSpeedForSuppression = Mathf.Max(0f, minimumCollisionSpeedForSuppression);
            outOfBoundsX = Mathf.Max(0f, outOfBoundsX);
            ballRecoveryDelay = Mathf.Max(0f, ballRecoveryDelay);
            shadowMinScale = Mathf.Clamp(shadowMinScale, 0.05f, 1f);
            shadowMaxAlpha = Mathf.Clamp01(shadowMaxAlpha);
            shadowMinAlpha = Mathf.Clamp01(shadowMinAlpha);
            shadowFadeHeight = Mathf.Max(0.1f, shadowFadeHeight);
            pointsPerfect = Mathf.Max(0, pointsPerfect);
            pointsRim = Mathf.Max(0, pointsRim);
            pointsBackboard = Mathf.Max(0, pointsBackboard);
        }
    }
}
