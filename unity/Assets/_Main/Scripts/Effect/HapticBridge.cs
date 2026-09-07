using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Routes haptics out to React Native rather than firing them in Unity.
    ///
    /// Unity's Handheld.Vibrate is a blunt ~500ms buzz on Android and does
    /// nothing useful on iOS, so it cannot express "light tap" versus
    /// "celebration". The host app already owns a native haptics capability and
    /// this game always runs embedded, so the bridge is the right channel.
    ///
    /// Messages are fire-and-forget: if the RN side ignores the type, nothing
    /// breaks.
    /// </summary>
    public static class HapticBridge
    {
        public enum Strength
        {
            Light,
            Medium,
            Heavy,
        }

        // Haptics are a scarce resource — spamming them on a hot streak makes
        // the phone feel broken rather than responsive.
        const float MinIntervalSeconds = 0.12f;

        static float _lastSentAt = -999f;
        static Strength _lastStrength;

        public static void Play(Strength strength)
        {
            bool throttled = Time.unscaledTime - _lastSentAt < MinIntervalSeconds;

            // A stronger haptic may pre-empt a weaker one inside the window.
            // A buzzer-beater make and its basket resolve in the same frame, and
            // the celebration must not lose to the ordinary tap.
            if (throttled && strength <= _lastStrength)
            {
                return;
            }

            _lastSentAt = Time.unscaledTime;
            _lastStrength = strength;

            string name;
            switch (strength)
            {
                case Strength.Heavy:
                    name = "heavy";
                    break;
                case Strength.Medium:
                    name = "medium";
                    break;
                default:
                    name = "light";
                    break;
            }

            string message = "{\"v\":1,\"type\":\"haptic\",\"strength\":\"" + name + "\"}";

            try
            {
                ProjectX.Bridge.NativeApi.SendToMobileApp(message);
            }
            catch (System.Exception)
            {
                // Editor and any non-embedded context have no host to talk to.
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _lastSentAt = -999f;
            _lastStrength = Strength.Light;
        }
    }
}
