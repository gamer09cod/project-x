using UnityEngine;
using System;

public enum HoopMovement { Horizontal, Vertical }

[RequireComponent(typeof(Rigidbody2D))]
public class Hoop : MonoBehaviour
{
    public const float MOVING_SPEED         = 0.33f;
    public const float RESET_MOVE_DURATION  = 0.15f;

    // Eased travel profile. The hoop still reverses off the "Hoop border"
    // trigger and still escalates via IncreaseSpeed — only the velocity shape
    // between the bounds changed, from a flat line to a curve that eases out of
    // each turn and slows as it approaches the next one.
    const float EDGE_SLOWDOWN   = 0.5f;   // speed multiplier at the extremes
    const float TURN_EASE_TIME  = 0.35f;  // ramp back up after reversing
    const float TURN_EASE_FLOOR = 0.55f;  // multiplier at the instant of a turn
    const float PROFILE_FLOOR   = 0.4f;   // never stall — must always clear the trigger
    const float BREATHE_AMOUNT  = 0.06f;
    const float TURN_REFRACTORY = 0.15f;  // ignore repeat border hits from child colliders

    // The curve's mean is below 1, so without this the hoop would traverse
    // slower than before and quietly make the game easier.
    const float SPEED_COMPENSATION = 1.18f;

    public Vector3 defaultPosition;

    [NonSerialized]
    public bool moving = false;

    float _speed;
    int _direction = 1;
    float _timeSinceTurn;
    float _extent;

    [Header("Objects")]
    public GameObject rim;
    public CircleCollider2D hoopTrigger;
    public EdgeCollider2D topTrigger;
    public EdgeCollider2D bottomTrigger;
    public GameObject bounceTrigger;

    private Rigidbody2D rb;
    private CapsuleCollider2D[] rimColls;
    private Vector3 rimPos;

    public void SetColliders(bool v)
    {
        foreach (var c in rimColls)
            c.enabled = v;

        hoopTrigger.enabled = topTrigger.enabled = bottomTrigger.enabled = v;
        bounceTrigger.SetActive(v);

        foreach (BoxCollider2D box in GetComponentsInChildren<BoxCollider2D>(true))
        {
            if (box.gameObject.name == "Backboard")
                box.enabled = v;
        }
    }

    public void ExposeHoop(float z)
    {
        Vector3 p = rim.transform.position; p.z = z;
        rim.transform.position = p;
    }

    public void ResetToIdle()
    {
        if (rim != null)
            LeanTween.cancel(rim.gameObject);
        moving = false;
        _speed = 0f;
        _direction = 1;
        _extent = 0f;
        transform.position = defaultPosition;
        if (rb != null)
            rb.linearVelocity = Vector2.zero;
        if (rim != null)
        {
            Vector3 p = rim.transform.position;
            p.y = rimPos.y;
            rim.transform.position = p;
        }
    }

    public void UpdateHoop()
    {
        if (Game.Instance != null && Game.Instance.embedMatchMode)
        {
            if (!moving)
                Move();
            return;
        }

        if (moving && Game.Instance.stage < 2)
        {
            moving = false;
            _speed = 0f;
            _direction = 1;
            _extent = 0f;
            transform.position = defaultPosition;
            rb.linearVelocity = Vector2.zero;
        }
        else if (!moving && Game.Instance.stage >= 2)
        {
            Move();
        }
    }

    public void Move()
    {
        moving = true;
        _speed = MOVING_SPEED;
        _direction = 1;
        _timeSinceTurn = TURN_EASE_TIME;
        _extent = 0f;
        rb.linearVelocity = Vector2.right * MOVING_SPEED;
    }

    void FixedUpdate()
    {
        if (!moving || rb == null)
            return;

        _timeSinceTurn += Time.fixedDeltaTime;
        rb.linearVelocity = new Vector2(_direction * _speed * TravelProfile(), 0f);
    }

    /// <summary>
    /// Speed multiplier for the current point in the traverse: quick through the
    /// middle, easing off toward each end, with a short ramp out of every turn.
    /// </summary>
    float TravelProfile()
    {
        float ramp = Mathf.SmoothStep(
            TURN_EASE_FLOOR, 1f, Mathf.Clamp01(_timeSinceTurn / TURN_EASE_TIME));

        // _extent is learned from the first reversal, so the very first
        // half-traverse runs flat rather than guessing at the bounds.
        float edge = 1f;
        if (_extent > 0.01f)
        {
            float d = Mathf.Clamp01(Mathf.Abs(transform.position.x - defaultPosition.x) / _extent);
            edge = Mathf.Lerp(1f, EDGE_SLOWDOWN, d * d);
        }

        // Unscaled so the wobble does not slow down inside the buzzer window.
        float breathe = 1f + Mathf.Sin(Time.unscaledTime * 1.7f) * BREATHE_AMOUNT;

        return Mathf.Max(PROFILE_FLOOR, ramp * edge * breathe) * SPEED_COMPENSATION;
    }

    public void Bounce()
    {
        if (rim == null)
            return;

        // Unscaled: this was dead code until the effect layer wired it up, and
        // the buzzer window runs at 0.3x while Pause() sets timeScale to 0 —
        // either would leave the rim stuck low mid-tween.
        LeanTween.cancel(rim.gameObject);
        LeanTween.moveY(rim.gameObject, rimPos.y - 0.035f, 0.25f)
            .setEaseInOutCubic()
            .setIgnoreTimeScale(true)
            .setOnComplete(() => {
                if (rim == null)
                    return;
                LeanTween.moveY(rim.gameObject, rimPos.y, 0.25f)
                    .setEaseInOutCubic()
                    .setIgnoreTimeScale(true);
            });
    }

    public void IncreaseSpeed(float v)
    {
        // Escalation now lives on the scalar base speed; FixedUpdate re-applies
        // it through the travel profile on the next physics step. Writing
        // rb.linearVelocity here would be dead when moving and would nudge a
        // stationary hoop when not.
        _speed = Mathf.Max(0f, _speed + v);
    }

    /// <summary>
    /// Ranked difficulty: set cruise speed without restarting the patrol.
    /// </summary>
    public void SetCruiseSpeed(float speed)
    {
        if (!moving)
            return;
        _speed = Mathf.Max(MOVING_SPEED * 0.7f, speed);
    }

    private void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        rimColls = rim.GetComponents<CapsuleCollider2D>();
        rimPos = rim.transform.position;
        EnsureBackboardColliders();
    }

    void EnsureBackboardColliders()
    {
        foreach (Transform t in GetComponentsInChildren<Transform>(true))
        {
            if (t.name != "Backboard")
                continue;
            if (t.GetComponent<Collider2D>() != null)
                continue;

            BoxCollider2D box = t.gameObject.AddComponent<BoxCollider2D>();
            box.size = new Vector2(0.55f, 0.7f);
        }
    }

    private void OnTriggerEnter2D(Collider2D collision)
    {
        if (collision.name == "Hoop border")
        {
            // The hoop is a compound body (rim capsules, backboard, several
            // triggers). Any child crossing the border shortly after the root
            // would flip direction a second time and drive the hoop straight
            // through the bound, with nothing beyond it to turn it back.
            if (_timeSinceTurn < TURN_REFRACTORY)
                return;

            // Learn how far the hoop actually travels so the profile can ease
            // toward the bounds without hardcoding them.
            float reach = Mathf.Abs(transform.position.x - defaultPosition.x);
            if (reach > _extent)
                _extent = reach;

            _direction = -_direction;
            _timeSinceTurn = 0f;
            rb.linearVelocity = new Vector2(_direction * _speed * PROFILE_FLOOR, 0f);
        }
    }
}
