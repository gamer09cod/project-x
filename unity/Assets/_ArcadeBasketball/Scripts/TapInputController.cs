using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace ProjectX.ArcadeBasketball
{
    /// <summary>
    /// Single-tap input for BasketBall.unity. Emits one logical tap per press.
    /// Does not touch physics — BasketballController (later) subscribes to OnGameplayTap.
    /// Isolated from Swish Shot TouchController on Main.unity.
    /// </summary>
    public sealed class TapInputController : MonoBehaviour
    {
        [SerializeField]
        bool inputEnabled = true;

        [Tooltip("Log each accepted tap. Uncheck after Phase 1 validation.")]
        [SerializeField]
        bool logTaps = true;

        /// <summary>Valid gameplay tap. Screen position is in pixels.</summary>
        public event Action<Vector2> OnGameplayTap;

        int _activeFingerId = -1;

        void Update()
        {
            if (!inputEnabled)
                return;

            if (Input.touchCount > 0)
            {
                ProcessTouches();
                return;
            }

            _activeFingerId = -1;
            if (Input.GetMouseButtonDown(0) && !IsPointerOverUi(-1))
                RaiseTap(Input.mousePosition);
        }

        void ProcessTouches()
        {
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);

                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                {
                    if (touch.fingerId == _activeFingerId)
                        _activeFingerId = -1;
                    continue;
                }

                if (touch.phase != TouchPhase.Began)
                    continue;

                // One in-flight pointer — extra fingers never become extra taps.
                if (_activeFingerId >= 0)
                    continue;

                if (IsPointerOverUi(touch.fingerId))
                    continue;

                _activeFingerId = touch.fingerId;
                RaiseTap(touch.position);
            }
        }

        void RaiseTap(Vector2 screenPosition)
        {
            if (logTaps)
                Debug.Log($"[TapInput] gameplay tap @ {screenPosition}", this);

            OnGameplayTap?.Invoke(screenPosition);
        }

        static bool IsPointerOverUi(int pointerId)
        {
            EventSystem es = EventSystem.current;
            if (es == null)
                return false;

            if (pointerId >= 0)
                return es.IsPointerOverGameObject(pointerId);

            return es.IsPointerOverGameObject();
        }

        public void SetInputEnabled(bool enabled)
        {
            inputEnabled = enabled;
            if (!enabled)
                _activeFingerId = -1;
        }
    }
}
