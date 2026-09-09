using UnityEngine;
using ProjectX.Effect;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Arcade SFX, looping bed music, and haptics. Inspector clips — does not use
    /// GameAudio.Instance. Music lives on its own source at pitch 1 so SFX pitch
    /// cannot drag the bed. It starts after the opening whistle, not during countdown.
    /// Floor bounce SFX is on a dedicated source and plays on inbound impact,
    /// including the settle landing after the first bounce.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class ArcadeAudio : MonoBehaviour
    {
        [SerializeField]
        BasketballArcadeController ball;

        [SerializeField]
        BasketScoreDetector scoreDetector;

        [SerializeField]
        HoopArcadeController hoop;

        [SerializeField]
        ArcadeRoundController round;

        [SerializeField]
        BasketballGameplayConfig gameplayConfig;

        [SerializeField]
        AudioSource source;

        [Header("Tap / throw")]
        [Tooltip("Launch whoosh on lift. Do not assign bounce clips — those are floor/rim.")]
        [SerializeField]
        AudioClip[] tapClips;

        [Header("Collision (cooldown)")]
        [SerializeField]
        AudioClip[] groundClips;

        [SerializeField]
        AudioClip[] rimClips;

        [SerializeField]
        AudioClip[] backboardClips;

        [Header("Score")]
        [SerializeField]
        AudioClip scorePerfect;

        [SerializeField]
        AudioClip scoreRim;

        [SerializeField]
        AudioClip scoreBackboard;

        [SerializeField]
        AudioClip[] netSwish;

        [SerializeField]
        AudioClip netWhoosh;

        [Header("Hoop")]
        [SerializeField]
        AudioClip hoopMove;

        [Header("Round")]
        [SerializeField]
        AudioClip whistle;

        [Header("Music")]
        [SerializeField]
        AudioClip backgroundMusic;

        [Tooltip("Bed under SFX. Keep well below 0.4 so hits and scores stay readable.")]
        [SerializeField]
        [Range(0.05f, 0.4f)]
        float musicVolume = 0.26f;

        const float MusicFadeInSeconds = 0.55f;
        const float MusicFadeOutSeconds = 0.4f;
        const float MusicDuckRecoverSeconds = 0.35f;

        float _nextCollisionSfxTime;
        AudioSource _impactSource;
        AudioSource _musicSource;
        float _musicGain;
        float _musicDuck;
        float _musicHoldoff;
        bool _appMuted;

        void Awake()
        {
            if (source == null)
                source = GetComponent<AudioSource>();
            if (source == null)
                source = gameObject.AddComponent<AudioSource>();

            source.playOnAwake = false;
            source.spatialBlend = 0f;
            source.loop = false;
            source.priority = 64;
            source.pitch = 1f;

            _impactSource = gameObject.AddComponent<AudioSource>();
            _impactSource.playOnAwake = false;
            _impactSource.spatialBlend = 0f;
            _impactSource.loop = false;
            _impactSource.pitch = 1f;
            _impactSource.priority = 64;

            _musicSource = gameObject.AddComponent<AudioSource>();
            _musicSource.playOnAwake = false;
            _musicSource.spatialBlend = 0f;
            _musicSource.loop = true;
            _musicSource.pitch = 1f;
            _musicSource.priority = 192;
            _musicSource.volume = 0f;

            if (ball == null)
                ball = FindFirstObjectByType<BasketballArcadeController>();
            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();
            if (hoop == null)
                hoop = FindFirstObjectByType<HoopArcadeController>();
            if (round == null)
                round = GetComponent<ArcadeRoundController>();
            if (round == null)
                round = FindFirstObjectByType<ArcadeRoundController>();

            BasketballGameplayConfig.TryGet(gameplayConfig, this, out gameplayConfig);
        }

        void OnEnable()
        {
            if (ball != null)
            {
                ball.OnTapApplied += HandleTap;
                ball.OnGroundBounce += HandleGroundBounce;
                ball.OnHoopSolidHit += HandleHoopSolid;
            }

            if (scoreDetector != null)
                scoreDetector.OnBasketScored += HandleScore;

            if (hoop != null)
                hoop.OnHoopMove += HandleHoopMove;

            if (round != null)
                round.OnPlayingStarted += HandleGameStart;
        }

        void OnDisable()
        {
            if (ball != null)
            {
                ball.OnTapApplied -= HandleTap;
                ball.OnGroundBounce -= HandleGroundBounce;
                ball.OnHoopSolidHit -= HandleHoopSolid;
            }

            if (scoreDetector != null)
                scoreDetector.OnBasketScored -= HandleScore;

            if (hoop != null)
                hoop.OnHoopMove -= HandleHoopMove;

            if (round != null)
                round.OnPlayingStarted -= HandleGameStart;

            StopMusicImmediate();
        }

        void Update()
        {
            TickMusic();
        }

        void OnApplicationPause(bool pauseStatus)
        {
            _appMuted = pauseStatus;
            if (pauseStatus && _musicSource != null && _musicSource.isPlaying)
                _musicSource.Pause();
        }

        void OnApplicationFocus(bool hasFocus)
        {
            _appMuted = !hasFocus;
            if (!hasFocus && _musicSource != null && _musicSource.isPlaying)
                _musicSource.Pause();
        }

        void HandleTap()
        {
            PlayRandom(tapClips, 0.42f, Random.Range(1.04f, 1.12f));
            PlayHaptic(HapticBridge.Strength.Light);
        }

        void HandleGroundBounce()
        {
            PlayOn(_impactSource, Pick(groundClips), 0.72f, 1f);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        void HandleHoopSolid(HoopSolidKind kind)
        {
            if (!TryConsumeCollisionSfx())
                return;

            DuckMusic(0.28f);
            if (kind == HoopSolidKind.Backboard)
                PlayRandom(backboardClips, 0.82f);
            else
                PlayRandom(rimClips, 0.8f);

            PlayHaptic(HapticBridge.Strength.Light);
        }

        void HandleScore(ArcadeShotQuality quality)
        {
            AudioClip sting = scoreRim;
            HapticBridge.Strength haptic = HapticBridge.Strength.Medium;
            if (quality == ArcadeShotQuality.Perfect)
            {
                sting = scorePerfect;
                haptic = HapticBridge.Strength.Heavy;
            }
            else if (quality == ArcadeShotQuality.Backboard)
            {
                sting = scoreBackboard;
            }

            DuckMusic(0.55f);
            Play(sting, 0.88f);
            PlayRandom(netSwish, 0.68f);
            if (quality == ArcadeShotQuality.Perfect)
                Play(netWhoosh, 0.38f);
            PlayHaptic(haptic);
        }

        void HandleHoopMove()
        {
            Play(hoopMove, 0.32f, 1f);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        void HandleGameStart()
        {
            Play(whistle, 0.72f);
            _musicHoldoff = 0.05f;
            if (whistle != null)
                _musicHoldoff += whistle.length;
        }

        bool TryConsumeCollisionSfx()
        {
            float now = Time.unscaledTime;
            if (now < _nextCollisionSfxTime)
                return false;
            if (!BasketballGameplayConfig.TryGet(gameplayConfig, this, out BasketballGameplayConfig config))
                return false;
            _nextCollisionSfxTime = now + Mathf.Max(0f, config.hoopSolidSfxCooldown);
            return true;
        }

        void PlayRandom(AudioClip[] clips, float volume, float pitch = 1f)
        {
            Play(Pick(clips), volume, pitch);
        }

        static AudioClip Pick(AudioClip[] clips)
        {
            if (clips == null || clips.Length == 0)
                return null;
            for (int i = 0; i < clips.Length; i++)
            {
                AudioClip c = clips[Random.Range(0, clips.Length)];
                if (c != null)
                    return c;
            }
            return null;
        }

        void Play(AudioClip clip, float volume, float pitch = 1f)
        {
            PlayOn(source, clip, volume, pitch);
        }

        static void PlayOn(AudioSource dest, AudioClip clip, float volume, float pitch)
        {
            if (clip == null || dest == null)
                return;
            dest.pitch = pitch;
            dest.PlayOneShot(clip, volume);
        }

        static void PlayHaptic(HapticBridge.Strength strength)
        {
#if !UNITY_EDITOR
            HapticBridge.Play(strength);
#endif
        }

        void TickMusic()
        {
            if (_musicSource == null || backgroundMusic == null)
                return;

            bool paused = _appMuted || (round != null && round.IsPaused);
            ArcadeRoundState state = round != null ? round.State : ArcadeRoundState.Initializing;

            _musicDuck = Mathf.MoveTowards(
                _musicDuck, 0f, Time.unscaledDeltaTime / MusicDuckRecoverSeconds);

            if (_musicHoldoff > 0f)
                _musicHoldoff -= Time.unscaledDeltaTime;

            if (paused)
            {
                if (_musicSource.isPlaying)
                    _musicSource.Pause();
                ApplyMusicVolume();
                return;
            }

            bool afterWhistle = (state == ArcadeRoundState.Playing
                    || state == ArcadeRoundState.RoundEnding)
                && _musicHoldoff <= 0f;

            if (afterWhistle)
            {
                EnsureMusicPlaying();
                _musicGain = Mathf.MoveTowards(
                    _musicGain, 1f, Time.unscaledDeltaTime / MusicFadeInSeconds);
            }
            else
            {
                _musicGain = Mathf.MoveTowards(
                    _musicGain, 0f, Time.unscaledDeltaTime / MusicFadeOutSeconds);
                if (_musicGain <= 0.001f && (_musicSource.isPlaying || _musicSource.time > 0f))
                {
                    _musicSource.Stop();
                    _musicGain = 0f;
                    _musicDuck = 0f;
                }
            }

            ApplyMusicVolume();
        }

        void EnsureMusicPlaying()
        {
            _musicSource.loop = true;
            _musicSource.pitch = 1f;

            if (_musicSource.clip != backgroundMusic)
            {
                _musicSource.Stop();
                _musicSource.clip = backgroundMusic;
                _musicSource.Play();
                return;
            }

            if (_musicSource.isPlaying)
                return;

            if (_musicSource.time > 0f)
            {
                _musicSource.UnPause();
                if (_musicSource.isPlaying)
                    return;
            }

            _musicSource.Play();
        }

        void ApplyMusicVolume()
        {
            _musicSource.pitch = 1f;
            _musicSource.volume = musicVolume * _musicGain * (1f - 0.45f * _musicDuck);
        }

        void DuckMusic(float amount)
        {
            _musicDuck = Mathf.Clamp01(_musicDuck + amount);
        }

        void StopMusicImmediate()
        {
            _musicGain = 0f;
            _musicDuck = 0f;
            _musicHoldoff = 0f;
            if (_musicSource == null)
                return;
            _musicSource.Stop();
            _musicSource.clip = null;
        }
    }
}
