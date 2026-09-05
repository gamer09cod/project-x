using UnityEngine;

[CreateAssetMenu(menuName = "Swish Shot/Game Config", fileName = "GameConfig")]
public class GameConfig : ScriptableObject
{
    public const string JsonResource = "game_config";

    public int pointsPerfect = 3;
    public int pointsHoop = 2;
    public int pointsBackboard = 1;

    public float gameTime = 10f;
    public float clockContinueSeconds = 8f;
    public float buzzerTimeScale = 0.3f;

    public static GameConfig Load()
    {
        GameConfig cfg = CreateInstance<GameConfig>();
        TextAsset json = Resources.Load<TextAsset>(JsonResource);
        if (json != null && !string.IsNullOrEmpty(json.text))
            JsonUtility.FromJsonOverwrite(json.text, cfg);

        if (cfg.gameTime <= 0f)
            cfg.gameTime = 10f;
        return cfg;
    }

    public int PointsFor(ShotQuality quality)
    {
        switch (quality)
        {
            case ShotQuality.Perfect: return pointsPerfect;
            case ShotQuality.Hoop: return pointsHoop;
            default: return pointsBackboard;
        }
    }

}
