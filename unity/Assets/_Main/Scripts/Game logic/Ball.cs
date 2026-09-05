using UnityEngine;
using System;
using System.Collections;

[RequireComponent(typeof(Rigidbody2D))]
public class Ball : MonoBehaviour
{
    public const float THROW_FORCE = 500.0f;
    public const float TORQUE = 10.0f;
    public const float SCALE_DURATION = 0.66f;
    public const float BALL_SPAWN_SCALE = 1.9f;
    public const float FIX_BOUNCE_X = 0.1f;
    public const float RECYCLE_DURATION = 0.35f;
    public const float RECYCLE_OFFSET_Y = -2.8f;

    public Animator animator;
    public ShadowAnim shadow;

    [NonSerialized]
    public bool touched = false;
    [NonSerialized]
    public bool moving = false;
    [NonSerialized]
    public bool touchedRim = false;
    [NonSerialized]
    public bool touchedBackboard = false;
    [NonSerialized]
    public bool[] passed = new bool[2];

    private bool gravity = false;
    private bool resolving = false;
    private Coroutine gravityRoutine;
    private Rigidbody2D rb;
    private Vector3 restPosition;

    protected void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
        restPosition = transform.position;
    }

    protected void FixedUpdate()
    {
        if (gravity)
            rb.AddForce(Vector2.down * 15f);
    }

    public void Throw(Vector2 direction, float f)
    {
        if (gravityRoutine != null)
            StopCoroutine(gravityRoutine);
        gravityRoutine = StartCoroutine(WaitForGravity());

        rb.AddForce(direction * THROW_FORCE * f);
        rb.AddTorque(Mathf.Clamp(direction.x * TORQUE, -1, 1), ForceMode2D.Impulse);

        shadow.Set(SCALE_DURATION);
        animator.SetBool("throw", true);
        moving = true;
    }

    private IEnumerator WaitForGravity()
    {
        yield return new WaitForSeconds(0.5f);
        gravity = true;
        gravityRoutine = null;
    }

    public void UpdateBall()
    {
        resolving = false;
        moving = touchedRim = touchedBackboard = passed[0] = passed[1] = gravity = false;

        if (gravityRoutine != null)
        {
            StopCoroutine(gravityRoutine);
            gravityRoutine = null;
        }

        rb.linearVelocity = Vector2.zero;
        rb.angularVelocity = rb.gravityScale = 0;

        animator.SetBool("throw", false);
        animator.SetBool("reset", false);

        Vector3 p = restPosition;
        transform.position = p;
        transform.localScale = Vector3.one * BALL_SPAWN_SCALE;
        transform.eulerAngles = Vector3.zero;
        shadow.enabled = false;
        shadow.transform.position = p + new Vector3(0, -0.5f, 0);
    }

    public void SetSkin(Sprite skin)
    {
        GetComponent<SpriteRenderer>().sprite = skin;
    }

    public bool IsScaling()
    {
        AnimatorStateInfo s = animator.GetCurrentAnimatorStateInfo(0);
        return s.IsName("Throw") || s.IsName("Reset");
    }

    public bool IsReseting()
    {
        return animator.GetCurrentAnimatorStateInfo(0).IsName("Reset");
    }

    public IEnumerator ResolveShot()
    {
        yield return new WaitForSeconds(AnimationDurations.RESET_BALL);

        if (passed[0] && passed[1])
            Game.Instance.UpdateGame();
        else
        {
            yield return RecycleFromOpposite();
            GameAudio.Instance?.PlayMiss();
            Game.Instance.OnShotMissed();
        }
    }

    IEnumerator RecycleFromOpposite()
    {
        resolving = true;
        if (gravityRoutine != null)
        {
            StopCoroutine(gravityRoutine);
            gravityRoutine = null;
        }

        gravity = false;
        rb.linearVelocity = Vector2.zero;
        rb.angularVelocity = 0;

        Vector3 rest = restPosition;
        Vector3 from = rest + new Vector3(0f, RECYCLE_OFFSET_Y, 0f);
        transform.position = from;
        LeanTween.cancel(gameObject);
        LeanTween.move(gameObject, rest, RECYCLE_DURATION).setEaseOutCubic();
        yield return new WaitForSeconds(RECYCLE_DURATION);
        UpdateBall();
    }

    protected void OnTriggerEnter2D(Collider2D collider)
    {
        if (collider.tag == "RimTrigger")
        {
            if (collider.name == "Top trigger")
                passed[0] = true;
            else if (collider.name == "Bottom trigger" && passed[0])
            {
                passed[1] = true;
                Game.Instance.AddPoint();
            }
        }
    }

    protected void OnTriggerExit2D(Collider2D collider)
    {
        if (resolving || IsReseting())
            return;

        if (collider.name == "Hoop trigger" || collider.tag == "GameBorder")
        {
            resolving = true;
            animator.SetBool("reset", true);
            StartCoroutine(ResolveShot());
        }
    }

    protected void OnCollisionEnter2D(Collision2D collision)
    {
        string n = collision.collider.name;
        if (n == "Rim")
        {
            rb.linearVelocity = FixVelocity();
            touchedRim = true;
            GameAudio.Instance?.PlayRim();
        }
        else if (n == "Backboard")
        {
            touchedBackboard = true;
            GameAudio.Instance?.PlayBackboard();
        }
    }

    private Vector2 FixVelocity()
    {
        Vector2 v = rb.linearVelocity;
        float m = touchedRim || Mathf.Abs(v.normalized.x) > 0.3f ? v.magnitude : v.magnitude * 1.33f;
        v.Normalize();

        if (!Game.Instance.hoop.moving && Mathf.Abs(v.x) < FIX_BOUNCE_X)
            return new Vector2(v.x >= 0 ? FIX_BOUNCE_X : -FIX_BOUNCE_X, v.y) * m;

        return v * m;
    }
}
