using UnityEngine;
using UnityEngine.EventSystems;

public enum InputPhase { Nothing, Began, Moved, Ended }

public class TouchController : MonoBehaviour
{
    public const float TAP_POWER = 1.0f;
    public const float AIM_X_SCALE = 0.85f;

    public Vector2 minAim { get { return new Vector2(-0.85f, 0.55f); } }
    public Vector2 maxAim { get { return new Vector2(0.85f, 1.0f); } }

    public Ball ball;
    public Hoop hoop;

    private bool touch = false;
    private Vector3 currentPosition;

    protected void Update()
    {
        if (Game.Instance == null || Game.Instance.shotClock == null)
            return;

        if (ball.moving || Game.Instance.paused || Game.Instance.shotClock.BlocksNewShot())
            return;

        touch = Input.touchCount > 0;
        currentPosition = Camera.main.ScreenToWorldPoint(GetPosition());
        InputPhase phase = GetPhase();

        if (phase == InputPhase.Nothing)
            return;

        if (touch && Input.touchCount > 1)
            return;

        if (phase == InputPhase.Began)
        {
            if (IsPointerOverUi())
                return;
            if (ball.IsScaling())
                return;

            ThrowFromTap(currentPosition, TAP_POWER);
        }
    }

    public Vector2 GetPosition()
    {
        return touch ? (Vector2)Input.GetTouch(0).position : (Vector2)Input.mousePosition;
    }

    public InputPhase GetPhase()
    {
#if UNITY_EDITOR
        if (Input.GetMouseButtonDown(0))
            return InputPhase.Began;
        if (Input.GetMouseButtonUp(0))
            return InputPhase.Ended;
        if (Input.GetMouseButton(0))
            return InputPhase.Moved;
#elif UNITY_ANDROID || UNITY_IOS
        if (Input.touchCount == 0)
            return InputPhase.Nothing;

        Touch t = Input.GetTouch(0);
        if (t.phase == TouchPhase.Began)
            return InputPhase.Began;
        if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
            return InputPhase.Ended;
        if (t.phase == TouchPhase.Moved || t.phase == TouchPhase.Stationary)
            return InputPhase.Moved;
#endif
        return InputPhase.Nothing;
    }

    bool IsPointerOverUi()
    {
        if (EventSystem.current == null)
            return false;
        if (touch && Input.touchCount > 0)
            return EventSystem.current.IsPointerOverGameObject(Input.GetTouch(0).fingerId);
        return EventSystem.current.IsPointerOverGameObject();
    }

    private void ThrowFromTap(Vector2 worldEnd, float power)
    {
        LeanTween.cancel(ball.gameObject);
        Vector3 origin = ball.transform.position;
        float x = (worldEnd.x - origin.x) * AIM_X_SCALE;
        Vector2 dir = new Vector2(x, 1f);
        dir = ClampedVector2(dir.normalized, minAim, maxAim);

        bool aimedAside = Mathf.Abs(dir.x) > 0.18f;
        if (!aimedAside)
            dir = FixThrow(origin, dir);

        dir = AimAssist(origin, dir);
        Game.Instance.NotifyThrow();
        ball.Throw(dir.normalized, power);
    }

    private Vector2 FixThrow(Vector2 p, Vector2 dir)
    {
        RaycastHit2D hit = Physics2D.Raycast(p, dir, 25, 1 << 8);
        if (hit && hit.collider.name == "Rim center")
        {
            float hoopX = hoop.transform.position.x;
            float x = hit.point.x / Mathf.Clamp((hit.point.x - hoopX) / 0.1f, 1, 10);
            float y = hit.point.y + 0.7f;
            dir = new Vector2(x, y) - p;
        }

        return dir;
    }

    private Vector2 AimAssist(Vector2 p, Vector2 dir)
    {
        RaycastHit2D hit = Physics2D.Raycast(p, dir, 25, 1 << 8);
        if (!hit || hit.collider.name != "Aim assistance")
            return dir;

        float hitX = hit.collider.transform.position.x;
        float x = hitX - (hitX - hit.point.x) / 2f;
        Vector2 assisted = new Vector2(x, hit.point.y) - p;
        float mix = Mathf.Abs(dir.x) > 0.18f ? 0.2f : 0.45f;
        return Vector2.Lerp(dir, assisted.normalized, mix);
    }

    private Vector2 ClampedVector2(Vector2 p, Vector2 min, Vector2 max)
    {
        return new Vector2(Mathf.Clamp(p.x, min.x, max.x), Mathf.Clamp(p.y, min.y, max.y));
    }
}
