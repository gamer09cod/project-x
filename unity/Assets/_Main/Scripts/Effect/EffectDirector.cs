using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// Turns gameplay events into coordinated feedback, and owns the combo
    /// counter.
    ///
    /// The combo is purely presentational: it changes how loud the feedback is
    /// and never touches points, the clock, or the score payload. Awarded points
    /// still come from GameConfig via Game.AddPoint, which the server verifies.
    /// </summary>
    public sealed class EffectDirector : MonoBehaviour
    {
        const int ComboFireThreshold = 3;
        const int ComboUnstoppableThreshold = 6;

        ScoreFeedback _feedback;
        CameraEffect _camera;
        EffectVfx _vfx;
        BallEffect _ball;
        NetEffect _net;

        int _combo;
        int _bestComboAnnounced;
        bool _buzzerActive;

        public void Init(
            ScoreFeedback feedback,
            CameraEffect cameraEffect,
            EffectVfx vfx,
            BallEffect ball,
            NetEffect net)
        {
            _feedback = feedback;
            _camera = cameraEffect;
            _vfx = vfx;
            _ball = ball;
            _net = net;
        }

        void OnEnable()
        {
            EffectEvents.Basket += OnBasket;
            EffectEvents.Miss += OnMiss;
            EffectEvents.Launch += OnLaunch;
            EffectEvents.RimHit += OnRimHit;
            EffectEvents.BackboardHit += OnBackboardHit;
            EffectEvents.BuzzerBegin += OnBuzzerBegin;
            EffectEvents.BuzzerResolved += OnBuzzerResolved;
            EffectEvents.RunStarted += OnRunStarted;
            EffectEvents.RunEnded += OnRunEnded;
            EffectEvents.EnterNetTunnel += OnEnterNetTunnel;
            EffectEvents.ExitNetTunnel += OnExitNetTunnel;
        }

        void OnDisable()
        {
            EffectEvents.Basket -= OnBasket;
            EffectEvents.Miss -= OnMiss;
            EffectEvents.Launch -= OnLaunch;
            EffectEvents.RimHit -= OnRimHit;
            EffectEvents.BackboardHit -= OnBackboardHit;
            EffectEvents.BuzzerBegin -= OnBuzzerBegin;
            EffectEvents.BuzzerResolved -= OnBuzzerResolved;
            EffectEvents.RunStarted -= OnRunStarted;
            EffectEvents.RunEnded -= OnRunEnded;
            EffectEvents.EnterNetTunnel -= OnEnterNetTunnel;
            EffectEvents.ExitNetTunnel -= OnExitNetTunnel;
        }

        void OnBasket(ShotQuality quality, int points, Vector3 worldPos)
        {
            _combo++;

            bool swish = quality == ShotQuality.Perfect;

            if (_feedback != null)
            {
                _feedback.ShowBasket(quality, points, worldPos, _combo);
            }

            if (_vfx != null)
            {
                if (swish)
                {
                    _vfx.SwishBurst(worldPos);
                }
                else
                {
                    _vfx.ScoreBurst(worldPos);
                }
            }

            if (_camera != null)
            {
                _camera.Punch(
                    swish ? CameraEffect.MediumAmplitude : CameraEffect.LightAmplitude,
                    swish ? 0.22f : 0.14f);
            }

            if (_net != null)
            {
                _net.Ripple(swish ? 1.7f : 1f);
            }

            if (swish && _ball != null)
            {
                _ball.FlashHot(0.6f);
            }

            HapticBridge.Play(swish ? HapticBridge.Strength.Medium : HapticBridge.Strength.Light);

            // The rim reaction was already written but never wired up.
            Game game = Game.Instance;
            if (game != null && game.hoop != null)
            {
                game.hoop.Bounce();
            }

            AnnounceMilestones(worldPos);
        }

        void AnnounceMilestones(Vector3 worldPos)
        {
            if (_combo < ComboFireThreshold || _combo <= _bestComboAnnounced)
            {
                return;
            }

            if (_combo == ComboFireThreshold)
            {
                _bestComboAnnounced = _combo;
                if (_feedback != null)
                {
                    _feedback.ShowMilestone("ON FIRE!");
                }
                if (_camera != null)
                {
                    _camera.Punch(CameraEffect.StrongAmplitude, 0.26f);
                }
                if (_vfx != null)
                {
                    _vfx.Celebrate(worldPos);
                }
            }
            else if (_combo == ComboUnstoppableThreshold)
            {
                _bestComboAnnounced = _combo;
                if (_feedback != null)
                {
                    _feedback.ShowMilestone("UNSTOPPABLE!");
                }
                if (_camera != null)
                {
                    _camera.Punch(CameraEffect.StrongAmplitude, 0.3f);
                }
                if (_vfx != null)
                {
                    _vfx.Celebrate(worldPos);
                }
            }
        }

        void OnMiss()
        {
            _combo = 0;
            _bestComboAnnounced = 0;
            if (_ball != null)
            {
                _ball.SetEmitting(false);
            }
            // No haptic on a miss — punishing the player for failing feels bad.
        }

        void OnLaunch()
        {
            if (_ball != null)
            {
                _ball.SetEmitting(true);
            }
        }

        void OnRimHit(Vector3 worldPos)
        {
            if (_vfx != null)
            {
                _vfx.RimImpact(worldPos);
            }
        }

        void OnBackboardHit(Vector3 worldPos)
        {
            if (_vfx != null)
            {
                _vfx.RimImpact(worldPos);
            }
        }

        void OnBuzzerBegin()
        {
            _buzzerActive = true;
            if (_feedback != null)
            {
                _feedback.ShowMilestone("BUZZER BEATER!");
            }
            if (_camera != null)
            {
                _camera.Punch(CameraEffect.MediumAmplitude, 0.3f);
            }
        }

        void OnBuzzerResolved(bool made, bool timeGranted)
        {
            if (!_buzzerActive)
            {
                return;
            }
            _buzzerActive = false;

            if (!made)
            {
                return;
            }

            Vector3 pos = Vector3.zero;
            Game game = Game.Instance;
            if (game != null && game.hoop != null)
            {
                pos = game.hoop.transform.position;
            }

            if (_feedback != null)
            {
                // Only promise time when the clock actually granted it.
                _feedback.ShowMilestone(timeGranted ? "+5 SECONDS" : "BUZZER MAKE!");
            }
            if (_vfx != null)
            {
                _vfx.Celebrate(pos);
            }
            if (_camera != null)
            {
                _camera.Punch(CameraEffect.StrongAmplitude, 0.35f);
            }

            HapticBridge.Play(HapticBridge.Strength.Heavy);
        }

        void OnRunStarted()
        {
            ClearPresentation();

            // Only the start of a run wipes popups. Doing it on RunEnded would
            // destroy the final basket's own feedback, since a buzzer make ends
            // the run in the same frame the popup is created.
            if (_feedback != null)
            {
                _feedback.StopAll();
            }
            if (_camera != null)
            {
                _camera.ResetNow();
            }
        }

        void OnRunEnded()
        {
            ClearPresentation();
        }

        void OnEnterNetTunnel()
        {
            if (_ball != null)
            {
                _ball.SetBehindNet(true);
            }
            GameAudio.Instance?.PlayNetSwish();
        }

        void OnExitNetTunnel()
        {
            if (_ball != null)
            {
                _ball.SetBehindNet(false);
            }
        }

        /// <summary>
        /// Reset combo state and stop the trail. Popups are left alone: they run
        /// on unscaled time and recycle themselves.
        /// </summary>
        void ClearPresentation()
        {
            _combo = 0;
            _bestComboAnnounced = 0;
            _buzzerActive = false;

            if (_ball != null)
            {
                _ball.SetBehindNet(false);
                _ball.ClearTrail();
            }
        }
    }
}
