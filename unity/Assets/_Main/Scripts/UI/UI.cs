using UnityEngine;
using UnityEngine.UI;
using UnityEngine.U2D;
using TMPro;
using System.Collections;

public enum UIScene { Game, GameOver, Settings, Quit }

public class UI : MonoBehaviour
{
    [Header("Sprite atlases")]
    public SpriteAtlas uiAtlas;

    [Header("Panels")]
    public Animator worldUI;
    public Animator screenUI;
    public Animator settings;
    public UIGameOver gameOver;
    [Tooltip("QuitGameScreen under Screen UI. Ranked runs only.")]
    public QuitConfirm quitConfirm;

    [Header("Texts")]
    public TextMeshProUGUI[] score;
    public TextMeshProUGUI bestScore;
    public TextMeshProUGUI[] coins;
    public TextMeshProUGUI clock;

    [Header("Buttons")]
    public Button continueButton;

    private UIScene currentScene = UIScene.Game;
    int displayedScore;

    public void Show()
    {
        UpdateScores(true);

        CanvasGroup world = worldUI.GetComponent<CanvasGroup>();
        CanvasGroup screen = screenUI.GetComponent<CanvasGroup>();
        world.alpha = screen.alpha = 1;
        world.interactable = world.blocksRaycasts = screen.interactable = screen.blocksRaycasts = true;
        worldUI.GetComponent<GraphicRaycaster>().enabled = screenUI.GetComponent<GraphicRaycaster>().enabled = true;
    }

    public void Hide()
    {
        CanvasGroup world = worldUI.GetComponent<CanvasGroup>();
        CanvasGroup screen = screenUI.GetComponent<CanvasGroup>();
        world.alpha = screen.alpha = 0;
        world.interactable = world.blocksRaycasts = screen.interactable = screen.blocksRaycasts = false;
        worldUI.GetComponent<GraphicRaycaster>().enabled = screenUI.GetComponent<GraphicRaycaster>().enabled = false;
    }

    public void UpdateScores()
    {
        UpdateScores(false);
    }

    public void UpdateScores(bool instant)
    {
        int target = Progress.Instance.score;
        score[1].text = score[2].text = target.ToString();
        bestScore.text = Progress.Instance.bestScore.ToString();
        coins[0].text = Progress.Instance.GetCoinsText();
        coins[1].text = Progress.Instance.GetGameCoinsText();
        UpdateClock();

        if (instant)
            SnapHudScore(target);
        else
            TweenHudScore(target);
    }

    void SnapHudScore(int target)
    {
        if (score[0] != null)
            LeanTween.cancel(score[0].gameObject);
        displayedScore = target;
        if (score[0] != null)
            score[0].text = target.ToString();
    }

    void TweenHudScore(int target)
    {
        if (score[0] == null)
            return;
        if (displayedScore == target)
        {
            score[0].text = target.ToString();
            return;
        }

        GameObject go = score[0].gameObject;
        LeanTween.cancel(go);
        int from = displayedScore;
        LeanTween.value(go, from, target, 0.45f)
            .setEaseOutCubic()
            .setIgnoreTimeScale(true)
            .setOnUpdate((float v) =>
            {
                displayedScore = Mathf.RoundToInt(v);
                score[0].text = displayedScore.ToString();
            })
            .setOnComplete(() =>
            {
                displayedScore = target;
                score[0].text = target.ToString();
            });
    }

    public void UpdateClock()
    {
        if (clock == null || Game.Instance == null || Game.Instance.shotClock == null)
            return;

        ShotClock sc = Game.Instance.shotClock;
        if (!sc.started)
        {
            clock.text = "--";
            return;
        }

        int seconds = Mathf.CeilToInt(Mathf.Max(0f, sc.remaining));
        clock.text = seconds.ToString();
    }

    public void GameOver()
    {
        ChangeCurrentScene(UIScene.GameOver);
        UpdateScores(true);
        gameOver.In();
    }

    public void Continue()
    {
        ChangeCurrentScene(UIScene.Game);
        Game.Instance.Resume();
        Game.Instance.UpdateGame();
        worldUI.Play("Score in");
        gameOver.Out();
    }

    public void PlayAgain()
    {
        ChangeCurrentScene(UIScene.Game);
        worldUI.Play("Score in");
        gameOver.Out();
        StartCoroutine(Game.Instance.ResetGame());
    }

    public bool IsQuitOverlayOpen =>
        currentScene == UIScene.Quit || (quitConfirm != null && quitConfirm.IsOpen);

    /// <summary>PauseButton on GamePlayScreen — always opens QuitGameScreen.</summary>
    public void OnPausePressed()
    {
        RequestQuit();
    }

    public void Settings()
    {
        // A ranked run has no settings to browse — the only thing this panel
        // offers mid-match is leaving, which needs confirming first. Never fall
        // through: the arcade panel exposes the shop and Rate over a live money
        // match, and pausing there does not stop the server deadline.
        if (Game.Instance != null && Game.Instance.embedMatchMode)
        {
            RequestQuit();
            return;
        }

        if (currentScene == UIScene.GameOver)
            PlayAgain();

        Game.Instance.Pause();
        ChangeCurrentScene(UIScene.Settings);
        screenUI.Play("In");
        settings.Play("In");
    }

    /// <summary>Open QuitGameScreen over a live run (arcade or ranked).</summary>
    public void RequestQuit()
    {
        Game game = Game.Instance;
        if (game == null)
            return;
        if (quitConfirm == null)
        {
            Debug.LogError(
                "UI: quitConfirm is unassigned — QuitGameScreen cannot open.",
                this);
            return;
        }

        // Refused mid-flight and during the buzzer window: the shot has to
        // resolve before the run can be closed off.
        if (game.shotClock != null &&
            (game.shotClock.inFlight || game.shotClock.isBuzzerBeater))
            return;

        // The clock keeps running under this overlay. Pausing would freeze
        // arcade Time.deltaTime and skip OnClockExpired on a ranked run.
        // Shots are blocked via ShotClock.BlocksNewShot instead.
        ChangeCurrentScene(UIScene.Quit);
        quitConfirm.Show();
    }

    /// <summary>Safe action: back to the run. Clock was never paused.</summary>
    public void CancelQuit()
    {
        CloseQuitUI();
    }

    /// <summary>
    /// Destructive action. Ranked: submit the current score. Arcade: game over.
    /// </summary>
    public void ConfirmQuit()
    {
        Game game = Game.Instance;
        if (game == null)
        {
            CloseQuitUI();
            return;
        }

        bool blocked = game.shotClock != null &&
            (game.shotClock.inFlight || game.shotClock.isBuzzerBeater);

        if (blocked)
        {
            CloseQuitUI();
            return;
        }

        CloseQuitUI();

        if (game.embedMatchMode)
        {
            game.QuitEmbedRun();
            return;
        }

        game.GameOver();
    }

    /// <summary>
    /// Dismiss QuitGameScreen without touching pause state. Safe when already closed.
    /// </summary>
    public void CloseQuitUI()
    {
        quitConfirm?.Hide();

        if (currentScene == UIScene.Quit)
            ChangeCurrentScene(UIScene.Game);
    }

    public void SettingsBack(bool instant)
    {
        CloseQuitUI();
        ChangeCurrentScene(UIScene.Game);
        Game.Instance?.Resume();
        screenUI.Play(instant ? "Out instant" : "Out");
        settings.Play(instant ? "Out instant" : "Out");
    }

    public void ChangeCurrentScene(UIScene scene)
    {
        currentScene = scene;
    }

    public void Rate()
    {
        Application.OpenURL("https://play.google.com/store/apps/details?id=com.szaredko.basketball");
    }
}
