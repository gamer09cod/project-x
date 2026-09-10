using UnityEngine;

namespace ProjectX.Gameplay
{
    /// <summary>
    /// Server-authoritative play clock. Remaining = gameEnd - estimatedServerNow.
    /// Uses realtimeSinceStartup (monotonic) — not DateTime wall clock, not deltaTime.
    /// </summary>
    public sealed class AuthoritativeGameTimer
    {
        long _serverNowAtSyncMs;
        long _gameStartEpochMs;
        long _baseGameEndEpochMs;
        long _presentationEndEpochMs;
        float _realtimeAtSync;
        bool _synced;

        public long GameStartEpochMs => _gameStartEpochMs;
        public long BaseGameEndEpochMs => _baseGameEndEpochMs;
        public long PresentationEndEpochMs => _presentationEndEpochMs;
        public bool IsSynced => _synced;

        public void Sync(long serverNowEpochMs, long gameStartEpochMs, long gameEndEpochMs)
        {
            _serverNowAtSyncMs = serverNowEpochMs;
            _gameStartEpochMs = gameStartEpochMs;
            _baseGameEndEpochMs = gameEndEpochMs;
            _presentationEndEpochMs = gameEndEpochMs;
            _realtimeAtSync = Time.realtimeSinceStartup;
            _synced = true;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            Debug.Log(
                "[GameTimer] Started serverNow=" + serverNowEpochMs +
                " start=" + gameStartEpochMs +
                " end=" + gameEndEpochMs +
                " durationMs=" + (gameEndEpochMs - gameStartEpochMs));
#endif
        }

        public void Clear()
        {
            _synced = false;
            _serverNowAtSyncMs = 0;
            _gameStartEpochMs = 0;
            _baseGameEndEpochMs = 0;
            _presentationEndEpochMs = 0;
        }

        /// <summary>One buzzer-beater +5s presentation extension (server still verifies once).</summary>
        public void ExtendPresentationEndMs(long bonusMs)
        {
            if (!_synced || bonusMs <= 0)
            {
                return;
            }
            long oldEnd = _presentationEndEpochMs;
            long now = GetEstimatedServerNowMs();
            long remaining = _presentationEndEpochMs - now;
            if (remaining < 0)
                remaining = 0;
            _presentationEndEpochMs = now + remaining + bonusMs;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            Debug.Log(
                "[GameTimer] Extended oldEnd=" + oldEnd +
                " bonusMs=" + bonusMs +
                " newEnd=" + _presentationEndEpochMs +
                " reason=buzzer");
#endif
        }

        public long GetEstimatedServerNowMs()
        {
            if (!_synced)
            {
                return 0;
            }
            double elapsedSec = Time.realtimeSinceStartup - _realtimeAtSync;
            if (elapsedSec < 0)
            {
                elapsedSec = 0;
            }
            long elapsedMs = (long)(elapsedSec * 1000.0);
            return _serverNowAtSyncMs + elapsedMs;
        }

        public long GetRemainingMs()
        {
            if (!_synced)
            {
                return 0;
            }
            long remaining = _presentationEndEpochMs - GetEstimatedServerNowMs();
            return remaining > 0 ? remaining : 0;
        }

        public bool IsExpired()
        {
            return _synced && GetRemainingMs() <= 0;
        }
    }
}
