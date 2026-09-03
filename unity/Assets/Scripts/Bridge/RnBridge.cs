using UnityEngine;

namespace ProjectX.Bridge
{
    /// <summary>
    /// Phase 3 ping host. GameObject name must stay BridgeHost (RN postMessage target).
    /// Paid matches must not start here — wait for a run-config handshake in Phase 6.
    /// </summary>
    public sealed class RnBridge : MonoBehaviour
    {
        string _status = "waiting for ping";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            if (Object.FindFirstObjectByType<RnBridge>() != null)
            {
                return;
            }

            var host = new GameObject("BridgeHost");
            host.AddComponent<RnBridge>();
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
            if (string.IsNullOrEmpty(message) || !message.Contains("\"ping\""))
            {
                _status = "ignored non-ping";
                return;
            }

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

        void OnGUI()
        {
            GUI.Label(new Rect(16, 16, Screen.width - 32, 48), "project-x embed · " + _status);
        }

        static string ExtractJsonString(string json, string key)
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

        static string EscapeJson(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
