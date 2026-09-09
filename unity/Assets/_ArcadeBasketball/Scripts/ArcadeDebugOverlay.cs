using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Editor / development-build overlay. Release player strips the logic;
    /// this component then no-ops. Overlay off: no keys, gizmos, or tap steal.
    /// </summary>
    public sealed class ArcadeDebugOverlay : MonoBehaviour
    {
        static ArcadeDebugOverlay Active;

        [SerializeField]
        bool overlayEnabled = true;

        [SerializeField]
        bool drawGizmos = true;

        [SerializeField]
        BasketballArcadeController ball;

        [SerializeField]
        HoopArcadeController hoop;

        [SerializeField]
        ArcadeRoundController round;

        [SerializeField]
        BasketScoreDetector scoreDetector;

        Rect _panel;

        public static bool BlocksTap(Vector2 screenPosition)
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            return Active != null && Active.HitTest(screenPosition);
#else
            return false;
#endif
        }

        void OnEnable()
        {
            Active = this;
        }

        void OnDisable()
        {
            if (Active == this)
                Active = null;
        }

        void OnDestroy()
        {
            if (Active == this)
                Active = null;
        }

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        void Awake()
        {
            if (ball == null)
                ball = FindFirstObjectByType<BasketballArcadeController>();
            if (hoop == null)
                hoop = FindFirstObjectByType<HoopArcadeController>();
            if (round == null)
                round = GetComponent<ArcadeRoundController>();
            if (round == null)
                round = FindFirstObjectByType<ArcadeRoundController>();
            if (scoreDetector == null)
                scoreDetector = FindFirstObjectByType<BasketScoreDetector>();
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.F1) || Input.GetKeyDown(KeyCode.BackQuote))
            {
                overlayEnabled = !overlayEnabled;
                return;
            }

            if (!overlayEnabled)
                return;

            if (Input.GetKeyDown(KeyCode.B))
                ResetBall();
            if (Input.GetKeyDown(KeyCode.Alpha1) || Input.GetKeyDown(KeyCode.Keypad1))
                SnapHoop(true);
            if (Input.GetKeyDown(KeyCode.Alpha2) || Input.GetKeyDown(KeyCode.Keypad2))
                SnapHoop(false);
            if (Input.GetKeyDown(KeyCode.H))
                FlipHoop();
            if (Input.GetKeyDown(KeyCode.F))
                FakeScore(ArcadeShotQuality.Perfect);
            if (Input.GetKeyDown(KeyCode.V))
                FakeScore(ArcadeShotQuality.Rim);
            if (Input.GetKeyDown(KeyCode.C))
                FakeScore(ArcadeShotQuality.Backboard);
            if (Input.GetKeyDown(KeyCode.N))
                RestartRound();
            if (Input.GetKeyDown(KeyCode.G))
                drawGizmos = !drawGizmos;
        }

        void OnGUI()
        {
            if (!overlayEnabled)
                return;

            const float width = 228f;
            const float height = 292f;
            _panel = new Rect(Screen.width - width - 12f, 12f, width, height);

            GUI.Box(_panel, "Arcade debug");
            GUILayout.BeginArea(new Rect(_panel.x + 8f, _panel.y + 22f, width - 16f, height - 30f));

            if (GUILayout.Button("Reset ball  (B)"))
                ResetBall();

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Hoop L  (1)"))
                SnapHoop(true);
            if (GUILayout.Button("Hoop R  (2)"))
                SnapHoop(false);
            GUILayout.EndHorizontal();

            if (GUILayout.Button("Flip hoop  (H)"))
                FlipHoop();

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("SWISH"))
                FakeScore(ArcadeShotQuality.Perfect);
            if (GUILayout.Button("RIM"))
                FakeScore(ArcadeShotQuality.Rim);
            if (GUILayout.Button("BANK"))
                FakeScore(ArcadeShotQuality.Backboard);
            GUILayout.EndHorizontal();

            if (GUILayout.Button("Restart round  (N)"))
                RestartRound();

            if (GUILayout.Button(drawGizmos ? "Gizmos on  (G)" : "Gizmos off  (G)"))
                drawGizmos = !drawGizmos;

            if (GUILayout.Button("Hide overlay  (F1)"))
                overlayEnabled = false;

            string hoopSide = hoop != null && hoop.AtLeft ? "L" : "R";
            GUILayout.Label($"hoop {hoopSide}{(hoop != null && hoop.IsMoving ? " moving" : "")}");
            GUILayout.Label("F SWISH  V RIM  C BANK");

            GUILayout.EndArea();
        }

        void OnDrawGizmos()
        {
            if (!overlayEnabled || !drawGizmos)
                return;

            if (ball != null)
            {
                Gizmos.color = new Color(1f, 0.55f, 0.1f, 0.9f);
                Gizmos.DrawWireSphere(ball.transform.position, 0.22f);

                BasketballGameplayConfig config = ball.GameplayConfig;
                if (config != null)
                {
                    Gizmos.color = new Color(1f, 0.2f, 0.2f, 0.7f);
                    Gizmos.DrawLine(
                        new Vector3(-config.outOfBoundsX, config.outOfBoundsY, 0f),
                        new Vector3(config.outOfBoundsX, config.outOfBoundsY, 0f));
                    Gizmos.color = new Color(0.4f, 0.7f, 1f, 0.5f);
                    Gizmos.DrawLine(
                        new Vector3(-config.outOfBoundsX, -8f, 0f),
                        new Vector3(-config.outOfBoundsX, 8f, 0f));
                    Gizmos.DrawLine(
                        new Vector3(config.outOfBoundsX, -8f, 0f),
                        new Vector3(config.outOfBoundsX, 8f, 0f));
                }
            }

            if (hoop != null)
            {
                Gizmos.color = new Color(0.2f, 1f, 0.45f, 0.9f);
                Gizmos.DrawWireSphere(hoop.DebugHoopPosition, 0.28f);
                Gizmos.color = new Color(0.35f, 0.75f, 1f, 0.8f);
                Gizmos.DrawWireSphere(hoop.DebugLeftAnchor, 0.16f);
                Gizmos.DrawWireSphere(hoop.DebugRightAnchor, 0.16f);
                Gizmos.color = new Color(1f, 0.9f, 0.2f, 0.9f);
                Gizmos.DrawWireSphere(hoop.DebugHoopTarget, 0.12f);
            }

            if (scoreDetector != null)
            {
                Gizmos.color = new Color(1f, 0.85f, 0.2f, 0.8f);
                Gizmos.DrawWireCube(scoreDetector.transform.position, new Vector3(0.7f, 0.7f, 0.1f));
            }
        }

        bool HitTest(Vector2 screenPosition)
        {
            if (!overlayEnabled || _panel.width < 1f)
                return false;

            Vector2 gui = new Vector2(screenPosition.x, Screen.height - screenPosition.y);
            return _panel.Contains(gui);
        }

        void ResetBall()
        {
            if (ball != null)
                ball.DebugResetToSpawn();
        }

        void SnapHoop(bool left)
        {
            if (hoop != null)
                hoop.DebugSnapToSide(left);
        }

        void FlipHoop()
        {
            if (hoop != null)
                hoop.DebugFlipSide();
        }

        void FakeScore(ArcadeShotQuality quality)
        {
            if (scoreDetector != null)
                scoreDetector.DebugForceScore(quality);
        }

        void RestartRound()
        {
            if (round != null)
                round.BeginRound();
        }
#endif
    }
}
