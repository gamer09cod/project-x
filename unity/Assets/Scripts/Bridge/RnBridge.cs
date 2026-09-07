using System.Globalization;
using UnityEngine;

namespace ProjectX.Bridge
{
    /// <summary>
    /// Accepted startRun config. Display fields only — no money authority.
    /// </summary>
    public sealed class RunConfig
    {
        public string MatchId;
        public string ClientRunId;
        public string GameId;
        public string Mode;
        public int Seat;
        public int StakeCents;
        public int? OpponentPostedScore;
        public string ScoreDeadlineAt;
        public int RunDurationMs;
        public long ServerNowEpochMs;
        public long GameStartEpochMs;
        public long GameEndEpochMs;
    }

    /// <summary>
    /// Phase 6 host. GameObject name must stay BridgeHost (RN postMessage target).
    /// </summary>
    public sealed class RnBridge : MonoBehaviour
    {
        RunConfig _active;
        bool _runActive;
        string _status = "waiting for startRun";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            var existing = Object.FindFirstObjectByType<RnBridge>();
            if (existing != null)
            {
                // RN postMessage targets GameObject name BridgeHost only.
                if (existing.gameObject.name != "BridgeHost")
                {
                    existing.gameObject.name = "BridgeHost";
                }
                return;
            }

            var host = new GameObject("BridgeHost");
            host.AddComponent<RnBridge>();
            // BasketballRun is stub fallback when _Main Game scene is not loaded.
            if (FindFirstObjectByType<Game>() == null)
            {
                host.AddComponent<ProjectX.Gameplay.BasketballRun>();
            }
            DontDestroyOnLoad(host);

            if (Camera.main == null)
            {
                var camGo = new GameObject("Main Camera");
                camGo.tag = "MainCamera";
                var cam = camGo.AddComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.05f, 0.09f, 0.14f);
                cam.orthographic = true;
            }
        }

        public void ReceiveFromRn(string message)
        {
            if (string.IsNullOrEmpty(message))
            {
                return;
            }

            var type = ExtractJsonString(message, "type");
            if (type == "ping")
            {
                HandlePing(message);
                return;
            }

            if (type == "abortRun")
            {
                AbortActiveRun();
                return;
            }

            if (type == "startRun")
            {
                HandleStartRun(message);
                return;
            }

            _status = "ignored type=" + type;
        }

        /// <summary>
        /// Clears leftover embed state. Unity stays mounted — next startRun must
        /// reset the playfield even after scorePayload (_runActive already false).
        /// </summary>
        void AbortActiveRun()
        {
            _runActive = false;
            _active = null;

            if (Game.Instance != null)
            {
                Game.Instance.CancelEmbedMatch();
            }

            var stub = GetComponent<ProjectX.Gameplay.BasketballRun>();
            if (stub != null)
            {
                stub.Abort();
            }

            _status = "aborted · waiting for startRun";
        }

        void HandlePing(string message)
        {
            var nonce = ExtractJsonString(message, "nonce");
            var pong =
                "{\"v\":1,\"type\":\"pong\",\"nonce\":\"" +
                EscapeJson(nonce) +
                "\",\"unityBuildId\":\"" +
                EscapeJson(UnityBuildId.Value) +
                "\"}";
            NativeApi.SendToMobileApp(pong);
            _status = "pong sent";
        }

        void HandleStartRun(string message)
        {
            var incomingId = ExtractJsonString(message, "clientRunId");
            // Same clientRunId while active — duplicate postMessage; ignore.
            if (_runActive && _active != null && incomingId == _active.ClientRunId)
            {
                return;
            }

            // New id, or start after scorePayload (_runActive false) — reset first.
            AbortActiveRun();

            var config = ParseStartRun(message);
            if (config == null || string.IsNullOrEmpty(config.ClientRunId))
            {
                _status = "invalid startRun";
                return;
            }

            _active = config;
            _runActive = true;
            _status = "run active · " + config.ClientRunId;

            if (ProjectX.Gameplay.SwishShotRunHost.IsAvailable())
            {
                var swish = GetComponent<ProjectX.Gameplay.SwishShotRunHost>();
                if (swish == null)
                {
                    swish = gameObject.AddComponent<ProjectX.Gameplay.SwishShotRunHost>();
                }
                swish.Begin(config, OnRunFinished);
            }
            else
            {
                var run = GetComponent<ProjectX.Gameplay.BasketballRun>();
                if (run == null)
                {
                    run = gameObject.AddComponent<ProjectX.Gameplay.BasketballRun>();
                }
                run.Begin(config, OnRunFinished);
            }

            var ready =
                "{\"v\":1,\"type\":\"runReady\",\"clientRunId\":\"" +
                EscapeJson(config.ClientRunId) +
                "\"}";
            NativeApi.SendToMobileApp(ready);
        }

        void OnRunFinished(string scorePayloadEnvelope)
        {
            NativeApi.SendToMobileApp(scorePayloadEnvelope);
            _runActive = false;
            _active = null;
            _status = "scorePayload sent";
        }

        public RunConfig ActiveConfig => _active;
        public string Status => _status;

        static RunConfig ParseStartRun(string json)
        {
            var runDuration = ExtractJsonInt(json, "runDurationMs", 60000);
            if (runDuration <= 0)
            {
                runDuration = 60000;
            }

            int? opponent = null;
            if (json.Contains("\"opponentPostedScore\":null"))
            {
                opponent = null;
            }
            else if (json.Contains("\"opponentPostedScore\":"))
            {
                opponent = ExtractJsonInt(json, "opponentPostedScore", -1);
                if (opponent < 0)
                {
                    opponent = null;
                }
            }

            return new RunConfig
            {
                MatchId = ExtractJsonString(json, "matchId"),
                ClientRunId = ExtractJsonString(json, "clientRunId"),
                GameId = ExtractJsonString(json, "gameId"),
                Mode = ExtractJsonString(json, "mode"),
                Seat = ExtractJsonInt(json, "seat", 1),
                StakeCents = ExtractJsonInt(json, "stakeCents", 0),
                OpponentPostedScore = opponent,
                ScoreDeadlineAt = ExtractJsonString(json, "scoreDeadlineAt"),
                RunDurationMs = runDuration,
                ServerNowEpochMs = ExtractJsonLong(json, "serverNowEpochMs", 0),
                GameStartEpochMs = ExtractJsonLong(json, "gameStartEpochMs", 0),
                GameEndEpochMs = ExtractJsonLong(json, "gameEndEpochMs", 0),
            };
        }

        internal static long ExtractJsonLong(string json, string key, long fallback)
        {
            var needle = "\"" + key + "\":";
            var start = json.IndexOf(needle);
            if (start < 0)
            {
                return fallback;
            }
            start += needle.Length;
            while (start < json.Length && (json[start] == ' ' || json[start] == '\t'))
            {
                start++;
            }
            var end = start;
            if (end < json.Length && json[end] == '-')
            {
                end++;
            }
            while (end < json.Length && char.IsDigit(json[end]))
            {
                end++;
            }
            if (end == start || (end == start + 1 && json[start] == '-'))
            {
                return fallback;
            }
            if (long.TryParse(json.Substring(start, end - start), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
            {
                return value;
            }
            return fallback;
        }

        internal static string ExtractJsonString(string json, string key)
        {
            var needle = "\"" + key + "\":\"";
            var start = json.IndexOf(needle);
            if (start < 0)
            {
                return "";
            }
            start += needle.Length;
            var end = json.IndexOf('"', start);
            if (end < 0)
            {
                return "";
            }
            return json.Substring(start, end - start);
        }

        internal static int ExtractJsonInt(string json, string key, int fallback)
        {
            var needle = "\"" + key + "\":";
            var start = json.IndexOf(needle);
            if (start < 0)
            {
                return fallback;
            }
            start += needle.Length;
            while (start < json.Length && (json[start] == ' ' || json[start] == '\t'))
            {
                start++;
            }
            var end = start;
            if (end < json.Length && json[end] == '-')
            {
                end++;
            }
            while (end < json.Length && char.IsDigit(json[end]))
            {
                end++;
            }
            if (end == start || (end == start + 1 && json[start] == '-'))
            {
                return fallback;
            }
            if (int.TryParse(json.Substring(start, end - start), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
            {
                return value;
            }
            return fallback;
        }

        internal static string EscapeJson(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        void OnGUI()
        {
            // BasketballRun owns gameplay HUD while active.
            if (_runActive)
            {
                return;
            }
            GUI.Label(new Rect(16, 16, Screen.width - 32, 48), "project-x · " + _status);
        }
    }
}
