using System;
using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// One-way notifications from gameplay to the presentation layer.
    ///
    /// Gameplay raises; effect listens. Nothing here may feed back into scoring,
    /// the clock, or the score payload — the server verifies those and this
    /// layer must stay observational.
    /// </summary>
    public static class EffectEvents
    {
        /// <summary>Made basket: quality, points awarded, world position of the hoop.</summary>
        public static event Action<ShotQuality, int, Vector3> Basket;

        /// <summary>Shot resolved without scoring.</summary>
        public static event Action Miss;

        /// <summary>Ball released. Raised on the same frame as the physics impulse.</summary>
        public static event Action Launch;

        /// <summary>Ball struck the rim (world position).</summary>
        public static event Action<Vector3> RimHit;

        /// <summary>Ball struck the backboard (world position).</summary>
        public static event Action<Vector3> BackboardHit;

        /// <summary>Clock hit zero with the ball still in the air.</summary>
        public static event Action BuzzerBegin;

        /// <summary>
        /// Buzzer window closed. First flag is whether the shot was made, second
        /// is whether it actually bought extra time — a make does not always
        /// grant an extension (arcade mode, or a second buzzer in one run).
        /// </summary>
        public static event Action<bool, bool> BuzzerResolved;

        /// <summary>A ranked embed run began or was reset.</summary>
        public static event Action RunStarted;

        /// <summary>Run finished; payload about to be emitted.</summary>
        public static event Action RunEnded;

        /// <summary>Ball entered the rim top trigger — draw behind the net.</summary>
        public static event Action EnterNetTunnel;

        /// <summary>Ball reset / recycle — restore normal draw order.</summary>
        public static event Action ExitNetTunnel;

        public static void RaiseBasket(ShotQuality quality, int points, Vector3 worldPos)
        {
            Basket?.Invoke(quality, points, worldPos);
        }

        public static void RaiseMiss()
        {
            Miss?.Invoke();
        }

        public static void RaiseLaunch()
        {
            Launch?.Invoke();
        }

        public static void RaiseRimHit(Vector3 worldPos)
        {
            RimHit?.Invoke(worldPos);
        }

        public static void RaiseBackboardHit(Vector3 worldPos)
        {
            BackboardHit?.Invoke(worldPos);
        }

        public static void RaiseBuzzerBegin()
        {
            BuzzerBegin?.Invoke();
        }

        public static void RaiseBuzzerResolved(bool made, bool timeGranted)
        {
            BuzzerResolved?.Invoke(made, timeGranted);
        }

        public static void RaiseRunStarted()
        {
            RunStarted?.Invoke();
        }

        public static void RaiseRunEnded()
        {
            RunEnded?.Invoke();
        }

        public static void RaiseEnterNetTunnel()
        {
            EnterNetTunnel?.Invoke();
        }

        public static void RaiseExitNetTunnel()
        {
            ExitNetTunnel?.Invoke();
        }

        /// <summary>
        /// Static events survive scene loads and survive play-mode entry when
        /// domain reload is disabled, which would leave listeners bound to
        /// destroyed objects. Clear them before the first scene loads.
        /// </summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Basket = null;
            Miss = null;
            Launch = null;
            RimHit = null;
            BackboardHit = null;
            BuzzerBegin = null;
            BuzzerResolved = null;
            RunStarted = null;
            RunEnded = null;
            EnterNetTunnel = null;
            ExitNetTunnel = null;
        }
    }
}
