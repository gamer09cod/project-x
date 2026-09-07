using UnityEngine;

[RequireComponent(typeof(AudioSource))]
public class GameAudio : MonoBehaviour
{
    static GameAudio instance;

    [Header("Throw / rim")]
    public AudioClip[] bounce;

    [Header("Miss recycle")]
    public AudioClip[] bounceOutdoor;

    [Header("Backboard")]
    public AudioClip[] boardHit;

    [Header("Score")]
    public AudioClip scorePerfect;
    public AudioClip scoreHoop;
    public AudioClip scoreBackboard;

    [Header("BgMusic")]
    public AudioClip bgMusic;

    AudioSource source;
    AudioSource musicSource;
    float lastHitTime;
    /// <summary>True while an embed run is active (BeginEmbed → Pause/end).</summary>
    bool _gameplayActive;

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
        source.playOnAwake = false;
        source.spatialBlend = 0f;
        source.ignoreListenerPause = false;
        source.loop = false;

        musicSource = gameObject.AddComponent<AudioSource>();
        musicSource.playOnAwake = false;
        musicSource.spatialBlend = 0f;
        musicSource.ignoreListenerPause = false;
        musicSource.loop = true;
    }

    void Start()
    {
        StopAll();
    }

    /// <summary>
    /// Enable music+SFX for an active embed run. Call from BeginEmbedMatch / Resume.
    /// </summary>
    public void SetGameplayActive(bool active)
    {
        _gameplayActive = active;
        if (active)
            PlayBgMusic();
        else
            StopAll();
    }

    public void StopAll()
    {
        _gameplayActive = false;
        if (musicSource != null)
        {
            musicSource.Stop();
            musicSource.clip = null;
        }
        if (source != null)
            source.Stop();
    }

    /// <summary>App minimize — mute without ending the run session.</summary>
    void MuteTransient()
    {
        if (musicSource != null && musicSource.isPlaying)
            musicSource.Pause();
        if (source != null)
            source.Stop();
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
        musicSource.volume = 0.55f;
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

    public void PlayMiss()
    {
        PlayRandom(bounceOutdoor, 0.7f);
    }

    public void PlayBuzzer()
    {
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
        Play(clips[Random.Range(0, clips.Length)], volume, pitch);
    }

    void Play(AudioClip clip, float volume, float pitch = 1f)
    {
        if (!_gameplayActive || !clip || !source)
            return;
        source.pitch = pitch;
        source.PlayOneShot(clip, volume);
    }
}
