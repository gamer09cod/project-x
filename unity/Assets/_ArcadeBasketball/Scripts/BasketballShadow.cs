using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Ground blob under the arcade ball. Follows X, stays on the court, scale/alpha from height.
    /// No collider or Rigidbody.
    /// </summary>
    public sealed class BasketballShadow : MonoBehaviour
    {
        [SerializeField]
        Transform ball;

        [SerializeField]
        Collider2D ground;

        [SerializeField]
        SpriteRenderer sprite;

        [SerializeField]
        BasketballGameplayConfig gameplayConfig;

        Vector3 _restScale;
        float _ballRadius = 0.3f;
        float _groundY;

        void Awake()
        {
            if (ball == null)
            {
                BasketballArcadeController arcade = GetComponentInParent<BasketballArcadeController>();
                if (arcade != null)
                    ball = arcade.transform;
            }

            if (sprite == null)
                sprite = GetComponent<SpriteRenderer>();

            if (ground == null)
            {
                CourtGroundMarker marker = FindFirstObjectByType<CourtGroundMarker>();
                if (marker != null)
                    ground = marker.GetComponent<Collider2D>();
            }

            if (ball != null)
            {
                CircleCollider2D circle = ball.GetComponent<CircleCollider2D>();
                if (circle != null)
                    _ballRadius = circle.radius * Mathf.Max(ball.lossyScale.x, ball.lossyScale.y);
            }

            _restScale = ComputeRestScale();

            BasketballGameplayConfig.TryGet(gameplayConfig, this, out gameplayConfig);

            if (ground != null)
                _groundY = ground.bounds.max.y;
        }

        Vector3 ComputeRestScale()
        {
            float ballDiameter = Mathf.Max(0.05f, _ballRadius * 2f);
            float spriteWidth = 1f;
            if (sprite != null && sprite.sprite != null)
                spriteWidth = Mathf.Max(0.01f, sprite.sprite.bounds.size.x);

            float scaleX = ballDiameter / spriteWidth;
            return new Vector3(scaleX, scaleX * 0.4f, 1f);
        }

        void LateUpdate()
        {
            if (ball == null)
                return;

            float groundY = ground != null ? _groundY : transform.position.y;
            Vector3 ballPos = ball.position;
            transform.position = new Vector3(ballPos.x, groundY, ballPos.z);

            if (gameplayConfig == null)
                return;

            float height = Mathf.Max(0f, ballPos.y - groundY - _ballRadius);
            float t = gameplayConfig.shadowFadeHeight > 0f
                ? Mathf.Clamp01(height / gameplayConfig.shadowFadeHeight)
                : 0f;

            float scaleMul = Mathf.Lerp(1f, gameplayConfig.shadowMinScale, t);
            transform.localScale = new Vector3(_restScale.x * scaleMul, _restScale.y * scaleMul, 1f);

            if (sprite == null)
                return;

            Color color = sprite.color;
            color.a = Mathf.Lerp(gameplayConfig.shadowMaxAlpha, gameplayConfig.shadowMinAlpha, t);
            sprite.color = color;
        }
    }
}
