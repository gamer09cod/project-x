using UnityEngine;
using System;
using System.Data;

public class Scenery : MonoBehaviour
{
    public SpriteRenderer background;
    public SpriteRenderer floor;

    [Space(6)]

    public SpriteRenderer backgroundScreenshot;

    void Start()
    {
        DateTime now = DateTime.Now;
        int h = now.Hour;
        int m = now.Month;

        string season;
        string night = "";

        if (h >= 21 || h <= 6)
            night = "-night";

        if (m >= 3 && m <= 9)
            season = "summer";
        else if (m >= 10 && m <= 11)
            season = "autumn";
        else
            season = "winter";

        background.sprite = backgroundScreenshot.sprite = Resources.Load<Sprite>($"Scenery/background-{season}{night}");
    }

    /// <summary>
    /// Ranked embed: urban night court. Arcade/editor keep seasonal outdoor.
    /// </summary>
    public void ApplyEmbedLook()
    {
        Sprite urban = Resources.Load<Sprite>("Scenery/background-urban-night");
        if (urban == null)
            return;
        if (background != null)
            background.sprite = urban;
        if (backgroundScreenshot != null)
            backgroundScreenshot.sprite = urban;
    }
}
