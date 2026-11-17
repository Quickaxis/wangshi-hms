"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Send,
  Loader2,
  Trash2,
  Volume2,
  HelpCircle,
} from "lucide-react";
import {
  getVapidPublicKeyAction,
  subscribePushAction,
  unsubscribePushAction,
  getPushSubscriptionStatusAction,
  sendTestNotificationAction,
} from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

// Helper to convert base64 url string to Uint8Array for pushManager.subscribe
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface NotificationSettingsTabProps {
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export function NotificationSettingsTab({ showToast }: NotificationSettingsTabProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Check current browser permission and subscription status
  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      // 1. Check database subscription status
      const statusRes = await getPushSubscriptionStatusAction();
      if (statusRes.success) {
        setIsSubscribed(statusRes.isSubscribed);
        setSubscriptionCount(statusRes.subscriptionCount);
      }

      // 2. Cross-verify with local browser registration
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && !statusRes.isSubscribed) {
        setIsSubscribed(true);
      }
    } catch (err) {
      console.warn("[HOSPIRO Push] Failed to check status:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Subscribe current device
  const handleSubscribe = async () => {
    if (!isSupported) {
      showToast("error", "Web Push is not supported on this browser.");
      return;
    }

    setIsActionLoading(true);
    try {
      // 1. Request browser permission
      const requestedPerm = await Notification.requestPermission();
      setPermission(requestedPerm);

      if (requestedPerm !== "granted") {
        showToast("error", "Notification permission was not granted. Please allow notifications in site settings.");
        setIsActionLoading(false);
        return;
      }

      // 2. Fetch VAPID public key
      const keyRes = await getVapidPublicKeyAction();
      if (!keyRes.success || !keyRes.publicKey) {
        showToast("error", keyRes.error || "Failed to retrieve VAPID key.");
        setIsActionLoading(false);
        return;
      }

      // 3. Register push with Service Worker
      const reg = await navigator.serviceWorker.ready;
      const convertedVapidKey = urlBase64ToUint8Array(keyRes.publicKey);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      const subJson = sub.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        showToast("error", "Invalid subscription keys received from browser.");
        setIsActionLoading(false);
        return;
      }

      // 4. Save subscription in Supabase
      const saveRes = await subscribePushAction({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        userAgent: navigator.userAgent,
      });

      if (saveRes.success) {
        setIsSubscribed(true);
        setSubscriptionCount((c) => Math.max(1, c + 1));
        showToast("success", "Push notifications enabled on this device!");
      } else {
        showToast("error", saveRes.error || "Failed to save push subscription.");
      }
    } catch (err: any) {
      console.error("[HOSPIRO Push] Subscribe error:", err);
      showToast("error", err?.message || "Failed to enable push notifications.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Unsubscribe current device
  const handleUnsubscribe = async () => {
    setIsActionLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribePushAction(sub.endpoint);
      } else {
        await unsubscribePushAction();
      }

      setIsSubscribed(false);
      setSubscriptionCount((c) => Math.max(0, c - 1));
      showToast("info", "Unsubscribed from push notifications on this device.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to unsubscribe.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Send a test push notification
  const handleSendTestPush = async () => {
    setIsTesting(true);
    try {
      const res = await sendTestNotificationAction();
      if (res.success) {
        showToast("success", "Test notification sent! Check your notification tray.");
      } else {
        showToast("error", res.error || "Failed to send test notification.");
      }
    } catch (err: any) {
      showToast("error", err?.message || "Test notification error.");
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#5146D8]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h3 className="text-lg md:text-xl font-bold text-[#252342]">Website Booking Push Notifications</h3>
        <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
          Receive real-time push alerts whenever a guest submits a booking on your homestay’s website, even when the browser is closed.
        </p>
      </div>

      {/* Browser Support Warning */}
      {!isSupported && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <p>
            This browser does not support Web Push notifications. For the best experience, install HOSPIRO as a PWA on Google Chrome for Android or desktop.
          </p>
        </div>
      )}

      {/* Device Status Card */}
      <div className="p-5 md:p-6 rounded-2xl border border-[#E8E6F2] bg-[#FFFFFF] shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E6F2]">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                isSubscribed
                  ? "bg-[#F0EEFF] text-[#5146D8] border border-[#5146D8]/20"
                  : "bg-[#F7F6FC] text-[#77758F] border border-[#E8E6F2]"
              )}
            >
              <Smartphone className="w-6 h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#252342]">This Device</span>
                {isSubscribed ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Subscribed & Active
                  </span>
                ) : permission === "denied" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Permission Denied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Not Enabled
                  </span>
                )}
              </div>
              <p className="text-xs text-[#77758F] mt-0.5">
                {isSubscribed
                  ? `Active on this device. Total registered devices: ${subscriptionCount}`
                  : "Enable push notifications to receive instant sound alerts for new website reservations."}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!isSubscribed ? (
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isActionLoading || permission === "denied" || !isSupported}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Enable Push Notifications
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSendTestPush}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#F0EEFF] text-[#5146D8] hover:bg-[#E5E2FA] border border-[#DCD7F8] transition-colors cursor-pointer disabled:opacity-50"
                  title="Send test notification to this device"
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Test Push
                </button>

                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={isActionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#DC2626] hover:bg-[#FEF2F2] border border-[#FECACA] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Unsubscribe
                </button>
              </>
            )}
          </div>
        </div>

        {/* Browser Permission Info */}
        {permission === "denied" && (
          <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 text-rose-800 text-xs space-y-1">
            <span className="font-bold block">Notifications are blocked in your browser settings:</span>
            <p className="text-[11px] leading-relaxed">
              To allow notifications, click the tune/lock icon in your browser address bar (or Android Chrome site settings), set Notifications to "Allow", and reload this page.
            </p>
          </div>
        )}

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-[#FAF9FF] border border-[#E8E6F2] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#252342]">
              <CheckCircle2 className="w-4 h-4 text-[#5146D8]" />
              <span>Instant Web Alerts</span>
            </div>
            <p className="text-[11px] text-[#77758F]">
              Direct notification on booking requests with guest name, room & dates.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF9FF] border border-[#E8E6F2] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#252342]">
              <ShieldCheck className="w-4 h-4 text-[#5146D8]" />
              <span>Role & Property Scoped</span>
            </div>
            <p className="text-[11px] text-[#77758F]">
              Only delivered to the assigned homestay owner and receptionist.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF9FF] border border-[#E8E6F2] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#252342]">
              <Volume2 className="w-4 h-4 text-[#5146D8]" />
              <span>Android PWA Ready</span>
            </div>
            <p className="text-[11px] text-[#77758F]">
              Wakes up the installed mobile app with native vibration and sound.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

