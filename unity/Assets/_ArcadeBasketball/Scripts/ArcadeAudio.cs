using UnityEngine;
using UnityEngine.Audio;
using ProjectX.Effect;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Arcade SFX, looping bed music, and haptics. Gameplay only raises semantic
    /// events; this type owns clip pick, pitch, cooldown, voices, and mixer routing.
    /// Music is a dedicated looping source and is never taken from the SFX pool.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class ArcadeAudio : MonoBehaviour
    {
        const int CueCount = 16;
        const int DelayedSlots = 6;
        const float MuteDb = -80f;

        const int CueTap = 1;
        const int CueBounce = 2;
        const int CueRim = 3;
        const int CueBackboard = 4;
        const int CueSwish = 5;
        const int CueWhoosh = 6;
        const int CueNormal = 7;
        const int CueBackboardScore = 8;
        const int CueClean = 9;
        const int CueCombo = 10;
        const int CueGameOver = 11;
        const int CueWhistle = 12;
        const int CueBuzzer = 13;
        const int CueHoopMove = 14;
        const int CueUi = 15;

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
        ArcadeAudioConfig audioConfig;

        [SerializeField]
        AudioMixer mixer;

        [SerializeField]
        AudioSource source;

        [Header("Legacy clip fallback (used only if a config cue has no clips)")]
        [SerializeField]
        AudioClip[] tapClips;

        [SerializeField]
        AudioClip[] groundClips;

        [SerializeField]
        AudioClip[] rimClips;

        [SerializeField]
        AudioClip[] backboardClips;

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

        [SerializeField]
        AudioClip hoopMove;

        [SerializeField]
        AudioClip whistle;

        [SerializeField]
        AudioClip buzzer;

        [SerializeField]
        AudioClip backgroundMusic;

        [SerializeField]
        [Range(0.05f, 1f)]
        float musicVolume = 0.85f;

        [Header("Debug")]
        [SerializeField]
        bool enableAudioDebugLogs;

        [Header("Volume sliders (0–1, applied to mixer groups)")]
        [SerializeField]
        [Range(0f, 1f)]
        float masterSlider = 1f;

        [SerializeField]
        [Range(0f, 1f)]
        float musicSlider = 1f;

        [SerializeField]
        [Range(0f, 1f)]
        float sfxSlider = 1f;

        [SerializeField]
        [Range(0f, 1f)]
        float uiSlider = 1f;

        readonly CueRuntime[] _runtimes = new CueRuntime[CueCount];
        readonly DelayedPlay[] _delayed = new DelayedPlay[DelayedSlots];
        readonly AudioMixerGroup[] _buses = new AudioMixerGroup[7];

        ArcadeAudioSourcePool _pool;
        AudioSource _musicSource;
        float _musicGain;
        float _musicDuckDb;
        float _musicDuckTargetDb;
        float _duckReleaseAt;
        float _musicHoldoff;
        bool _appMuted;
        bool _gameOverPlayed;
        int _generation;
        int _perfectStreak;
        bool _mixerReady;

        void Awake()
        {
            if (source == null)
                source = GetComponent<AudioSource>();
            if (source == null)
                source = gameObject.AddComponent<AudioSource>();

            ArcadeAudioConfig.TryGet(audioConfig, this, out audioConfig);
            BasketballGameplayConfig.TryGet(gameplayConfig, this, out gameplayConfig);

            int poolSize = audioConfig != null ? audioConfig.sfxPoolSize : 10;
            _pool = new ArcadeAudioSourcePool(gameObject, poolSize, source);

            _musicSource = CreateMusicSource();

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

            BindMixer();
            ApplyMixerSliders();
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
            {
                round.OnPlayingStarted += HandleGameStart;
                round.OnBuzzerBegin += HandleBuzzer;
                round.OnRoundEnding += HandleRoundEnding;
                round.OnMiss += HandleMiss;
                round.OnRoundReset += HandleRoundReset;
            }
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
            {
                round.OnPlayingStarted -= HandleGameStart;
                round.OnBuzzerBegin -= HandleBuzzer;
                round.OnRoundEnding -= HandleRoundEnding;
                round.OnMiss -= HandleMiss;
                round.OnRoundReset -= HandleRoundReset;
            }

            StopMusicImmediate();
            CancelDelayed();
        }

        void Update()
        {
            TickDelayed();
            TickDuck();
            TickMusic();
        }

        void OnApplicationPause(bool pauseStatus)
        {
            _appMuted = pauseStatus;
            if (pauseStatus)
                PauseMusic();
        }

        void OnApplicationFocus(bool hasFocus)
        {
            _appMuted = !hasFocus;
            if (!hasFocus)
                PauseMusic();
        }

        public void PlayTap()
        {
            if (!GameplaySfxAllowed)
                return;
            PlayCue(CueTap, ResolveTap(), 1f, 0f);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        public void PlayBounce(float intensity)
        {
            if (!GameplaySfxAllowed)
                return;
            ArcadeAudioCue cue = ResolveBounce();
            PlayCue(CueBounce, cue, intensity, intensity);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        public void PlayRimHit(float intensity)
        {
            if (!GameplaySfxAllowed)
                return;
            PlayCue(CueRim, ResolveRim(), intensity, intensity);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        public void PlayBackboardHit(float intensity)
        {
            if (!GameplaySfxAllowed)
                return;
            PlayCue(CueBackboard, ResolveBackboard(), intensity, intensity);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        public void PlaySwish()
        {
            PlayCue(CueSwish, ResolveSwish(), 1f, 0f);
        }

        public void PlayNormalScore()
        {
            PlayCue(CueNormal, ResolveNormalScore(), 1f, 0f);
        }

        public void PlayCleanScore()
        {
            DuckMusicForReward();
            PlayCue(CueClean, ResolveClean(), 1f, 0f);
            PlayHaptic(HapticBridge.Strength.Heavy);
        }

        public void PlayCombo(int comboCount)
        {
            DuckMusicForReward();
            ArcadeAudioCue cue = ResolveCombo(comboCount);
            float pitch = 1f + 0.02f * Mathf.Clamp(comboCount - 1, 0, 5);
            PlayCue(CueCombo, cue, 1f, 0f, pitch);
            PlayHaptic(HapticBridge.Strength.Heavy);
        }

        public void PlayGameOver()
        {
            if (_gameOverPlayed)
                return;
            _gameOverPlayed = true;
            DuckMusicForReward();
            PlayCue(CueGameOver, ResolveGameOver(), 1f, 0f);
            PlayHaptic(HapticBridge.Strength.Heavy);
            Log("Game over");
        }

        public void PlayUIButton()
        {
            PlayCue(CueUi, ResolveUi(), 1f, 0f);
        }

        public void StartMusic()
        {
            _musicHoldoff = 0f;
        }

        public void StopMusic()
        {
            StopMusicImmediate();
        }

        public void PauseMusic()
        {
            if (_musicSource != null && _musicSource.isPlaying)
                _musicSource.Pause();
        }

        public void ResumeMusic()
        {
            if (_appMuted)
                return;
            if (round != null && round.IsPaused)
                return;
            EnsureMusicPlaying();
        }

        public void SetMasterVolume(float normalizedValue)
        {
            masterSlider = Mathf.Clamp01(normalizedValue);
            ApplyMixerSlider(ArcadeAudioConfig.MasterVolumeParam, DesignedMasterDb, masterSlider);
        }

        public void SetMusicVolume(float normalizedValue)
        {
            musicSlider = Mathf.Clamp01(normalizedValue);
            ApplyMixerSlider(ArcadeAudioConfig.MusicVolumeParam, DesignedMusicDb, musicSlider);
        }

        public void SetSFXVolume(float normalizedValue)
        {
            sfxSlider = Mathf.Clamp01(normalizedValue);
            ApplyMixerSlider(ArcadeAudioConfig.SfxVolumeParam, DesignedSfxDb, sfxSlider);
        }

        public void SetUIVolume(float normalizedValue)
        {
            uiSlider = Mathf.Clamp01(normalizedValue);
            ApplyMixerSlider(ArcadeAudioConfig.UiVolumeParam, DesignedUiDb, uiSlider);
        }

        void HandleTap()
        {
            PlayTap();
        }

        void HandleGroundBounce(float incomingSpeed)
        {
            PlayBounce(incomingSpeed);
        }

        void HandleHoopSolid(HoopSolidKind kind, float impactSpeed)
        {
            if (kind == HoopSolidKind.Backboard)
                PlayBackboardHit(impactSpeed);
            else
                PlayRimHit(impactSpeed);
        }

        void HandleScore(ArcadeShotQuality quality)
        {
            if (!GameplaySfxAllowed)
                return;

            PlaySwish();
            if (quality == ArcadeShotQuality.Perfect)
                PlayCue(CueWhoosh, ResolveWhoosh(), 1f, 0f);

            float delay;
            byte kind;
            int combo = 0;
            if (quality == ArcadeShotQuality.Perfect)
            {
                _perfectStreak++;
                combo = _perfectStreak;
                delay = audioConfig != null ? audioConfig.cleanScoreDelay : 0.055f;
                kind = combo >= 2 ? DelayedPlay.KindCombo : DelayedPlay.KindClean;
            }
            else
            {
                _perfectStreak = 0;
                delay = audioConfig != null ? audioConfig.normalScoreDelay : 0.045f;
                kind = quality == ArcadeShotQuality.Backboard
                    ? DelayedPlay.KindBank
                    : DelayedPlay.KindNormal;
            }

            QueueDelayed(delay, kind, combo);
            if (quality != ArcadeShotQuality.Perfect)
                PlayHaptic(HapticBridge.Strength.Medium);
        }

        void HandleHoopMove()
        {
            PlayCue(CueHoopMove, ResolveHoopMove(), 1f, 0f);
            PlayHaptic(HapticBridge.Strength.Light);
        }

        void HandleRoundReset()
        {
            _generation++;
            _gameOverPlayed = false;
            _perfectStreak = 0;
            CancelDelayed();
            if (_pool != null)
                _pool.StopAll();
        }

        void HandleGameStart()
        {
            PlayCue(CueWhistle, ResolveWhistle(), 1f, 0f);
            _musicHoldoff = 0.05f;
            AudioClip w = ResolveWhistleClip();
            if (w != null)
                _musicHoldoff += w.length;
            Log("Whistle / music holdoff");
        }

        void HandleBuzzer()
        {
            DuckMusicForReward();
            PlayCue(CueBuzzer, ResolveBuzzer(), 1f, 0f);
            PlayHaptic(HapticBridge.Strength.Heavy);
            Log("Buzzer");
        }

        void HandleRoundEnding()
        {
            PlayGameOver();
        }

        void HandleMiss()
        {
            _perfectStreak = 0;
        }

        bool GameplaySfxAllowed
        {
            get
            {
                if (_appMuted)
                    return false;
                if (round == null)
                    return true;
                if (round.IsPaused)
                    return false;
                return round.State == ArcadeRoundState.Playing;
            }
        }

        float DesignedMasterDb => audioConfig != null ? audioConfig.masterMixDb : -2.5f;
        float DesignedMusicDb => audioConfig != null ? audioConfig.musicMixDb : -10f;
        float DesignedSfxDb => audioConfig != null ? audioConfig.sfxMixDb : 0f;
        float DesignedUiDb => audioConfig != null ? audioConfig.uiMixDb : -4f;

        void PlayCue(
            int cueId,
            ArcadeAudioCue cue,
            float intensityOrOne,
            float collisionVelocity,
            float pitchOverride = 0f)
        {
            if (cue == null || !cue.HasClips || _pool == null)
                return;

            if (collisionVelocity > 0f && !cue.PassesVelocityGate(collisionVelocity))
            {
                Log(cue.debugName + " blocked by velocity " + collisionVelocity.ToString("0.00"));
                return;
            }

            CueRuntime runtime = _runtimes[cueId];
            float now = Time.unscaledTime;
            if (cue.cooldown > 0f && now < runtime.nextAllowed)
            {
                Log(cue.debugName + " blocked by cooldown");
                return;
            }

            if (_pool.CountActive(cueId) >= cue.maxSimultaneousInstances)
            {
                Log(cue.debugName + " blocked by concurrency");
                return;
            }

            int clipIndex;
            AudioClip clip = PickClip(cue, runtime.lastClipIndex, out clipIndex);
            if (clip == null)
                return;

            float intensity = 1f;
            if (collisionVelocity > 0f)
                intensity = cue.IntensityFor(collisionVelocity);
            else if (intensityOrOne > 0f && intensityOrOne <= 1f
                     && cue.maximumCollisionVelocity > cue.minimumCollisionVelocity)
                intensity = Mathf.Clamp01(intensityOrOne);

            float volume = cue.volume;
            if (cue.maximumCollisionVelocity > cue.minimumCollisionVelocity)
            {
                volume *= Mathf.Lerp(cue.intensityVolume.x, cue.intensityVolume.y, intensity);
            }

            float pitch = pitchOverride > 0.01f
                ? pitchOverride
                : Random.Range(cue.pitchRange.x, cue.pitchRange.y);

            AudioMixerGroup group = cue.outputMixerGroup;
            if (group == null)
                group = GroupFor(cue.mixerBus);

            if (!_pool.TryPlay(cueId, clip, volume, pitch, group, cue.priority))
            {
                Log(cue.debugName + " dropped (pool busy, higher priority occupying)");
                return;
            }

            runtime.nextAllowed = now + cue.cooldown;
            runtime.lastClipIndex = clipIndex;
            _runtimes[cueId] = runtime;

            if (cueId == CueBounce)
                Log("Bounce intensity: " + intensity.ToString("0.00"));
            else if (cueId == CueRim)
                Log("Rim played");
            else if (cueId == CueSwish)
                Log("Swish played");
            else if (cueId == CueClean)
                Log("Perfect shot reward played");
        }

        static AudioClip PickClip(ArcadeAudioCue cue, int lastIndex, out int pickedIndex)
        {
            pickedIndex = -1;
            AudioClip[] clips = cue.clips;
            if (clips == null || clips.Length == 0)
                return null;

            int usable = 0;
            for (int i = 0; i < clips.Length; i++)
            {
                if (clips[i] != null)
                    usable++;
            }

            if (usable == 0)
                return null;

            if (usable == 1 || !cue.preventDuplicateClip)
            {
                for (int guard = 0; guard < clips.Length; guard++)
                {
                    int i = Random.Range(0, clips.Length);
                    if (clips[i] != null)
                    {
                        pickedIndex = i;
                        return clips[i];
                    }
                }
            }

            for (int guard = 0; guard < clips.Length * 2; guard++)
            {
                int i = Random.Range(0, clips.Length);
                if (clips[i] == null)
                    continue;
                if (i == lastIndex)
                    continue;
                pickedIndex = i;
                return clips[i];
            }

            for (int i = 0; i < clips.Length; i++)
            {
                if (clips[i] != null)
                {
                    pickedIndex = i;
                    return clips[i];
                }
            }

            return null;
        }

        void QueueDelayed(float delay, byte kind, int combo)
        {
            float fireAt = Time.unscaledTime + Mathf.Max(0f, delay);
            for (int i = 0; i < DelayedSlots; i++)
            {
                if (_delayed[i].kind != DelayedPlay.KindNone)
                    continue;
                _delayed[i].kind = kind;
                _delayed[i].fireAt = fireAt;
                _delayed[i].generation = _generation;
                _delayed[i].combo = combo;
                return;
            }
        }

        void TickDelayed()
        {
            float now = Time.unscaledTime;
            for (int i = 0; i < DelayedSlots; i++)
            {
                if (_delayed[i].kind == DelayedPlay.KindNone)
                    continue;
                if (now < _delayed[i].fireAt)
                    continue;

                byte kind = _delayed[i].kind;
                int combo = _delayed[i].combo;
                int gen = _delayed[i].generation;
                _delayed[i].kind = DelayedPlay.KindNone;
                if (gen != _generation)
                    continue;
                if (round != null
                    && round.State != ArcadeRoundState.Playing
                    && round.State != ArcadeRoundState.RoundEnding)
                    continue;

                if (kind == DelayedPlay.KindClean)
                    PlayCleanScore();
                else if (kind == DelayedPlay.KindCombo)
                    PlayCombo(combo);
                else if (kind == DelayedPlay.KindBank)
                    PlayCue(CueBackboardScore, ResolveBackboardScore(), 1f, 0f);
                else
                    PlayNormalScore();
            }
        }

        void CancelDelayed()
        {
            for (int i = 0; i < DelayedSlots; i++)
                _delayed[i].kind = DelayedPlay.KindNone;
        }

        void DuckMusicForReward()
        {
            float duck = audioConfig != null ? audioConfig.rewardDuckDb : 3.5f;
            _musicDuckTargetDb = duck;
            float hold = audioConfig != null ? audioConfig.duckHoldSeconds : 0.32f;
            _duckReleaseAt = Time.unscaledTime + hold;
            Log("Music ducked");
        }

        void TickDuck()
        {
            float attack = audioConfig != null ? audioConfig.duckAttackSeconds : 0.05f;
            float release = audioConfig != null ? audioConfig.duckReleaseSeconds : 0.38f;
            float target = _musicDuckTargetDb;
            if (_duckReleaseAt > 0f && Time.unscaledTime >= _duckReleaseAt)
            {
                target = 0f;
                _musicDuckTargetDb = 0f;
                _duckReleaseAt = 0f;
            }

            float speed = target > _musicDuckDb
                ? (audioConfig != null ? audioConfig.rewardDuckDb : 3.5f) / Mathf.Max(0.01f, attack)
                : (audioConfig != null ? audioConfig.rewardDuckDb : 3.5f) / Mathf.Max(0.01f, release);
            _musicDuckDb = Mathf.MoveTowards(_musicDuckDb, target, speed * Time.unscaledDeltaTime);
        }

        void TickMusic()
        {
            AudioClip bed = ResolveMusicClip();
            if (_musicSource == null || bed == null)
                return;

            bool paused = _appMuted || (round != null && round.IsPaused);
            ArcadeRoundState state = round != null ? round.State : ArcadeRoundState.Initializing;

            if (_musicHoldoff > 0f)
                _musicHoldoff -= Time.unscaledDeltaTime;

            if (paused)
            {
                PauseMusic();
                ApplyMusicVolume();
                return;
            }

            bool afterWhistle = (state == ArcadeRoundState.Playing
                    || state == ArcadeRoundState.RoundEnding)
                && _musicHoldoff <= 0f;

            float fadeIn = audioConfig != null ? audioConfig.musicFadeInSeconds : 0.55f;
            float fadeOut = audioConfig != null ? audioConfig.musicFadeOutSeconds : 0.4f;

            if (afterWhistle)
            {
                EnsureMusicPlaying();
                _musicGain = Mathf.MoveTowards(
                    _musicGain, 1f, Time.unscaledDeltaTime / fadeIn);
            }
            else
            {
                _musicGain = Mathf.MoveTowards(
                    _musicGain, 0f, Time.unscaledDeltaTime / fadeOut);
                if (_musicGain <= 0.001f && (_musicSource.isPlaying || _musicSource.time > 0f))
                {
                    _musicSource.Stop();
                    _musicGain = 0f;
                    _musicDuckDb = 0f;
                    _musicDuckTargetDb = 0f;
                }
            }

            ApplyMusicVolume();
        }

        void EnsureMusicPlaying()
        {
            AudioClip bed = ResolveMusicClip();
            if (_musicSource == null || bed == null)
                return;

            _musicSource.loop = true;
            _musicSource.pitch = 1f;
            _musicSource.outputAudioMixerGroup = GroupFor(ArcadeAudioBus.Music);

            if (_musicSource.clip != bed)
            {
                _musicSource.Stop();
                _musicSource.clip = bed;
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
            if (_musicSource == null)
                return;
            float trim = audioConfig != null ? audioConfig.musicSourceVolume : musicVolume;
            _musicSource.pitch = 1f;
            _musicSource.volume = trim * _musicGain;
            ApplyMixerMusicDuck();
        }

        void ApplyMixerMusicDuck()
        {
            if (!_mixerReady || mixer == null)
                return;
            float db = MixerDb(DesignedMusicDb, musicSlider) - _musicDuckDb;
            mixer.SetFloat(ArcadeAudioConfig.MusicVolumeParam, db);
        }

        void StopMusicImmediate()
        {
            _musicGain = 0f;
            _musicDuckDb = 0f;
            _musicDuckTargetDb = 0f;
            _duckReleaseAt = 0f;
            _musicHoldoff = 0f;
            if (_musicSource == null)
                return;
            _musicSource.Stop();
            _musicSource.clip = null;
        }

        AudioSource CreateMusicSource()
        {
            AudioSource[] all = GetComponents<AudioSource>();
            AudioSource music = null;
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != null && all[i] != source && all[i].loop)
                {
                    music = all[i];
                    break;
                }
            }

            if (music == null)
                music = gameObject.AddComponent<AudioSource>();

            music.playOnAwake = false;
            music.spatialBlend = 0f;
            music.loop = true;
            music.pitch = 1f;
            music.priority = 192;
            music.volume = 0f;
            music.ignoreListenerPause = false;
            music.dopplerLevel = 0f;
            return music;
        }

        void BindMixer()
        {
            if (mixer == null && audioConfig != null)
            {
                // Mixer is assigned on the component; groups resolved by name.
            }

            if (mixer == null)
            {
                _mixerReady = false;
                return;
            }

            _buses[(int)ArcadeAudioBus.Master] = FirstGroup("Master");
            _buses[(int)ArcadeAudioBus.Music] = FirstGroup("Music");
            _buses[(int)ArcadeAudioBus.Ball] = FirstGroup("Ball");
            _buses[(int)ArcadeAudioBus.Impact] = FirstGroup("Impact");
            _buses[(int)ArcadeAudioBus.Basket] = FirstGroup("Basket");
            _buses[(int)ArcadeAudioBus.Reward] = FirstGroup("Reward");
            _buses[(int)ArcadeAudioBus.UI] = FirstGroup("UI");
            _mixerReady = _buses[(int)ArcadeAudioBus.Master] != null;
            if (_musicSource != null)
                _musicSource.outputAudioMixerGroup = GroupFor(ArcadeAudioBus.Music);
        }

        AudioMixerGroup FirstGroup(string name)
        {
            if (mixer == null)
                return null;
            AudioMixerGroup[] found = mixer.FindMatchingGroups(name);
            if (found == null || found.Length == 0)
                return null;
            for (int i = 0; i < found.Length; i++)
            {
                if (found[i] != null && found[i].name == name)
                    return found[i];
            }

            return found[0];
        }

        AudioMixerGroup GroupFor(ArcadeAudioBus bus)
        {
            int i = (int)bus;
            if (i < 0 || i >= _buses.Length)
                return _buses[(int)ArcadeAudioBus.Master];
            AudioMixerGroup group = _buses[i];
            if (group != null)
                return group;
            if (bus == ArcadeAudioBus.Ball || bus == ArcadeAudioBus.Impact
                || bus == ArcadeAudioBus.Basket || bus == ArcadeAudioBus.Reward)
                return _buses[(int)ArcadeAudioBus.Master];
            return _buses[(int)ArcadeAudioBus.Master];
        }

        void ApplyMixerSliders()
        {
            ApplyMixerSlider(ArcadeAudioConfig.MasterVolumeParam, DesignedMasterDb, masterSlider);
            ApplyMixerSlider(ArcadeAudioConfig.MusicVolumeParam, DesignedMusicDb, musicSlider);
            ApplyMixerSlider(ArcadeAudioConfig.SfxVolumeParam, DesignedSfxDb, sfxSlider);
            ApplyMixerSlider(ArcadeAudioConfig.UiVolumeParam, DesignedUiDb, uiSlider);
        }

        void ApplyMixerSlider(string param, float designedDb, float slider)
        {
            if (mixer == null)
                return;
            mixer.SetFloat(param, MixerDb(designedDb, slider));
        }

        static float MixerDb(float designedDb, float slider)
        {
            if (slider <= 0.0001f)
                return MuteDb;
            return designedDb + NormalizedToDb(slider);
        }

        public static float NormalizedToDb(float normalized)
        {
            float v = Mathf.Clamp(normalized, 0.0001f, 1f);
            return Mathf.Log10(v) * 20f;
        }

        ArcadeAudioCue ResolveTap() => WithLegacy(audioConfig != null ? audioConfig.tap : null, tapClips, ArcadeAudioBus.Ball, ArcadeAudioPriority.Low, 0.8f, 0.97f, 1.03f, 0.045f, 3, "Tap");
        ArcadeAudioCue ResolveBounce() => WithLegacy(audioConfig != null ? audioConfig.bounce : null, groundClips, ArcadeAudioBus.Ball, ArcadeAudioPriority.Medium, 0.88f, 0.96f, 1.04f, 0.085f, 2, "Bounce", 0.75f, 8f, 0.55f, 1f);
        ArcadeAudioCue ResolveRim() => WithLegacy(audioConfig != null ? audioConfig.rim : null, rimClips, ArcadeAudioBus.Impact, ArcadeAudioPriority.Medium, 0.9f, 0.97f, 1.03f, 0.08f, 1, "Rim", 0.55f, 9f, 0.6f, 1f);
        ArcadeAudioCue ResolveBackboard() => WithLegacy(audioConfig != null ? audioConfig.backboard : null, backboardClips, ArcadeAudioBus.Impact, ArcadeAudioPriority.Medium, 0.85f, 0.98f, 1.02f, 0.09f, 1, "Backboard", 0.55f, 9f, 0.55f, 1f);
        ArcadeAudioCue ResolveSwish() => WithLegacy(audioConfig != null ? audioConfig.swish : null, netSwish, ArcadeAudioBus.Basket, ArcadeAudioPriority.High, 0.98f, 0.98f, 1.02f, 0.2f, 2, "Swish");
        ArcadeAudioCue ResolveWhoosh() => WithLegacy(audioConfig != null ? audioConfig.swishWhoosh : null, netWhoosh, ArcadeAudioBus.Basket, ArcadeAudioPriority.High, 0.5f, 1f, 1f, 0.2f, 1, "Whoosh");
        ArcadeAudioCue ResolveNormalScore() => WithLegacy(audioConfig != null ? audioConfig.normalScore : null, scoreRim, ArcadeAudioBus.Reward, ArcadeAudioPriority.High, 0.9f, 0.99f, 1.01f, 0.25f, 1, "Score");
        ArcadeAudioCue ResolveBackboardScore()
        {
            ArcadeAudioCue cue = audioConfig != null ? audioConfig.backboardScore : null;
            if (cue != null && cue.HasClips)
                return cue;
            return WithLegacy(null, scoreBackboard, ArcadeAudioBus.Reward, ArcadeAudioPriority.High, 0.88f, 0.99f, 1.01f, 0.25f, 1, "BankScore");
        }

        ArcadeAudioCue ResolveClean() => WithLegacy(audioConfig != null ? audioConfig.cleanScore : null, scorePerfect, ArcadeAudioBus.Reward, ArcadeAudioPriority.VeryHigh, 0.98f, 1f, 1f, 0.4f, 1, "Clean");
        ArcadeAudioCue ResolveCombo(int comboCount)
        {
            ArcadeAudioCue cue = null;
            if (audioConfig != null)
            {
                if (comboCount >= 4)
                    cue = audioConfig.comboHigh;
                else if (comboCount == 3)
                    cue = audioConfig.comboLevel3;
                else
                    cue = audioConfig.comboLevel2;
            }

            if (cue != null && cue.HasClips)
                return cue;
            return ResolveClean();
        }

        ArcadeAudioCue ResolveGameOver() => WithLegacy(audioConfig != null ? audioConfig.gameOver : null, buzzer, ArcadeAudioBus.Reward, ArcadeAudioPriority.VeryHigh, 0.92f, 1f, 1f, 1f, 1, "GameOver");
        ArcadeAudioCue ResolveWhistle() => WithLegacy(audioConfig != null ? audioConfig.whistle : null, whistle, ArcadeAudioBus.UI, ArcadeAudioPriority.High, 0.88f, 1f, 1f, 0.3f, 1, "Whistle");
        ArcadeAudioCue ResolveBuzzer() => WithLegacy(audioConfig != null ? audioConfig.buzzer : null, buzzer, ArcadeAudioBus.Reward, ArcadeAudioPriority.VeryHigh, 1f, 1f, 1f, 0.5f, 1, "Buzzer");
        ArcadeAudioCue ResolveHoopMove() => WithLegacy(audioConfig != null ? audioConfig.hoopMove : null, hoopMove, ArcadeAudioBus.UI, ArcadeAudioPriority.Low, 0.5f, 1f, 1f, 0.12f, 1, "HoopMove");
        ArcadeAudioCue ResolveUi() => WithLegacy(audioConfig != null ? audioConfig.uiButton : null, (AudioClip)null, ArcadeAudioBus.UI, ArcadeAudioPriority.Low, 0.7f, 1f, 1f, 0.05f, 2, "UI");

        AudioClip ResolveWhistleClip()
        {
            ArcadeAudioCue cue = ResolveWhistle();
            if (cue != null && cue.HasClips)
            {
                for (int i = 0; i < cue.clips.Length; i++)
                {
                    if (cue.clips[i] != null)
                        return cue.clips[i];
                }
            }

            return whistle;
        }

        AudioClip ResolveMusicClip()
        {
            if (audioConfig != null && audioConfig.backgroundMusic != null)
                return audioConfig.backgroundMusic;
            return backgroundMusic;
        }

        ArcadeAudioCue WithLegacy(
            ArcadeAudioCue configCue,
            AudioClip[] legacy,
            ArcadeAudioBus bus,
            ArcadeAudioPriority priority,
            float volume,
            float pitchMin,
            float pitchMax,
            float cooldown,
            int maxSim,
            string name,
            float minVel = 0f,
            float maxVel = 0f,
            float intensityLo = 0.4f,
            float intensityHi = 1f)
        {
            if (configCue != null && configCue.HasClips)
                return configCue;
            return BuildFallback(legacy, bus, priority, volume, pitchMin, pitchMax, cooldown, maxSim, name, minVel, maxVel, intensityLo, intensityHi);
        }

        ArcadeAudioCue WithLegacy(
            ArcadeAudioCue configCue,
            AudioClip legacy,
            ArcadeAudioBus bus,
            ArcadeAudioPriority priority,
            float volume,
            float pitchMin,
            float pitchMax,
            float cooldown,
            int maxSim,
            string name)
        {
            if (configCue != null && configCue.HasClips)
                return configCue;
            AudioClip[] arr = legacy != null ? new[] { legacy } : null;
            return BuildFallback(arr, bus, priority, volume, pitchMin, pitchMax, cooldown, maxSim, name, 0f, 0f, 0.4f, 1f);
        }

        ArcadeAudioCue BuildFallback(
            AudioClip[] clips,
            ArcadeAudioBus bus,
            ArcadeAudioPriority priority,
            float volume,
            float pitchMin,
            float pitchMax,
            float cooldown,
            int maxSim,
            string name,
            float minVel,
            float maxVel,
            float intensityLo,
            float intensityHi)
        {
            if (clips == null || clips.Length == 0)
                return null;
            ArcadeAudioCue cue = new ArcadeAudioCue
            {
                debugName = name,
                clips = clips,
                volume = volume,
                pitchRange = new Vector2(pitchMin, pitchMax),
                cooldown = cooldown,
                maxSimultaneousInstances = maxSim,
                preventDuplicateClip = true,
                mixerBus = bus,
                priority = priority,
                minimumCollisionVelocity = minVel,
                maximumCollisionVelocity = maxVel,
                intensityVolume = new Vector2(intensityLo, intensityHi),
            };
            return cue;
        }

        static void PlayHaptic(HapticBridge.Strength strength)
        {
#if !UNITY_EDITOR
            HapticBridge.Play(strength);
#endif
        }

        void Log(string message)
        {
            if (!enableAudioDebugLogs)
                return;
            Debug.Log("[Audio] " + message, this);
        }

        struct CueRuntime
        {
            public float nextAllowed;
            public int lastClipIndex;
        }

        struct DelayedPlay
        {
            public const byte KindNone = 0;
            public const byte KindNormal = 1;
            public const byte KindBank = 2;
            public const byte KindClean = 3;
            public const byte KindCombo = 4;

            public byte kind;
            public float fireAt;
            public int generation;
            public int combo;
        }
    }
}
