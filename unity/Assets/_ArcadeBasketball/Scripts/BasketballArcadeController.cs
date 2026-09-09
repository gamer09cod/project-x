using System;
using UnityEngine;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Combined arcade loop for BasketBall.unity: gravity, tap lift, tap-toward-hoop X.
    /// X is applied on tap only; the ball coasts between taps. Does not change Physics2D.gravity.
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public sealed class BasketballArcadeController : MonoBehaviour
    {
        [SerializeField]
        BasketballGameplayConfig gameplayConfig;

        [SerializeField]
        TapInputController tapInput;

        [SerializeField]
        Transform targetHoop;

        [Tooltip("Editor Game view overlay: velocity, desired X, target side. No gameplay effect.")]
        [SerializeField]
        bool showEditorOverlay = true;

        [SerializeField]
        Collider2D leftBoundary;

        [SerializeField]
        Collider2D rightBoundary;

        [SerializeField]
        Transform visual;

        /// <summary>Ball contacted the court floor (WallBottom). Also fires on Stay.</summary>
        public event Action OnGroundHit;

        /// <summary>Tap was accepted and will apply lift this physics step.</summary>
        public event Action OnTapApplied;

        /// <summary>Floor bounce with outbound Y (not a settle). Collision SFX.</summary>
        public event Action OnGroundBounce;

        /// <summary>Ball struck rim or backboard this Enter. Collision SFX.</summary>
        public event Action<HoopSolidKind> OnHoopSolidHit;

        public BasketballGameplayConfig GameplayConfig => gameplayConfig;

        bool _hitRim;
        bool _hitBackboard;
        bool _grounded;

        Rigidbody2D _body;
        Vector2 _safeSpawnPosition;
        bool _pendingTap;
        bool _isRecovering;
        float _recoverySecondsLeft;
        float _nextTapTime;
        float _debugDesiredX;
        float _steeringSuppressedUntil;
        Vector2 _velocityBeforePhysics;
        bool _floorImpactArmed = true;
        CircleCollider2D _circle;
        Collider2D _ballCollider;
        Collider2D _groundCollider;
        float _ballRadius = 0.3f;
        float _leftExit;
        float _rightExit;
        float _enterFromRight;
        float _enterFromLeft;
        bool _hasWrapBounds;

        void Awake()
        {
            _body = GetComponent<Rigidbody2D>();
            if (_body == null)
            {
                Debug.LogError("[ArcadeBasketball] BasketballArcadeController needs a Rigidbody2D.", this);
            }
            else
            {
                // Unity would apply gravity after FixedUpdate and overshoot the clamp.
                _body.gravityScale = 0f;
                _body.freezeRotation = true;
                _safeSpawnPosition = _body.position;
            }

            if (tapInput == null)
                tapInput = FindFirstObjectByType<TapInputController>();

            if (tapInput == null)
                Debug.LogError("[ArcadeBasketball] TapInputController is not assigned.", this);

            BasketballGameplayConfig.TryGet(gameplayConfig, this, out gameplayConfig);

            _circle = GetComponent<CircleCollider2D>();
            _ballCollider = _circle != null ? (Collider2D)_circle : GetComponent<Collider2D>();
            CacheBallRadius();

            CourtGroundMarker ground = FindFirstObjectByType<CourtGroundMarker>();
            if (ground != null)
                _groundCollider = ground.GetComponent<Collider2D>();

            if (targetHoop == null)
                Debug.LogError("[ArcadeBasketball] Target hoop is not assigned. Call SetTargetHoop.", this);

            if (visual == null)
            {
                Transform child = transform.Find("BasketballVisual");
                if (child != null)
                    visual = child;
            }

            IgnoreSideBoundaries();
        }

        void OnEnable()
        {
            if (tapInput != null)
                tapInput.OnGameplayTap += HandleGameplayTap;
        }

        void OnDisable()
        {
            if (tapInput != null)
                tapInput.OnGameplayTap -= HandleGameplayTap;

            _pendingTap = false;
            _isRecovering = false;
            _hitRim = false;
            _hitBackboard = false;
            _grounded = false;
            _steeringSuppressedUntil = 0f;
            _floorImpactArmed = true;
        }

        public void ClearShotContact()
        {
            _hitRim = false;
            _hitBackboard = false;
        }

        public ArcadeShotQuality ClassifyShot()
        {
            if (!_hitRim && !_hitBackboard)
                return ArcadeShotQuality.Perfect;
            if (_hitRim)
                return ArcadeShotQuality.Rim;
            return ArcadeShotQuality.Backboard;
        }

        /// <summary>Debug: snap the same body back to the Awake spawn. No OOB delay.</summary>
        public void DebugResetToSpawn()
        {
            if (_body == null)
                return;

            _isRecovering = false;
            _pendingTap = false;
            _steeringSuppressedUntil = 0f;
            _grounded = false;
            _floorImpactArmed = true;
            ClearShotContact();
            FreezeBody();
            _body.position = _safeSpawnPosition;
        }

        /// <summary>Cancel OOB recovery and queued taps. Round owns the spawn snap.</summary>
        public void ResetForNewRound()
        {
            _isRecovering = false;
            _pendingTap = false;
            _steeringSuppressedUntil = 0f;
            _grounded = false;
            _floorImpactArmed = true;
            ClearShotContact();
            if (_body != null)
                FreezeBody();
        }

        void HandleGameplayTap(Vector2 _)
        {
            if (_isRecovering)
                return;

            if (_pendingTap)
                return;

            if (gameplayConfig == null)
                return;

            if (Time.time < _nextTapTime)
                return;

            _nextTapTime = Time.time + gameplayConfig.tapCooldown;
            _pendingTap = true;
            OnTapApplied?.Invoke();
        }

        public void SetTargetHoop(Transform hoop)
        {
            targetHoop = hoop;
            if (targetHoop == null)
                Debug.LogError("[ArcadeBasketball] SetTargetHoop received a null transform.", this);
        }

        void IgnoreSideBoundaries()
        {
            if (_ballCollider == null)
                return;

            if (leftBoundary == null)
            {
                GameObject wall = GameObject.Find("WallLeft");
                if (wall != null)
                    leftBoundary = wall.GetComponent<Collider2D>();
            }

            if (rightBoundary == null)
            {
                GameObject wall = GameObject.Find("WallRight");
                if (wall != null)
                    rightBoundary = wall.GetComponent<Collider2D>();
            }

            if (leftBoundary != null)
                Physics2D.IgnoreCollision(_ballCollider, leftBoundary);
            if (rightBoundary != null)
                Physics2D.IgnoreCollision(_ballCollider, rightBoundary);

            CacheWrapBounds();
        }

        void CacheWrapBounds()
        {
            if (leftBoundary == null || rightBoundary == null)
            {
                _hasWrapBounds = false;
                return;
            }

            float radius = GetBallRadius();
            _leftExit = leftBoundary.bounds.min.x;
            _rightExit = rightBoundary.bounds.max.x;
            _enterFromRight = rightBoundary.bounds.min.x - radius;
            _enterFromLeft = leftBoundary.bounds.max.x + radius;
            _hasWrapBounds = true;
        }

        void FixedUpdate()
        {
            if (_body == null)
                return;

            if (_isRecovering)
            {
                TickRecovery();
                return;
            }

            if (!_body.simulated)
                return;

            if (gameplayConfig == null)
                return;

            if (_body.position.y < gameplayConfig.outOfBoundsY)
            {
                BeginRecovery(gameplayConfig);
                return;
            }

            float dt = Time.fixedDeltaTime;
            Vector2 velocity = _body.linearVelocity;

            ApplyGravityAndTap(ref velocity, gameplayConfig, dt);

            _body.linearVelocity = velocity;
            _velocityBeforePhysics = velocity;

            WrapIfPastSideBoundaries(gameplayConfig);
        }

        void LateUpdate()
        {
            SpinVisual();
        }

        void SpinVisual()
        {
            if (visual == null || _body == null || !_body.simulated)
                return;

            if (gameplayConfig == null)
                return;

            float radius = GetBallRadius();

            // Roll like a wheel: angle = -distance / radius. Sign: +X → clockwise in 2D.
            float degrees = -_body.linearVelocity.x / radius * gameplayConfig.spinMultiplier * Mathf.Rad2Deg
                * Time.deltaTime;
            visual.Rotate(0f, 0f, degrees, Space.Self);
        }

        void WrapIfPastSideBoundaries(BasketballGameplayConfig config)
        {
            Vector2 position = _body.position;
            float leftExit;
            float rightExit;
            float enterFromRight;
            float enterFromLeft;

            if (_hasWrapBounds)
            {
                leftExit = _leftExit;
                rightExit = _rightExit;
                enterFromRight = _enterFromRight;
                enterFromLeft = _enterFromLeft;
            }
            else
            {
                leftExit = -config.outOfBoundsX;
                rightExit = config.outOfBoundsX;
                enterFromRight = config.outOfBoundsX;
                enterFromLeft = -config.outOfBoundsX;
            }

            if (position.x < leftExit)
                position.x = enterFromRight;
            else if (position.x > rightExit)
                position.x = enterFromLeft;
            else
                return;

            _body.position = position;
        }

        void CacheBallRadius()
        {
            if (_circle == null)
            {
                _ballRadius = 0.3f;
                return;
            }

            float scale = Mathf.Max(Mathf.Abs(transform.lossyScale.x), Mathf.Abs(transform.lossyScale.y));
            _ballRadius = _circle.radius * scale;
            if (_ballRadius < 0.05f)
                _ballRadius = 0.3f;
        }

        float GetBallRadius()
        {
            return _ballRadius;
        }

        void BeginRecovery(BasketballGameplayConfig config)
        {
            _isRecovering = true;
            _recoverySecondsLeft = config.ballRecoveryDelay;
            _pendingTap = false;
            _steeringSuppressedUntil = 0f;
            FreezeBody();
            Debug.Log(
                $"[ArcadeBasketball] OOB recover delay={_recoverySecondsLeft:F2}",
                this);

            if (_recoverySecondsLeft <= 0f)
                FinishRecovery();
        }

        void TickRecovery()
        {
            // Pause sets timeScale 0 so this does not run. Countdown/results
            // set simulated false — keep recovering until ResetForNewRound or Finish.
            if (!_body.simulated)
                return;

            _recoverySecondsLeft -= Time.fixedDeltaTime;
            FreezeBody();
            if (_recoverySecondsLeft > 0f)
                return;

            FinishRecovery();
        }

        void FinishRecovery()
        {
            FreezeBody();
            _body.position = _safeSpawnPosition;
            _pendingTap = false;
            _isRecovering = false;
            _grounded = false;
            _floorImpactArmed = true;
            ClearShotContact();
        }

        void FreezeBody()
        {
            _body.linearVelocity = Vector2.zero;
            _body.angularVelocity = 0f;
            _velocityBeforePhysics = Vector2.zero;
        }

        void ApplyGravityAndTap(ref Vector2 velocity, BasketballGameplayConfig config, float dt)
        {
            if (_pendingTap)
            {
                _pendingTap = false;
                velocity.y = Mathf.Min(config.tapVelocity, config.maxUpwardVelocity);
                ApplyTapHorizontal(ref velocity, config);
            }
            else if (_grounded)
            {
                if (velocity.y < config.groundRestSpeed)
                    velocity.y = 0f;

                velocity.x = Mathf.MoveTowards(velocity.x, 0f, config.groundDrag * dt);
                if (Mathf.Abs(velocity.x) < config.groundStopSpeed)
                    velocity.x = 0f;
            }
            else
            {
                velocity += config.gravityMultiplier * Physics2D.gravity * dt;
            }

            if (velocity.y < -config.maxFallSpeed)
                velocity.y = -config.maxFallSpeed;
        }

        void ApplyTapHorizontal(ref Vector2 velocity, BasketballGameplayConfig config)
        {
            if (targetHoop == null)
            {
                _debugDesiredX = 0f;
                return;
            }

            // Fly toward that side of the court, not onto the target point.
            // Sign(target - ball) would drop to 0 at the hoop and reverse after passing.
            float dir = Mathf.Sign(targetHoop.position.x);
            if (dir == 0f)
                dir = _debugDesiredX != 0f ? Mathf.Sign(_debugDesiredX) : 1f;

            float desiredX = dir * config.horizontalSpeed;
            _debugDesiredX = desiredX;
            float blend = Time.time < _steeringSuppressedUntil
                ? config.collisionSteeringMultiplier
                : 1f;
            velocity.x = Mathf.Lerp(velocity.x, desiredX, blend);
        }

        void OnCollisionEnter2D(Collision2D collision)
        {
            if (_isRecovering || collision.collider == null)
                return;

            if (IsGround(collision.collider))
            {
                _grounded = true;
                _floorImpactArmed = false;
                ApplyGroundBounce();
                OnGroundHit?.Invoke();
                return;
            }

            HoopSolidMarker solid;
            if (!collision.collider.TryGetComponent(out solid))
                return;

            if (solid.Kind == HoopSolidKind.Backboard)
                _hitBackboard = true;
            else
                _hitRim = true;

            OnHoopSolidHit?.Invoke(solid.Kind);

            if (!gameplayConfig)
                return;

            float impactSpeed = Mathf.Max(
                _body != null ? _body.linearVelocity.magnitude : 0f,
                collision.relativeVelocity.magnitude);
            if (impactSpeed < gameplayConfig.minimumCollisionSpeedForSuppression)
                return;

            // Refresh, do not stack — another hit extends from now, not from leftover time.
            _steeringSuppressedUntil = Time.time + gameplayConfig.collisionSteeringDuration;
        }

        void ApplyGroundBounce()
        {
            if (_body == null)
                return;

            if (gameplayConfig == null)
                return;

            float incomingDown = Mathf.Max(0f, -_velocityBeforePhysics.y);
            Vector2 velocity = _body.linearVelocity;
            bool playSfx = incomingDown >= gameplayConfig.groundSfxMinIncoming;

            if (incomingDown < gameplayConfig.groundRestSpeed)
            {
                velocity.y = 0f;
                _body.linearVelocity = velocity;
                _velocityBeforePhysics = velocity;
                if (playSfx)
                    OnGroundBounce?.Invoke();
                return;
            }

            float bounceY = Mathf.Min(incomingDown * gameplayConfig.groundBounciness, gameplayConfig.maxBounceSpeed);
            if (bounceY < gameplayConfig.groundRestSpeed)
                bounceY = 0f;

            velocity.y = bounceY;
            _body.linearVelocity = velocity;
            _velocityBeforePhysics = velocity;
            if (playSfx)
                OnGroundBounce?.Invoke();
        }

        void OnCollisionStay2D(Collision2D collision)
        {
            if (_isRecovering)
                return;

            if (!IsGround(collision.collider))
                return;

            _grounded = true;
            OnGroundHit?.Invoke();

            if (gameplayConfig == null)
                return;

            if (_body != null && _body.linearVelocity.y > gameplayConfig.floorStayReArmY)
                _floorImpactArmed = true;

            if (_floorImpactArmed && _velocityBeforePhysics.y < -gameplayConfig.groundSfxMinIncoming)
            {
                _floorImpactArmed = false;
                ApplyGroundBounce();
            }
        }

        void OnCollisionExit2D(Collision2D collision)
        {
            if (IsGround(collision.collider))
            {
                _grounded = false;
                _floorImpactArmed = true;
            }
        }

        bool IsGround(Collider2D collider)
        {
            return collider != null && _groundCollider != null && collider == _groundCollider;
        }

#if UNITY_EDITOR
        void OnGUI()
        {
            if (!showEditorOverlay || _body == null)
                return;

            Vector2 velocity = _body.linearVelocity;
            string side = "none";
            if (targetHoop != null)
                side = targetHoop.position.x >= _body.position.x ? "R" : "L";

            const float width = 280f;
            const float height = 112f;
            Rect box = new Rect(12f, 12f, width, height);
            GUI.Box(box, "Arcade ball");
            GUI.Label(new Rect(20f, 32f, width - 16f, 20f),
                $"v ({velocity.x:F2}, {velocity.y:F2})");
            GUI.Label(new Rect(20f, 52f, width - 16f, 20f),
                $"desiredX {_debugDesiredX:F2}");
            GUI.Label(new Rect(20f, 72f, width - 16f, 20f),
                $"target {side}");
            float suppressLeft = Mathf.Max(0f, _steeringSuppressedUntil - Time.time);
            GUI.Label(new Rect(20f, 92f, width - 16f, 20f),
                _isRecovering
                    ? "OOB recovering"
                    : $"rim suppress {suppressLeft:F2}");
        }
#endif
    }
}
