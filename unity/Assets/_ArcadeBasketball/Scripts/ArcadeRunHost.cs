using System;
using System.Collections.Generic;
using System.Text;
using ProjectX.Bridge;
using ProjectX.Gameplay;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Ranked embed adapter for BasketBall.unity. Starts the arcade round from
    /// RN startRun and emits a ScorePayloadV1 envelope on Results.
    /// Does not use Main Game / ShotClock.
    /// Shot log: makes 3/2/1 and tap-armed misses 0. Sum matches claimed score.
    /// One buzzer-beater: +5s once when the clock is 0 and the ball is live.
    /// </summary>
    public sealed class ArcadeRunHost : MonoBehaviour
    {
        readonly AuthoritativeGameTimer _timer = new AuthoritativeGameTimer();

        ArcadeRoundController _round;
        RunConfig _config;
        Action<string> _onFinished;
        bool _running;

        public static bool IsAvailable()
        {
            return FindFirstObjectByType<ArcadeRoundController>() != null;
        }

        public void Begin(RunConfig config, Action<string> onFinished)
        {
            Abort();

            _round = FindFirstObjectByType<ArcadeRoundController>();
            if (_round == null)
            {
                Debug.LogError(
                    "[ArcadeBasketball] ArcadeRunHost: ArcadeRoundController missing.",
                    this);
                onFinished?.Invoke(BuildEmptyPayload(config));
                return;
            }

            _config = config;
            _onFinished = onFinished;
            _running = true;
            SyncTimer(config);
            _round.SetAuthTimer(_timer);
            _round.OnResults += HandleResults;
            _round.BeginRound();
        }

        /// <summary>RN abort / next startRun — no scorePayload.</summary>
        public void Abort()
        {
            _running = false;
            _onFinished = null;
            _timer.Clear();

            if (_round != null)
            {
                _round.OnResults -= HandleResults;
                _round.SetAuthTimer(null);
                _round.AbortRound();
                _round = null;
                return;
            }

            ArcadeRoundController found = FindFirstObjectByType<ArcadeRoundController>();
            if (found != null)
                found.AbortRound();
        }

        void HandleResults()
        {
            if (!_running)
                return;

            _running = false;
            if (_round != null)
            {
                _round.OnResults -= HandleResults;
                _round.SetAuthTimer(null);
            }

            Action<string> cb = _onFinished;
            _onFinished = null;
            cb?.Invoke(BuildEnvelope());
        }

        void OnDestroy()
        {
            if (_round != null)
                _round.OnResults -= HandleResults;
        }

        void SyncTimer(RunConfig config)
        {
            long serverNow = config != null ? config.ServerNowEpochMs : 0;
            long gameStart = config != null ? config.GameStartEpochMs : 0;
            long gameEnd = config != null ? config.GameEndEpochMs : 0;
            if (serverNow <= 0 || gameStart <= 0 || gameEnd <= gameStart)
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                int durMs = config != null && config.RunDurationMs > 0
                    ? config.RunDurationMs
                    : 60000;
                serverNow = now;
                gameStart = now;
                gameEnd = now + durMs;
            }

            _timer.Sync(serverNow, gameStart, gameEnd);
        }

        string BuildEnvelope()
        {
            int score = _round != null ? _round.Score : 0;
            int durationMs = 0;
            if (_timer.IsSynced)
            {
                long elapsed = _timer.GetEstimatedServerNowMs() - _timer.GameStartEpochMs;
                if (elapsed < 0)
                    elapsed = 0;
                if (elapsed > int.MaxValue)
                    elapsed = int.MaxValue;
                durationMs = (int)elapsed;
            }

            string clientRunId = _config != null ? _config.ClientRunId : "";
            IReadOnlyList<ArcadeShotLogEntry> log = _round != null ? _round.ShotLog : null;
            var sb = new StringBuilder(512);
            sb.Append("{\"v\":1,\"type\":\"scorePayload\",\"payload\":{");
            sb.Append("\"schemaVersion\":1,");
            sb.Append("\"score\":").Append(score).Append(',');
            sb.Append("\"durationMs\":").Append(durationMs).Append(',');
            sb.Append("\"clockEndedAtMs\":").Append(durationMs).Append(',');
            sb.Append("\"hasUsedBuzzerBeater\":").Append(_round != null && _round.HasUsedBuzzerBeater ? "true" : "false").Append(',');
            sb.Append("\"buzzerBeaterTriggered\":").Append(_round != null && _round.BuzzerBeaterTriggered ? "true" : "false").Append(',');
            sb.Append("\"shotLog\":[");
            if (log != null)
            {
                for (int i = 0; i < log.Count; i++)
                {
                    if (i > 0)
                        sb.Append(',');
                    ArcadeShotLogEntry s = log[i];
                    sb.Append("{\"tMs\":").Append(s.TMs)
                        .Append(",\"result\":\"").Append(s.Result)
                        .Append("\",\"pointsClaimed\":").Append(s.PointsClaimed)
                        .Append('}');
                }
            }
            sb.Append("],");
            sb.Append("\"clientRunId\":\"").Append(RnBridge.EscapeJson(clientRunId)).Append("\",");
            sb.Append("\"unityBuildId\":\"").Append(RnBridge.EscapeJson(UnityBuildId.Value)).Append('"');
            sb.Append("}}");
            return sb.ToString();
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
