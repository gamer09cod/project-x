using UnityEngine;
using UnityEngine.Audio;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Fixed SFX voices on one host. Never allocates per play. Music is not in this pool.
    /// Steal only from a strictly lower priority; a tap cannot cut a CLEAN sting.
    /// </summary>
    public sealed class ArcadeAudioSourcePool
    {
        readonly AudioSource[] _sources;
        readonly ArcadeAudioPriority[] _priority;
        readonly float[] _endUnscaled;
        readonly int[] _cueIds;
        readonly int _count;

        public ArcadeAudioSourcePool(GameObject host, int size, AudioSource first)
        {
            if (size < 1)
                size = 1;
            _count = size;
            _sources = new AudioSource[size];
            _priority = new ArcadeAudioPriority[size];
            _endUnscaled = new float[size];
            _cueIds = new int[size];

            if (first == null)
                first = host.GetComponent<AudioSource>();
            if (first == null)
                first = host.AddComponent<AudioSource>();

            Configure(first, 64);
            _sources[0] = first;

            AudioSource[] existing = host.GetComponents<AudioSource>();
            int write = 1;
            for (int i = 0; i < existing.Length && write < size; i++)
            {
                AudioSource candidate = existing[i];
                if (candidate == null || candidate == first)
                    continue;
                if (IndexOf(candidate) >= 0)
                    continue;
                Configure(candidate, 64);
                _sources[write] = candidate;
                write++;
            }

            for (; write < size; write++)
            {
                AudioSource created = host.AddComponent<AudioSource>();
                Configure(created, 64);
                _sources[write] = created;
            }
        }

        public int CountActive(int cueId)
        {
            float now = Time.unscaledTime;
            int n = 0;
            for (int i = 0; i < _count; i++)
            {
                if (_cueIds[i] != cueId)
                    continue;
                if (IsBusy(i, now))
                    n++;
            }

            return n;
        }

        public bool TryPlay(
            int cueId,
            AudioClip clip,
            float volume,
            float pitch,
            AudioMixerGroup group,
            ArcadeAudioPriority priority)
        {
            if (clip == null)
                return false;

            float now = Time.unscaledTime;
            int slot = FindIdle(now);
            if (slot < 0)
                slot = FindStealable(priority, now);
            if (slot < 0)
                return false;

            AudioSource dest = _sources[slot];
            dest.outputAudioMixerGroup = group;
            dest.priority = UnityPriority(priority);
            dest.pitch = pitch <= 0.01f ? 1f : pitch;
            dest.volume = 1f;
            dest.clip = null;
            dest.PlayOneShot(clip, Mathf.Clamp01(volume));

            float duration = clip.length;
            if (pitch > 0.01f)
                duration /= pitch;
            if (duration < 0.02f)
                duration = 0.02f;

            _cueIds[slot] = cueId;
            _priority[slot] = priority;
            _endUnscaled[slot] = now + duration;
            return true;
        }

        public void StopAll()
        {
            for (int i = 0; i < _count; i++)
            {
                if (_sources[i] != null)
                    _sources[i].Stop();
                _cueIds[i] = 0;
                _endUnscaled[i] = 0f;
            }
        }

        int FindIdle(float now)
        {
            for (int i = 0; i < _count; i++)
            {
                if (!IsBusy(i, now))
                    return i;
            }

            return -1;
        }

        int FindStealable(ArcadeAudioPriority incoming, float now)
        {
            int best = -1;
            float oldest = float.MaxValue;
            for (int i = 0; i < _count; i++)
            {
                if (!IsBusy(i, now))
                    continue;
                if (_priority[i] >= incoming)
                    continue;
                float started = _endUnscaled[i];
                if (started < oldest)
                {
                    oldest = started;
                    best = i;
                }
            }

            return best;
        }

        bool IsBusy(int i, float now)
        {
            AudioSource s = _sources[i];
            if (s == null)
                return false;
            if (s.isPlaying)
                return true;
            return now < _endUnscaled[i];
        }

        int IndexOf(AudioSource source)
        {
            for (int i = 0; i < _count; i++)
            {
                if (_sources[i] == source)
                    return i;
            }

            return -1;
        }

        static int UnityPriority(ArcadeAudioPriority priority)
        {
            switch (priority)
            {
                case ArcadeAudioPriority.VeryHigh:
                    return 16;
                case ArcadeAudioPriority.High:
                    return 32;
                case ArcadeAudioPriority.Medium:
                    return 64;
                default:
                    return 96;
            }
        }

        static void Configure(AudioSource s, int unityPriority)
        {
            s.playOnAwake = false;
            s.spatialBlend = 0f;
            s.loop = false;
            s.mute = false;
            s.volume = 1f;
            s.pitch = 1f;
            s.priority = unityPriority;
            s.ignoreListenerPause = false;
            s.dopplerLevel = 0f;
            s.minDistance = 1f;
            s.maxDistance = 500f;
            s.rolloffMode = AudioRolloffMode.Linear;
        }
    }
}
