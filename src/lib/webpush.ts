import { setVapidDetails, sendNotification } from "web-push";

// Default development VAPID credentials if not yet provided in .env.local
const DEFAULT_VAPID_PUBLIC = "BJmAzF0cWkma3b7jSFGJNAqK8Ozjn8fkqocZ8V1oNM45PSzAV-qhtv85Mt8OvJA1bM0xl1MxoAoHlKa6gaH4fwg";
const DEFAULT_VAPID_PRIVATE = "f6NI6hLQO1P--BW9GQ6OAGQQpghW65lg_0tm26TaudU";
const DEFAULT_VAPID_SUBJECT = "mailto:support@aetheroncore.in";

export function getVapidPublicKey(): string {
  return (
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    DEFAULT_VAPID_PUBLIC
  );
}

export function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE;
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (!vapidConfigured) {
    try {
      setVapidDetails(
        getVapidSubject(),
        getVapidPublicKey(),
        getVapidPrivateKey()
      );
      vapidConfigured = true;
    } catch (err) {
      console.error("[HOSPIRO WebPush] Failed to configure VAPID details:", err);
    }
  }
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Send a web push notification to a single browser subscription endpoint.
 * Handles expired/invalid subscriptions (404/410) cleanly so caller can delete them.
 */
export async function sendWebPush(
  subscription: PushSubscriptionPayload,
  payload: NotificationPayload
): Promise<{ success: boolean; expired?: boolean; statusCode?: number; error?: string }> {
  try {
    ensureVapidConfigured();

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const stringifiedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/icons/icon-96x96.png",
      tag: payload.tag || "hospiro-notification",
      data: payload.data || { url: "/requests" },
    });

    const result = await sendNotification(pushSubscription, stringifiedPayload, {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: "high",
    });

    return { success: true, statusCode: result.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode || err?.status;
    // 404 Not Found or 410 Gone means the browser subscription has expired or was revoked
    if (statusCode === 404 || statusCode === 410) {
      return { success: false, expired: true, statusCode, error: "Subscription expired or revoked" };
    }
    return {
      success: false,
      statusCode,
      error: err?.message || "Failed to send web push notification",
    };
  }
}
