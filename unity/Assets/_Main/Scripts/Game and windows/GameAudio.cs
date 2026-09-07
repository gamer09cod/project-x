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
    bool _allowMusic;

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
        // Must respect AudioListener.pause — RN pauseUnity / app background.
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
        // Do not auto-play: embed host stays mounted behind results/tabs.
        // BeginEmbedMatch / SetGameplayActive(true) starts music.
        StopAll();
    }

    /// <summary>
    /// Enable music+SFX for an active embed run. Call from BeginEmbedMatch / Resume.
    /// </summary>
    public void SetGameplayActive(bool active)
    {
        _allowMusic = active;
        if (active)
            PlayBgMusic();
        else
            StopAll();
    }

    public void StopAll()
    {
        _allowMusic = false;
        if (musicSource != null)
        {
            musicSource.Stop();
            musicSource.clip = null;
        }
        if (source != null)
            source.Stop();
    }

    public void PlayBgMusic()
    {
        if (!_allowMusic || !bgMusic || !musicSource)
            return;
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
            StopAll();
    }

    void OnApplicationFocus(bool hasFocus)
    {
        if (!hasFocus)
        {
            StopAll();
            return;
        }

        // Android may resume the player on maximize; only restore music in an active run.
        var game = Game.Instance;
        if (game != null && game.embedMatchMode && !game.paused && _allowMusic)
            PlayBgMusic();
        else
            StopAll();
    }

    void PlayRandom(AudioClip[] clips, float volume, float minGap = 0f, float pitch = 1f)
    {
        if (!_allowMusic)
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
        if (!_allowMusic || !clip || !source)
            return;
        source.pitch = pitch;
        source.PlayOneShot(clip, volume);
    }
}
