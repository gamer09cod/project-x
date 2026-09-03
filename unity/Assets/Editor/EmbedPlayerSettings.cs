using UnityEditor;
using UnityEngine;

namespace ProjectX.Editor
{
    /// <summary>
    /// Pins player settings for the azesmway embed. Run from Unity menu
    /// Project-X / Apply Embed Player Settings before exporting.
    /// </summary>
    public static class EmbedPlayerSettings
    {
        [MenuItem("Project-X/Apply Embed Player Settings")]
        public static void Apply()
        {
            PlayerSettings.companyName = "project-x";
            PlayerSettings.productName = "ProjectX";
            PlayerSettings.bundleVersion = "0.3.0";
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.iOS, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.rmgx.swap");
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, "com.rmgx.swap");
            // Unity 6000.1 minimum is API 25 (Android 7.1). Keep RN minSdk in sync.
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel25;
            PlayerSettings.Android.targetArchitectures =
                AndroidArchitecture.ARMv7 | AndroidArchitecture.ARM64;
            Debug.Log(
                "Applied IL2CPP embed player settings. Export Android to mobile/unity/builds/android. Build iOS UnityFramework into mobile/unity/builds/ios.");
        }
    }
}
