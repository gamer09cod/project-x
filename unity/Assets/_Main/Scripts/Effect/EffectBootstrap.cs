using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace ProjectX.Effect
{
    /// <summary>
    /// Installs the effect layer at runtime instead of editing Main.unity.
    ///
    /// Everything here is additive: a new canvas, new child objects, and
    /// components attached to existing ones. Nothing is reparented and no
    /// serialized reference is rewritten, so the scene stays exactly as
    /// authored and the layer can be removed by deleting this folder.
    ///
    /// It also keeps the World UI Animator safe — its clips address children by
    /// transform path, so inserting a safe-area container there would break
    /// them. Existing HUD elements get a positional inset instead.
    /// </summary>
    public static class EffectBootstrap
    {
        const string RootName = "EffectRoot";

        // Above World UI (1) so feedback reads over the HUD, below Screen UI (3)
        // so loading and game-over panels still cover it.
        const int CanvasSortingOrder = 2;

        static GameObject _root;
        static Game _installedFor;

        /// <summary>Statics survive play-mode entry when domain reload is off.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _root = null;
            _installedFor = null;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init()
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
            SceneManager.sceneLoaded += OnSceneLoaded;
            TryInstall();
        }

        static void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            TryInstall();
        }

        static void TryInstall()
        {
            Game game = Object.FindFirstObjectByType<Game>();
            if (game == null || game.ui == null)
            {
                // Bridge stub or a scene without the game — nothing to decorate.
                return;
            }

            // Held by reference rather than GameObject.Find: Find skips inactive
            // objects, so deactivating the root would silently install a second
            // full layer and every event would be handled twice.
            if (_root != null && _installedFor == game)
            {
                return;
            }

            if (_root != null)
            {
                Object.Destroy(_root);
            }

            _root = new GameObject(RootName, typeof(RectTransform));
            _installedFor = game;

            // Components are added while the root is inactive so no OnEnable —
            // and therefore no event subscription — runs before Init populates
            // the fields those handlers read.
            _root.SetActive(false);

            Camera worldCamera = Camera.main;
            RectTransform safeRoot = BuildCanvas(_root, worldCamera);
            TMP_FontAsset font = ResolveFont(game.ui);

            int layerId = SortingLayerFor(game);
            int ballOrder = BallSortingOrder(game);

            var feedback = _root.AddComponent<ScoreFeedback>();
            // Same camera for both roles here, but they are distinct concerns:
            // one projects world positions, the other resolves canvas space.
            feedback.Init(safeRoot, worldCamera, worldCamera, font);

            // Disable the old shake first: initialising CameraEffect while a
            // legacy shake offset was applied would bake it into the rest pose.
            DisableLegacyShake();
            var cameraEffect = _root.AddComponent<CameraEffect>();
            cameraEffect.Init(worldCamera);

            var vfx = _root.AddComponent<EffectVfx>();
            vfx.Init(layerId, ballOrder + 1);

            var ballEffect = _root.AddComponent<BallEffect>();
            if (game.ball != null)
            {
                ballEffect.Init(game.ball.transform, layerId, ballOrder);
            }

            var timer = _root.AddComponent<TimerPresenter>();
            timer.Init(game.ui.clock);

            var net = _root.AddComponent<NetEffect>();
            if (game.hoop != null && game.hoop.rim != null)
            {
                var rimRenderer = game.hoop.rim.GetComponent<SpriteRenderer>();
                net.Init(
                    game.hoop.rim.transform,
                    rimRenderer != null ? rimRenderer.sortingLayerID : layerId);
            }

            var director = _root.AddComponent<EffectDirector>();
            director.Init(feedback, cameraEffect, vfx, ballEffect, net);

            ApplyHudInsets(game.ui);

            _root.SetActive(true);
        }

        /// <summary>
        /// Dedicated overlay canvas so nothing here can disturb the authored
        /// canvases or the animators attached to them.
        /// </summary>
        static RectTransform BuildCanvas(GameObject root, Camera uiCamera)
        {
            // Screen Space - Camera to match the authored canvases. An Overlay
            // canvas is drawn after all camera rendering regardless of sorting
            // order, so it would sit on top of the game-over, settings and
            // loading panels instead of underneath them.
            var canvas = root.AddComponent<Canvas>();
            if (uiCamera != null)
            {
                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = uiCamera;
                canvas.planeDistance = 100f;
            }
            else
            {
                // Screen Space - Camera with no camera silently renders nothing
                // useful; overlay at least stays visible.
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            }
            canvas.sortingOrder = CanvasSortingOrder;

            var scaler = root.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            // Matches the authored canvases: 720x1280, match width. For a
            // portrait game this keeps horizontal composition identical across
            // aspect ratios and lets tall phones gain vertical room.
            scaler.referenceResolution = new Vector2(720f, 1280f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0f;
            scaler.referencePixelsPerUnit = 100f;

            // Feedback is never interactive, so no GraphicRaycaster is added —
            // this canvas can never intercept a tap meant for the game.

            var safeGo = new GameObject("SafeArea", typeof(RectTransform));
            safeGo.transform.SetParent(root.transform, false);

            var safeRect = safeGo.GetComponent<RectTransform>();
            safeRect.anchorMin = Vector2.zero;
            safeRect.anchorMax = Vector2.one;
            safeRect.offsetMin = Vector2.zero;
            safeRect.offsetMax = Vector2.zero;
            // Load-bearing: ScoreFeedback clamps in this rect's local space and
            // then uses the result as a child anchoredPosition. Those two spaces
            // only coincide at a centred pivot.
            safeRect.pivot = new Vector2(0.5f, 0.5f);

            safeGo.AddComponent<SafeAreaPanel>();

            return safeRect;
        }

        /// <summary>
        /// The score and clock sit flush against the top edge as authored, which
        /// puts them under a notch or Dynamic Island. Inset them in place.
        /// </summary>
        static void ApplyHudInsets(UI ui)
        {
            if (ui == null)
            {
                return;
            }

            // Only the live HUD. score[1] and score[2] are the game-over panel
            // readouts on the Screen UI canvas, which are centre-anchored and
            // laid out by their own panel.
            if (ui.clock != null)
            {
                AddInset(ui.clock.gameObject);
            }

            if (ui.score != null && ui.score.Length > 0 && ui.score[0] != null)
            {
                AddInset(ui.score[0].gameObject);
            }
        }

        static void AddInset(GameObject go)
        {
            if (go == null || go.GetComponent<HudSafeInset>() != null)
            {
                return;
            }
            go.AddComponent<HudSafeInset>();
        }

        static TMP_FontAsset ResolveFont(UI ui)
        {
            if (ui == null)
            {
                return null;
            }

            if (ui.score != null)
            {
                for (int i = 0; i < ui.score.Length; i++)
                {
                    if (ui.score[i] != null && ui.score[i].font != null)
                    {
                        return ui.score[i].font;
                    }
                }
            }

            if (ui.clock != null)
            {
                return ui.clock.font;
            }

            return null;
        }

        static SpriteRenderer BallRenderer(Game game)
        {
            if (game == null || game.ball == null)
            {
                return null;
            }
            return game.ball.GetComponent<SpriteRenderer>();
        }

        static int BallSortingOrder(Game game)
        {
            SpriteRenderer sr = BallRenderer(game);
            return sr != null ? sr.sortingOrder : 1;
        }

        /// <summary>
        /// Sorting order only orders within a layer, so new renderers have to
        /// join the gameplay sprites' layer to sit against them predictably.
        /// </summary>
        static int SortingLayerFor(Game game)
        {
            SpriteRenderer sr = BallRenderer(game);
            return sr != null ? sr.sortingLayerID : 0;
        }

        /// <summary>
        /// CameraEffect owns camera offsets now. Leaving the old shake enabled
        /// would have two scripts writing the same transform every frame.
        /// </summary>
        static void DisableLegacyShake()
        {
            CameraShake legacy = Object.FindFirstObjectByType<CameraShake>();
            if (legacy != null)
            {
                legacy.enabled = false;
            }
        }
    }
}
