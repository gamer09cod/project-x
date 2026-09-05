using System;
using ProjectX.Bridge;
using UnityEngine;

namespace ProjectX.Gameplay
{
    /// <summary>
    /// Starts Swish Shot <see cref="Game"/> embed match from RN startRun.
    /// Expects build scene Assets/_Main/Scenes/Main.unity (Game in scene).
    /// </summary>
    public sealed class SwishShotRunHost : MonoBehaviour
    {
        public static bool IsAvailable()
        {
            return Game.Instance != null;
        }

        public void Begin(RunConfig config, Action<string> onFinished)
        {
            var game = Game.Instance;
            if (game == null)
            {
                Debug.LogError(
                    "SwishShotRunHost: Game.Instance missing — set build scene to Assets/_Main/Scenes/Main.unity.");
                onFinished?.Invoke(BuildEmptyPayload(config));
                return;
            }

            float seconds = config.RunDurationMs > 0 ? config.RunDurationMs / 1000f : 60f;
            game.BeginEmbedMatch(
                seconds,
                config.ClientRunId,
                UnityBuildId.Value,
                onFinished);
        }

        static string BuildEmptyPayload(RunConfig config)
        {
            return
                "{\"v\":1,\"type\":\"scorePayload\",\"payload\":{" +
                "\"schemaVersion\":1,\"score\":0,\"durationMs\":0,\"clockEndedAtMs\":0," +
                "\"hasUsedBuzzerBeater\":false,\"buzzerBeaterTriggered\":false,\"shotLog\":[]," +
                "\"clientRunId\":\"" + RnBridge.EscapeJson(config != null ? config.ClientRunId : "") + "\"," +
                "\"unityBuildId\":\"" + RnBridge.EscapeJson(UnityBuildId.Value) + "\"}}";
        }
    }
}
