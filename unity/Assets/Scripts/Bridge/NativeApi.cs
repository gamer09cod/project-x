using System.Runtime.InteropServices;
using UnityEngine;

namespace ProjectX.Bridge
{
    public static class NativeApi
    {
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        public static void SendToMobileApp(string message)
        {
            if (Application.platform == RuntimePlatform.Android)
            {
                using (var jc = new AndroidJavaClass("com.azesmwayreactnativeunity.ReactNativeUnityViewManager"))
                {
                    jc.CallStatic("sendMessageToMobileApp", message);
                }
                return;
            }

#if UNITY_IOS && !UNITY_EDITOR
            sendMessageToMobileApp(message);
#endif
        }
    }
}
