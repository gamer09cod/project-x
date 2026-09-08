using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Confirmation overlay for leaving a ranked run early. Lives on
/// <c>QuitGameScreen</c> under Screen UI.
///
/// Quitting submits the score the player already has — same payload path as
/// the clock running out. The server still owns settlement.
/// </summary>
public class QuitConfirm : MonoBehaviour
{
    [Header("Motion (optional)")]
    [Tooltip("Child panel to scale in. Leave empty to skip the tween.")]
    public GameObject panel;

    [Header("Texts")]
    public TextMeshProUGUI titleLabel;
    public TextMeshProUGUI bodyLabel;
    public TextMeshProUGUI scoreLabel;
    [Tooltip("Optional. The ranked clock keeps running while this is open.")]
    public TextMeshProUGUI clockLabel;

    [Header("Buttons")]
    [Tooltip("Destructive. Ends the run and submits the current score.")]
    public Button quitButton;
    [Tooltip("Safe default. Closes the overlay and resumes play.")]
    public Button keepButton;

    const string Title = "Your Score";
    const string Body =
        "If you quit, your entry is not refunded, and your current score will be used for calculating results.";

    public bool IsOpen { get; private set; }

    void Awake()
    {
        if (quitButton != null && quitButton.onClick.GetPersistentEventCount() == 0)
            quitButton.onClick.AddListener(OnQuitPressed);

        if (keepButton != null && keepButton.onClick.GetPersistentEventCount() == 0)
            keepButton.onClick.AddListener(OnKeepPressed);

        IsOpen = false;
    }

    public void Show()
    {
        if (titleLabel != null)
            titleLabel.text = Title;
        if (bodyLabel != null)
            bodyLabel.text = Body;

        RefreshScore();
        RefreshClock();

        gameObject.SetActive(true);
        IsOpen = true;

        if (panel == null)
            return;

        LeanTween.cancel(panel);
        panel.transform.localScale = Vector3.one * 0.92f;
        LeanTween.scale(panel, Vector3.one, 0.18f)
            .setEaseOutBack()
            .setIgnoreTimeScale(true);
    }

    public void Hide()
    {
        IsOpen = false;
        if (panel != null)
        {
            LeanTween.cancel(panel);
            panel.transform.localScale = Vector3.one;
        }
        if (gameObject.activeSelf)
            gameObject.SetActive(false);
    }

    public void OnQuitPressed()
    {
        UI ui = Game.Instance != null ? Game.Instance.ui : null;
        if (ui != null)
            ui.ConfirmQuit();
    }

    public void OnKeepPressed()
    {
        UI ui = Game.Instance != null ? Game.Instance.ui : null;
        if (ui != null)
            ui.CancelQuit();
    }

    void Update()
    {
        if (!IsOpen)
            return;

        RefreshClock();

        if (Input.GetKeyDown(KeyCode.Escape))
            OnKeepPressed();
    }

    void RefreshScore()
    {
        if (scoreLabel == null)
            return;

        int score = Progress.Instance != null ? Progress.Instance.score : 0;
        scoreLabel.text = score.ToString();
    }

    void RefreshClock()
    {
        if (clockLabel == null)
            return;

        Game game = Game.Instance;
        if (game == null || game.shotClock == null || !game.shotClock.started)
        {
            clockLabel.text = "";
            return;
        }

        int seconds = Mathf.CeilToInt(Mathf.Max(0f, game.shotClock.remaining));
        clockLabel.text = "Time left: " + seconds + "s";
    }
}
