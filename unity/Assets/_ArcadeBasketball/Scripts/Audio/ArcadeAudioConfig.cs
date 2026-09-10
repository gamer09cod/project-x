using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// All arcade mix and cue tuning. ArcadeAudio reads this; gameplay never does.
    /// </summary>
    [CreateAssetMenu(
        menuName = "Project X/Arcade Basketball/Audio Config",
        fileName = "ArcadeAudioConfig")]
    public sealed class ArcadeAudioConfig : ScriptableObject
    {
        public const string MasterVolumeParam = "MasterVolume";
        public const string MusicVolumeParam = "MusicVolume";
        public const string SfxVolumeParam = "SFXVolume";
        public const string UiVolumeParam = "UIVolume";

        [Header("Mixer (designed mix at slider = 1)")]
        [Tooltip("Master fader at full slider.")]
        public float masterMixDb = -2.5f;

        [Tooltip("Music group at full slider. Keep below SFX, but audible as a bed.")]
        public float musicMixDb = -10f;

        [Tooltip("Gameplay parent group at full slider.")]
        public float sfxMixDb = 0f;

        [Tooltip("UI group at full slider.")]
        public float uiMixDb = -4f;

        [Header("Music source")]
        public AudioClip backgroundMusic;

        [Range(0.05f, 1f)]
        [Tooltip("Trim on the music voice. Mixer musicMixDb does the category cut.")]
        public float musicSourceVolume = 0.85f;

        [Tooltip("Fade in after the opening whistle.")]
        public float musicFadeInSeconds = 0.55f;

        [Tooltip("Fade out when the round is no longer live.")]
        public float musicFadeOutSeconds = 0.4f;

        [Header("Reward duck (music group, dB)")]
        [Tooltip("How far to dip Music on CLEAN / combo / game over.")]
        public float rewardDuckDb = 3.5f;

        [Tooltip("Seconds to reach the ducked level.")]
        public float duckAttackSeconds = 0.05f;

        [Tooltip("Seconds to hold the duck before release.")]
        public float duckHoldSeconds = 0.32f;

        [Tooltip("Seconds to restore music.")]
        public float duckReleaseSeconds = 0.38f;

        [Header("Score sequence")]
        [Tooltip("Delay from swish to the normal-score sting.")]
        public float normalScoreDelay = 0.045f;

        [Tooltip("Delay from swish to CLEAN / combo.")]
        public float cleanScoreDelay = 0.055f;

        [Header("Source pool")]
        [Range(4, 16)]
        public int sfxPoolSize = 10;

        [Header("Cues — Ball")]
        public ArcadeAudioCue tap;
        public ArcadeAudioCue bounce;

        [Header("Cues — Impact")]
        public ArcadeAudioCue rim;
        public ArcadeAudioCue backboard;

        [Header("Cues — Basket")]
        public ArcadeAudioCue swish;
        public ArcadeAudioCue swishWhoosh;

        [Header("Cues — Reward")]
        public ArcadeAudioCue normalScore;
        public ArcadeAudioCue backboardScore;
        public ArcadeAudioCue cleanScore;
        public ArcadeAudioCue comboLevel2;
        public ArcadeAudioCue comboLevel3;
        public ArcadeAudioCue comboHigh;
        public ArcadeAudioCue gameOver;

        [Header("Cues — Round / UI")]
        public ArcadeAudioCue whistle;
        public ArcadeAudioCue buzzer;
        public ArcadeAudioCue hoopMove;
        public ArcadeAudioCue uiButton;

        public static bool TryGet(
            ArcadeAudioConfig config,
            Object context,
            out ArcadeAudioConfig ready)
        {
            ready = config;
            if (config != null)
                return true;

            Debug.LogError("[ArcadeBasketball] ArcadeAudioConfig is not assigned.", context);
            Debug.Assert(false, "ArcadeAudioConfig is required.", context);
            return false;
        }

        void OnValidate()
        {
            masterMixDb = Mathf.Clamp(masterMixDb, -24f, 0f);
            musicMixDb = Mathf.Clamp(musicMixDb, -40f, 0f);
            sfxMixDb = Mathf.Clamp(sfxMixDb, -24f, 6f);
            uiMixDb = Mathf.Clamp(uiMixDb, -24f, 6f);
            musicSourceVolume = Mathf.Clamp(musicSourceVolume, 0.05f, 1f);
            musicFadeInSeconds = Mathf.Max(0.05f, musicFadeInSeconds);
            musicFadeOutSeconds = Mathf.Max(0.05f, musicFadeOutSeconds);
            rewardDuckDb = Mathf.Clamp(rewardDuckDb, 0f, 8f);
            duckAttackSeconds = Mathf.Clamp(duckAttackSeconds, 0.01f, 0.2f);
            duckHoldSeconds = Mathf.Clamp(duckHoldSeconds, 0.05f, 1f);
            duckReleaseSeconds = Mathf.Clamp(duckReleaseSeconds, 0.05f, 1.5f);
            normalScoreDelay = Mathf.Clamp(normalScoreDelay, 0f, 0.4f);
            cleanScoreDelay = Mathf.Clamp(cleanScoreDelay, 0f, 0.4f);
            sfxPoolSize = Mathf.Clamp(sfxPoolSize, 4, 16);
            ClampCue(tap);
            ClampCue(bounce);
            ClampCue(rim);
            ClampCue(backboard);
            ClampCue(swish);
            ClampCue(swishWhoosh);
            ClampCue(normalScore);
            ClampCue(backboardScore);
            ClampCue(cleanScore);
            ClampCue(comboLevel2);
            ClampCue(comboLevel3);
            ClampCue(comboHigh);
            ClampCue(gameOver);
            ClampCue(whistle);
            ClampCue(buzzer);
            ClampCue(hoopMove);
            ClampCue(uiButton);
        }

        static void ClampCue(ArcadeAudioCue cue)
        {
            if (cue == null)
                return;
            cue.volume = Mathf.Clamp01(cue.volume);
            cue.cooldown = Mathf.Max(0f, cue.cooldown);
            cue.maxSimultaneousInstances = Mathf.Max(1, cue.maxSimultaneousInstances);
            cue.minimumCollisionVelocity = Mathf.Max(0f, cue.minimumCollisionVelocity);
            cue.maximumCollisionVelocity = Mathf.Max(
                cue.minimumCollisionVelocity, cue.maximumCollisionVelocity);
            cue.pitchRange.x = Mathf.Clamp(cue.pitchRange.x, 0.5f, 2f);
            cue.pitchRange.y = Mathf.Clamp(cue.pitchRange.y, 0.5f, 2f);
            if (cue.pitchRange.y < cue.pitchRange.x)
            {
                float swap = cue.pitchRange.x;
                cue.pitchRange.x = cue.pitchRange.y;
                cue.pitchRange.y = swap;
            }

            cue.intensityVolume.x = Mathf.Clamp01(cue.intensityVolume.x);
            cue.intensityVolume.y = Mathf.Clamp01(cue.intensityVolume.y);
        }
    }
}
