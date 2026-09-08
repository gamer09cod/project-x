using UnityEngine;

[RequireComponent(typeof(AudioSource))]
public class GameAudio : MonoBehaviour
{
    const float ClockWarnAt = 10f;
    const float ClockUrgentAt = 5f;

    static GameAudio instance;

    [Header("Throw / rim")]
    public AudioClip[] bounce;

    [Header("Miss recycle / ground")]
    public AudioClip[] bounceOutdoor;

    [Header("Backboard")]
    public AudioClip[] boardHit;

    [Header("Score")]
    public AudioClip scorePerfect;
    public AudioClip scoreHoop;
    public AudioClip scoreBackboard;

    [Header("BgMusic")]
    public AudioClip bgMusic;

    [Header("Net / three / buzzer / clock")]
    public AudioClip[] netSwish;
    public AudioClip netWhoosh;
    public AudioClip threeSting;
    public AudioClip threeCheer;
    public AudioClip buzzer;
    public AudioClip missSting;
    public AudioClip clockTick;
    public AudioClip clockBeep;

    AudioSource source;
    AudioSource musicSource;
    /// <summary>Layered celebration (cheer) so score one-shots cannot steal the voice.</summary>
    AudioSource layerSource;
    float lastHitTime;
    /// <summary>True while an embed run is active (BeginEmbed → Pause/end).</summary>
    bool _gameplayActive;

    bool _clockWarnPlayed;
    bool _clockUrgent;
    float _nextUrgentTickAt;

    public static GameAudio Instance
    {
        get
        {
            if (!instance)
                instance = FindFirstObjectByType<GameAudio>();
            return instance;
        }
    }

    void Awake()
    {
        instance = this;
        source = GetComponent<AudioSource>();
        if (!source)
            source = gameObject.AddComponent<AudioSource>();
        ConfigureSfxSource(source);

        musicSource = gameObject.AddComponent<AudioSource>();
        musicSource.playOnAwake = false;
        musicSource.spatialBlend = 0f;
        musicSource.ignoreListenerPause = false;
        musicSource.loop = true;

        layerSource = gameObject.AddComponent<AudioSource>();
        ConfigureSfxSource(layerSource);
        layerSource.priority = 32;
    }

    static void ConfigureSfxSource(AudioSource s)
    {
        s.playOnAwake = false;
        s.spatialBlend = 0f;
        s.ignoreListenerPause = false;
        s.loop = false;
        s.mute = false;
        s.volume = 1f;
        s.pitch = 1f;
    }

    void Start()
    {
        // Stay silent until Game.SetGameplayActive / BeginEmbedMatch enables audio.
        if (!_gameplayActive)
        {
            if (musicSource != null)
                musicSource.Stop();
            if (source != null)
                source.Stop();
            if (layerSource != null)
                layerSource.Stop();
        }
    }

    void LateUpdate()
    {
        if (!_gameplayActive)
            return;

        var game = Game.Instance;
        if (game == null || game.shotClock == null || !game.shotClock.started || game.paused)
        {
            ResetClockWarnState();
            return;
        }

        // Buzzer window already has its own sting — don't stack ticks.
        if (game.shotClock.isBuzzerBeater)
        {
            ResetClockWarnState();
            return;
        }

        float remaining = game.shotClock.remaining;
        if (remaining <= 0f || remaining > ClockWarnAt)
        {
            ResetClockWarnState();
            return;
        }

        if (!_clockWarnPlayed && remaining <= ClockWarnAt)
        {
            _clockWarnPlayed = true;
            Play(clockBeep, 0.7f);
        }

        if (remaining <= ClockUrgentAt)
        {
            if (!_clockUrgent)
            {
                _clockUrgent = true;
                _nextUrgentTickAt = 0f;
            }

            if (Time.unscaledTime >= _nextUrgentTickAt)
            {
                Play(clockTick != null ? clockTick : clockBeep, 0.85f, 1.05f);
                _nextUrgentTickAt = Time.unscaledTime + 1f;
            }
        }
    }

    /// <summary>
    /// Enable music+SFX for an active embed run. Call from BeginEmbedMatch / Resume.
    /// </summary>
    public void SetGameplayActive(bool active)
    {
        _gameplayActive = active;
        if (active)
        {
            ResetClockWarnState();
            PlayBgMusic();
        }
        else
            StopAll();
    }

    public void StopAll()
    {
        _gameplayActive = false;
        ResetClockWarnState();
        CancelInvoke();
        if (musicSource != null)
        {
            musicSource.Stop();
            musicSource.clip = null;
        }
        if (source != null)
            source.Stop();
        if (layerSource != null)
            layerSource.Stop();
    }

    void ResetClockWarnState()
    {
        _clockWarnPlayed = false;
        _clockUrgent = false;
        _nextUrgentTickAt = 0f;
    }

    /// <summary>App minimize — mute without ending the run session.</summary>
    void MuteTransient()
    {
        if (musicSource != null && musicSource.isPlaying)
            musicSource.Pause();
        if (source != null)
            source.Stop();
        if (layerSource != null)
            layerSource.Stop();
    }

    void RestoreIfGameplay()
    {
        if (!_gameplayActive)
            return;
        var game = Game.Instance;
        if (game == null || !game.embedMatchMode || game.paused)
            return;
        PlayBgMusic();
        // RN unpauses Unity shortly after AppState=active; re-assert BGM once.
        CancelInvoke(nameof(PlayBgMusic));
        Invoke(nameof(PlayBgMusic), 0.2f);
    }

    public void PlayBgMusic()
    {
        if (!_gameplayActive || !bgMusic || !musicSource)
            return;
        if (musicSource.clip == bgMusic && musicSource.time > 0f && !musicSource.isPlaying)
        {
            musicSource.UnPause();
            return;
        }
        if (musicSource.isPlaying && musicSource.clip == bgMusic)
            return;
        musicSource.clip = bgMusic;
        musicSource.loop = true;
        musicSource.volume = 0.28f;
        musicSource.pitch = 1f;
        musicSource.Play();
    }

    public void PlayThrow()
    {
        PlayRandom(bounce, 0.85f);
    }

    public void PlayRim()
    {
        PlayRandom(bounce, 0.9f, 0.06f);
    }

    public void PlayBackboard()
    {
        PlayRandom(boardHit, 1f, 0.06f);
    }

    /// <summary>Ball enters the rim / net tunnel.</summary>
    public void PlayNetSwish()
    {
        PlayRandom(netSwish, 0.75f);
        Play(netWhoosh, 0.45f, 1.1f);
    }

    /// <summary>Miss resolved after recycle — soft descending dud (ground already played).</summary>
    public void PlayMiss()
    {
        if (missSting != null)
            Play(missSting, 0.7f);
        else
            PlayRandom(bounceOutdoor, 0.7f);
    }

    /// <summary>Ball recycled from below (hits “ground” then returns).</summary>
    public void PlayGroundBounce()
    {
        PlayRandom(bounceOutdoor, 0.9f, 0f, 0.92f);
    }

    /// <summary>Buzzer-beater window active (clock at 0 with ball in air).</summary>
    public void PlayBuzzer()
    {
        // Full-rate on the layer voice so the sting stays crisp while timeScale
        // is 0.3x — same pattern as three_cheer.
        if (buzzer != null)
            PlayLayered(buzzer, 1f, 1f);
        else
            PlayRandom(bounceOutdoor, 0.55f, 0f, 0.85f);
    }

    public void PlayScore(ShotQuality quality)
    {
        AudioClip clip = scoreHoop;
        if (quality == ShotQuality.Perfect)
            clip = scorePerfect;
        else if (quality == ShotQuality.Backboard)
            clip = scoreBackboard;
        Play(clip, 1f);

        // Perfect = 3 pts — crowd cheer on a separate voice so it is not lost
        // under the net/score one-shot.
        if (quality == ShotQuality.Perfect)
            PlayThreePointer();
    }

    public void PlayThreePointer()
    {
        CancelInvoke(nameof(PlayThreeCheerNow));
        // Slight delay so the cheer sits after the net hit, not under it.
        Invoke(nameof(PlayThreeCheerNow), 0.08f);
    }

    void PlayThreeCheerNow()
    {
        if (!_gameplayActive)
            return;
        if (threeCheer != null)
            PlayLayered(threeCheer, 1f);
        else if (threeSting != null)
            PlayLayered(threeSting, 0.75f);
    }

    void OnApplicationPause(bool pauseStatus)
    {
        if (pauseStatus)
            MuteTransient();
        else
            RestoreIfGameplay();
    }

    void OnApplicationFocus(bool hasFocus)
    {
        if (!hasFocus)
            MuteTransient();
        else
            RestoreIfGameplay();
    }

    void PlayRandom(AudioClip[] clips, float volume, float minGap = 0f, float pitch = 1f)
    {
        if (!_gameplayActive)
            return;
        if (clips == null || clips.Length == 0)
            return;
        if (minGap > 0f && Time.unscaledTime - lastHitTime < minGap)
            return;
        if (minGap > 0f)
            lastHitTime = Time.unscaledTime;

        AudioClip pick = null;
        for (int i = 0; i < 4; i++)
        {
            AudioClip c = clips[Random.Range(0, clips.Length)];
            if (c != null)
            {
                pick = c;
                break;
            }
        }
        Play(pick, volume, pitch);
    }

    void Play(AudioClip clip, float volume, float pitch = 1f)
    {
        if (!_gameplayActive || !clip || !source)
            return;
        source.pitch = pitch;
        source.PlayOneShot(clip, volume);
    }

    void PlayLayered(AudioClip clip, float volume, float pitch = 1f)
    {
        if (!_gameplayActive || !clip)
            return;
        AudioSource s = layerSource != null ? layerSource : source;
        if (s == null)
            return;
        s.pitch = pitch;
        s.PlayOneShot(clip, volume);
    }
}
