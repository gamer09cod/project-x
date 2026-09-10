using UnityEngine;
using UnityEngine.Audio;

namespace ProjectX.ArcadeBasketball
{
    public enum ArcadeAudioBus
    {
        Master = 0,
        Music = 1,
        Ball = 2,
        Impact = 3,
        Basket = 4,
        Reward = 5,
        UI = 6,
    }

    public enum ArcadeAudioPriority
    {
        Low = 0,
        Medium = 1,
        High = 2,
        VeryHigh = 3,
    }

    /// <summary>
    /// Inspector-tunable one-shot. Runtime cooldown / last-clip state lives on
    /// ArcadeAudio, not here, so the ScriptableObject stays shareable.
    /// </summary>
    [System.Serializable]
    public sealed class ArcadeAudioCue
    {
        public string debugName;

        public AudioClip[] clips;

        [Range(0f, 1f)]
        public float volume = 0.7f;

        [Tooltip("Inclusive pitch range. Use identical values for a fixed pitch.")]
        public Vector2 pitchRange = new Vector2(1f, 1f);

        [Tooltip("Min seconds between accepted plays of this cue.")]
        public float cooldown = 0.08f;

        [Tooltip("Voices of this cue that may overlap. 1 blocks machine-gun physics.")]
        public int maxSimultaneousInstances = 2;

        [Tooltip("When several clips exist, do not pick the same one twice in a row.")]
        public bool preventDuplicateClip = true;

        public ArcadeAudioBus mixerBus = ArcadeAudioBus.Ball;

        [Tooltip("Optional override. Empty uses the bus mapping on ArcadeAudio.")]
        public AudioMixerGroup outputMixerGroup;

        public ArcadeAudioPriority priority = ArcadeAudioPriority.Medium;

        [Tooltip("Ignore plays below this collision speed. 0 disables the gate.")]
        public float minimumCollisionVelocity;

        [Tooltip("Speed that maps to full intensity. Must be > minimum.")]
        public float maximumCollisionVelocity;

        [Tooltip("Quiet / loud ends of the intensity volume curve.")]
        public Vector2 intensityVolume = new Vector2(0.4f, 1f);

        public bool HasClips
        {
            get
            {
                if (clips == null)
                    return false;
                for (int i = 0; i < clips.Length; i++)
                {
                    if (clips[i] != null)
                        return true;
                }

                return false;
            }
        }

        public float IntensityFor(float collisionVelocity)
        {
            if (maximumCollisionVelocity <= minimumCollisionVelocity)
                return 1f;
            return Mathf.Clamp01(Mathf.InverseLerp(
                minimumCollisionVelocity,
                maximumCollisionVelocity,
                collisionVelocity));
        }

        public bool PassesVelocityGate(float collisionVelocity)
        {
            if (minimumCollisionVelocity <= 0f)
                return true;
            return collisionVelocity >= minimumCollisionVelocity;
        }
    }
}
