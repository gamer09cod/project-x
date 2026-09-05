using UnityEngine;

public class CameraShake : MonoBehaviour
{
    public float duration = 0.4f;
    public float amplitude = 0.22f;

    Transform cam;
    Vector3 rest;
    float elapsed = 999f;

    public static void PlayPerfect()
    {
        CameraShake shake = FindFirstObjectByType<CameraShake>();
        if (!shake)
        {
            Camera main = Camera.main;
            if (!main)
                return;
            shake = main.gameObject.AddComponent<CameraShake>();
        }

        shake.Kick();
    }

    void Awake()
    {
        Bind();
    }

    void Bind()
    {
        Camera main = Camera.main;
        if (!main)
            return;
        cam = main.transform;
        if (elapsed >= duration)
            rest = cam.localPosition;
    }

    public void Kick()
    {
        Bind();
        if (!cam)
            return;
        if (elapsed >= duration)
            rest = cam.localPosition;
        else
            cam.localPosition = rest;
        elapsed = 0f;
    }

    void LateUpdate()
    {
        if (!cam || elapsed >= duration)
            return;

        elapsed += Time.unscaledDeltaTime;
        if (elapsed >= duration)
        {
            cam.localPosition = rest;
            return;
        }

        float n = 1f - elapsed / duration;
        n *= n;
        float t = elapsed * 55f;
        Vector3 offset = new Vector3(Mathf.Sin(t * 1.3f), Mathf.Cos(t), 0f) * amplitude * n;
        cam.localPosition = rest + offset;
    }
}
