using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using ProjectX.Bridge;
using UnityEngine;

namespace ProjectX.Gameplay
{
    /// <summary>
    /// Phase 6 scored run: 60s clock, shot log, one buzzer-beater.
    /// Provisional make = 2 points until the published table is locked.
    /// </summary>
    public sealed class BasketballRun : MonoBehaviour
    {
        public const int PointsPerMake = 2;
        public const int BuzzerBonusMs = 5000;

        struct Shot
        {
            public int TMs;
            public string Result;
            public int PointsClaimed;
        }

        RunConfig _config;
        Action<string> _onFinished;
        bool _running;
        bool _hasUsedBuzzerBeater;
        bool _buzzerBeaterTriggered;
        bool _ballInAir;
        float _remainingMs;
        float _elapsedMs;
        int _score;
        readonly List<Shot> _log = new List<Shot>();
        string _hud = "idle";

        public void Begin(RunConfig config, Action<string> onFinished)
        {
            _config = config;
            _onFinished = onFinished;
            _running = true;
            _hasUsedBuzzerBeater = false;
            _buzzerBeaterTriggered = false;
            _ballInAir = false;
            _remainingMs = config.RunDurationMs > 0 ? config.RunDurationMs : 60000;
            _elapsedMs = 0f;
            _score = 0;
            _log.Clear();
            Time.timeScale = 1f;
            _hud = "run · make/miss or shoot at buzzer";
        }

        /// <summary>RN abort / remount — no scorePayload.</summary>
        public void Abort()
        {
            if (!_running)
            {
                return;
            }
            _running = false;
            _onFinished = null;
            _ballInAir = false;
            Time.timeScale = 1f;
            _hud = "aborted";
        }

        void Update()
        {
            if (!_running)
            {
                return;
            }

            var dtMs = Time.unscaledDeltaTime * 1000f;

            if (_ballInAir && _remainingMs <= 0f)
            {
                // Clock frozen at 0.0 while ball is in the air (buzzer window).
                Time.timeScale = 0.25f;
            }
            else
            {
                Time.timeScale = 1f;
                if (_remainingMs > 0f)
                {
                    _remainingMs -= dtMs;
                    _elapsedMs += dtMs;
                    if (_remainingMs < 0f)
                    {
                        _remainingMs = 0f;
                    }
                }
            }

            if (_remainingMs <= 0f && !_ballInAir)
            {
                FinishRun();
            }
        }

        void OnGUI()
        {
            if (!_running)
            {
                return;
            }

            var y = 16f;
            GUI.Label(new Rect(16, y, Screen.width - 32, 28),
                "clock " + FormatClock(_remainingMs) + "  score " + _score +
                (_config.OpponentPostedScore.HasValue
                    ? "  vs " + _config.OpponentPostedScore.Value
                    : ""));
            y += 28;
            GUI.Label(new Rect(16, y, Screen.width - 32, 28), _hud);
            y += 36;

            var w = 120f;
            var h = 48f;
            if (!_ballInAir && _remainingMs > 0f)
            {
                if (GUI.Button(new Rect(16, y, w, h), "Make +" + PointsPerMake))
                {
                    ResolveShot(true, false);
                }
                if (GUI.Button(new Rect(16 + w + 12, y, w, h), "Miss"))
                {
                    ResolveShot(false, false);
                }
                if (GUI.Button(new Rect(16 + 2 * (w + 12), y, w + 40, h), "Shoot (air)"))
                {
                    _ballInAir = true;
                    _hud = "ball in air…";
                }
            }
            else if (_ballInAir)
            {
                if (GUI.Button(new Rect(16, y, w, h), "Make"))
                {
                    ResolveShot(true, _remainingMs <= 0f);
                }
                if (GUI.Button(new Rect(16 + w + 12, y, w, h), "Miss"))
                {
                    ResolveShot(false, _remainingMs <= 0f);
                }
            }

#if UNITY_EDITOR
            y += h + 12;
            if (GUI.Button(new Rect(16, y, w + 80, h), "Editor: end run"))
            {
                FinishRun();
            }
#endif
        }

        void ResolveShot(bool make, bool atBuzzer)
        {
            var tMs = Mathf.Max(0, Mathf.FloorToInt(_elapsedMs));
            if (_log.Count > 0 && tMs < _log[_log.Count - 1].TMs)
            {
                tMs = _log[_log.Count - 1].TMs;
            }

            if (atBuzzer && make && !_hasUsedBuzzerBeater)
            {
                _hasUsedBuzzerBeater = true;
                _buzzerBeaterTriggered = true;
                _remainingMs += BuzzerBonusMs;
                Time.timeScale = 1f;
                _hud = "buzzer-beater +5s";
            }
            else if (atBuzzer && !make)
            {
                _ballInAir = false;
                AppendShot(tMs, false);
                FinishRun();
                return;
            }
            else if (atBuzzer && make && _hasUsedBuzzerBeater)
            {
                // Second buzzer attempt — treat as normal make with no extra time.
                _hud = "buzzer already used";
            }

            AppendShot(tMs, make);
            _ballInAir = false;

            if (_remainingMs <= 0f && !_ballInAir)
            {
                FinishRun();
            }
        }

        void AppendShot(int tMs, bool make)
        {
            var points = make ? PointsPerMake : 0;
            if (make)
            {
                _score += points;
            }
            _log.Add(new Shot
            {
                TMs = tMs,
                Result = make ? "make" : "miss",
                PointsClaimed = points,
            });
        }

        void FinishRun()
        {
            if (!_running)
            {
                return;
            }
            _running = false;
            Time.timeScale = 1f;
            _ballInAir = false;

            var durationMs = Mathf.Max(0, Mathf.FloorToInt(_elapsedMs));
            var clockEndedAtMs = durationMs;
            var envelope = BuildScoreEnvelope(durationMs, clockEndedAtMs);
            _onFinished?.Invoke(envelope);
            _hud = "finished";
        }

        string BuildScoreEnvelope(int durationMs, int clockEndedAtMs)
        {
            var sb = new StringBuilder(512);
            sb.Append("{\"v\":1,\"type\":\"scorePayload\",\"payload\":{");
            sb.Append("\"schemaVersion\":1,");
            sb.Append("\"score\":").Append(_score).Append(',');
            sb.Append("\"durationMs\":").Append(durationMs).Append(',');
            sb.Append("\"clockEndedAtMs\":").Append(clockEndedAtMs).Append(',');
            sb.Append("\"hasUsedBuzzerBeater\":").Append(_hasUsedBuzzerBeater ? "true" : "false").Append(',');
            sb.Append("\"buzzerBeaterTriggered\":").Append(_buzzerBeaterTriggered ? "true" : "false").Append(',');
            sb.Append("\"shotLog\":[");
            for (var i = 0; i < _log.Count; i++)
            {
                if (i > 0)
                {
                    sb.Append(',');
                }
                var s = _log[i];
                sb.Append("{\"tMs\":").Append(s.TMs)
                    .Append(",\"result\":\"").Append(s.Result)
                    .Append("\",\"pointsClaimed\":").Append(s.PointsClaimed)
                    .Append('}');
            }
            sb.Append("],");
            sb.Append("\"clientRunId\":\"").Append(RnBridge.EscapeJson(_config.ClientRunId)).Append("\",");
            sb.Append("\"unityBuildId\":\"").Append(RnBridge.EscapeJson(UnityBuildId.Value)).Append('"');
            sb.Append("}}");
            return sb.ToString();
        }

        static string FormatClock(float remainingMs)
        {
            var sec = Mathf.CeilToInt(Mathf.Max(0f, remainingMs) / 1000f);
            var m = sec / 60;
            var s = sec % 60;
            return m.ToString(CultureInfo.InvariantCulture) + ":" + s.ToString("00", CultureInfo.InvariantCulture);
        }
    }
}
