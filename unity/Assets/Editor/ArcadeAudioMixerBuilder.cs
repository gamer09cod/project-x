using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using ProjectX.ArcadeBasketball;

namespace ProjectX.Editor
{
    /// <summary>
    /// Rebuilds mixer exposure / snapshot mix if the YAML mixer imported but
    /// exposed parameters failed. Does not duplicate ArcadeAudio.
    /// </summary>
    public static class ArcadeAudioMixerBuilder
    {
        const string MixerPath = "Assets/_ArcadeBasketball/Audio/Mixers/GameAudioMixer.mixer";
        const string ConfigPath = "Assets/_ArcadeBasketball/Config/ArcadeAudioConfig.asset";

        [MenuItem("Project-X/Arcade Basketball/Verify Audio Mixer")]
        public static void Verify()
        {
            AudioMixer mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            if (mixer == null)
            {
                Debug.LogError("GameAudioMixer is missing at " + MixerPath);
                return;
            }

            string[] names =
            {
                ArcadeAudioConfig.MasterVolumeParam,
                ArcadeAudioConfig.MusicVolumeParam,
                ArcadeAudioConfig.SfxVolumeParam,
                ArcadeAudioConfig.UiVolumeParam,
            };

            bool ok = true;
            for (int i = 0; i < names.Length; i++)
            {
                float unused;
                if (!mixer.GetFloat(names[i], out unused))
                {
                    Debug.LogError("Mixer is missing exposed parameter " + names[i]);
                    ok = false;
                }
            }

            string[] groups = { "Master", "Music", "Gameplay", "Ball", "Impact", "Basket", "Reward", "UI" };
            for (int i = 0; i < groups.Length; i++)
            {
                AudioMixerGroup[] found = mixer.FindMatchingGroups(groups[i]);
                if (found == null || found.Length == 0)
                {
                    Debug.LogError("Mixer is missing group " + groups[i]);
                    ok = false;
                }
            }

            ArcadeAudioConfig config = AssetDatabase.LoadAssetAtPath<ArcadeAudioConfig>(ConfigPath);
            if (config == null)
            {
                Debug.LogError("ArcadeAudioConfig is missing at " + ConfigPath);
                ok = false;
            }

            if (ok)
                Debug.Log("Arcade audio mixer and config verified.");
        }

        [MenuItem("Project-X/Arcade Basketball/Apply Audio Import Settings")]
        public static void ApplyImportSettings()
        {
            string[] guids = AssetDatabase.FindAssets("t:AudioClip", new[] { "Assets/Resources/Audio" });
            int sfx = 0;
            int music = 0;
            for (int i = 0; i < guids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                AudioImporter importer = AssetImporter.GetAtPath(path) as AudioImporter;
                if (importer == null)
                    continue;

                bool isMusic = path.IndexOf("background-music", System.StringComparison.OrdinalIgnoreCase) >= 0;
                AudioImporterSampleSettings settings = importer.defaultSampleSettings;
                if (isMusic)
                {
                    settings.loadType = AudioClipLoadType.Streaming;
                    settings.compressionFormat = AudioCompressionFormat.Vorbis;
                    settings.quality = 0.7f;
                    importer.forceToMono = false;
                    music++;
                }
                else
                {
                    settings.loadType = AudioClipLoadType.DecompressOnLoad;
                    settings.compressionFormat = AudioCompressionFormat.ADPCM;
                    importer.forceToMono = true;
                    sfx++;
                }

                importer.defaultSampleSettings = settings;
                importer.SaveAndReimport();
            }

            Debug.Log("Applied arcade audio import settings. sfx=" + sfx + " music=" + music);
        }
    }
}
