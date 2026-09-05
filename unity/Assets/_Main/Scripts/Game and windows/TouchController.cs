using UnityEngine;
using UnityEngine.EventSystems;

public enum InputPhase { Nothing, Began, Moved, Ended }

public class TouchController : MonoBehaviour
{
    public const float MAX_BALL_Y = 0.15f;
    public const float MIN_POWER = 0.85f;
    public const float MAX_POWER = 1.15f;
    public const float MAX_HOLD = 0.45f;
    public const float AIM_X_SCALE = 0.85f;
    public const float MIN_AIM_DELTA = 0.08f;

    public Vector2 minAim { get { return new Vector2(-0.85f, 0.55f); } }
    public Vector2 maxAim { get { return new Vector2(0.85f, 1.0f); } }

    public Ball ball;
    public Hoop hoop;

    private bool touch = false;
    private bool holding = false;
    private float holdStart;
    private Vector2 startPosition;
    private Vector3 ballPosition, currentPosition;

    protected void Update()
    {
        if (Game.Instance == null || Game.Instance.shotClock == null)
            return;

        if (ball.moving || Game.Instance.paused || Game.Instance.shotClock.BlocksNewShot())
        {
            if (holding && (Game.Instance.paused || Game.Instance.shotClock.BlocksNewShot()))
                CancelHold();
            return;
        }

        touch = Input.touchCount > 0;
        currentPosition = Camera.main.ScreenToWorldPoint(GetPosition());
        InputPhase phase = GetPhase();

        if (phase == InputPhase.Nothing)
            return;

        if (touch && Input.touchCount > 1)
        {
            CancelHold();
            return;
        }

        if (phase == InputPhase.Began)
        {
            if (IsPointerOverUi())
                return;

            holding = true;
            holdStart = Time.unscaledTime;
            startPosition = currentPosition;
            ballPosition = ball.transform.position;
            LeanTween.cancel(ball.gameObject);
            LeanTween.moveY(ball.gameObject, ballPosition.y + MAX_BALL_Y, 0.16f)
                .setEaseOutQuad();
        }
        else if (phase == InputPhase.Moved && holding && !ball.moving)
        {
            LeanTween.cancel(ball.gameObject);
            Vector2 swipeDelta = (Vector2)currentPosition - startPosition;
            float offset = Mathf.Clamp(Mathf.Max(0f, swipeDelta.y) / 1.25f * MAX_BALL_Y, 0f, MAX_BALL_Y);
            Vector3 v = ballPosition;
            v.y = ballPosition.y + Mathf.Max(offset, MAX_BALL_Y * 0.5f);
            ball.transform.position = Vector3.Lerp(ball.transform.position, v, Time.unscaledDeltaTime * 18f);
        }
        else if (phase == InputPhase.Ended && holding)
        {
            holding = false;
            if (ball.IsScaling())
            {
                CancelHold();
                return;
            }

            float hold = Mathf.Clamp01((Time.unscaledTime - holdStart) / MAX_HOLD);
            float power = Mathf.Lerp(MIN_POWER, MAX_POWER, hold);
            ThrowFromTap(currentPosition, power);
        }
    }

    protected void OnApplicationPause(bool pause)
    {
        if (pause)
            CancelHold();
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

    void CancelHold()
    {
        if (!holding)
            return;
        holding = false;
        LeanTween.cancel(ball.gameObject);
        if (!ball.moving)
            ball.transform.position = ballPosition;
    }

    private void ThrowFromTap(Vector2 worldEnd, float power)
    {
        LeanTween.cancel(ball.gameObject);
        Vector3 origin = ball.transform.position;
        Vector2 swipe = worldEnd - startPosition;

        Vector2 dir;
        if (Mathf.Abs(swipe.x) >= MIN_AIM_DELTA || swipe.y >= MIN_AIM_DELTA)
        {
            dir = swipe;
            if (dir.y < 0.4f)
                dir.y = 0.4f;
        }
        else
        {
            float x = (worldEnd.x - origin.x) * AIM_X_SCALE;
            dir = new Vector2(x, 1f);
        }

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
