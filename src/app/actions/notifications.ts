"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapidPublicKey, sendWebPush, PushSubscriptionPayload } from "@/lib/webpush";

export interface PushNotificationResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface InAppNotification {
  id: string;
  homestay_id: string;
  partner_id?: string | null;
  user_id?: string | null;
  booking_request_id?: string | null;
  booking_id?: string | null;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any> | null;
  is_read: boolean;
  read_at?: string | null;
  idempotency_key?: string | null;
  created_at: string;
}

/**
 * Get VAPID public key for client push subscription setup.
 */
export async function getVapidPublicKeyAction(): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  try {
    const key = getVapidPublicKey();
    return { success: true, publicKey: key };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to retrieve VAPID key" };
  }
}

/**
 * Register or update a browser Web Push subscription for the authenticated partner.
 */
export async function subscribePushAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<PushNotificationResult> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required to subscribe for notifications." };
    }

    // 2. Lookup partner record
    const { data: partner } = await supabase
      .from("partners")
      .select("id, homestay_id, is_active, role")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Active partner account required." };
    }

    const adminClient = createAdminClient();

    // 3. Upsert subscription in push_subscriptions
    const { error: upsertError } = await adminClient
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          partner_id: partner.id,
          homestay_id: partner.homestay_id || null,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: subscription.userAgent || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (upsertError) {
      // If table doesn't exist yet, handle gracefully
      if (upsertError.code === "42P01") {
        return {
          success: false,
          error: "Push notifications table not migrated yet. Please apply migration_push_notifications.sql.",
        };
      }
      console.error("[HOSPIRO Push] Subscription upsert error:", upsertError);
      return { success: false, error: upsertError.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[HOSPIRO Push] subscribePushAction exception:", err);
    return { success: false, error: err?.message || "Failed to save push subscription" };
  }
}

/**
 * Unsubscribe or deactivate push subscription.
 */
export async function unsubscribePushAction(endpoint?: string): Promise<PushNotificationResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    }

    const { error } = await query;
    if (error && error.code !== "42P01") {
      console.error("[HOSPIRO Push] Unsubscribe error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to unsubscribe" };
  }
}

/**
 * Query active subscription status for the current user.
 */
export async function getPushSubscriptionStatusAction(): Promise<{
  success: boolean;
  isSubscribed: boolean;
  subscriptionCount: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, isSubscribed: false, subscriptionCount: 0 };
    }

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (error) {
      if (error.code === "42P01") {
        return { success: true, isSubscribed: false, subscriptionCount: 0 };
      }
      return { success: false, isSubscribed: false, subscriptionCount: 0, error: error.message };
    }

    return {
      success: true,
      isSubscribed: (data?.length || 0) > 0,
      subscriptionCount: data?.length || 0,
    };
  } catch (err: any) {
    return { success: false, isSubscribed: false, subscriptionCount: 0, error: err?.message };
  }
}

/**
 * Fetch recent in-app notifications for the active homestay.
 */
export async function getNotificationsAction(homestayId?: string): Promise<{
  success: boolean;
  notifications: InAppNotification[];
  unreadCount: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, notifications: [], unreadCount: 0, error: "Authentication required" };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, notifications: [], unreadCount: 0, error: "Unauthorized" };
    }

    const targetHomestayId = partner.role === "super_admin"
      ? (homestayId || partner.homestay_id)
      : partner.homestay_id;

    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (targetHomestayId) {
      query = query.eq("homestay_id", targetHomestayId);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01") {
        return { success: true, notifications: [], unreadCount: 0 };
      }
      return { success: false, notifications: [], unreadCount: 0, error: error.message };
    }

    const list = (data || []) as InAppNotification[];
    const unreadCount = list.filter((n) => !n.is_read).length;

    return { success: true, notifications: list, unreadCount };
  } catch (err: any) {
    return { success: false, notifications: [], unreadCount: 0, error: err?.message };
  }
}

/**
 * Mark a specific notification as read.
 */
export async function markNotificationReadAction(notificationId: string): Promise<PushNotificationResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (error && error.code !== "42P01") {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Mark all notifications as read for the active homestay.
 */
export async function markAllNotificationsReadAction(homestayId?: string): Promise<PushNotificationResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required" };

    const { data: partner } = await supabase
      .from("partners")
      .select("role, homestay_id")
      .eq("email", user.email)
      .single();

    const targetHomestayId = partner?.role === "super_admin"
      ? (homestayId || partner.homestay_id)
      : partner?.homestay_id;

    let query = supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);

    if (targetHomestayId) {
      query = query.eq("homestay_id", targetHomestayId);
    }

    const { error } = await query;
    if (error && error.code !== "42P01") {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Send a test notification to the current user's registered devices.
 */
export async function sendTestNotificationAction(): Promise<PushNotificationResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required" };

    const adminClient = createAdminClient();
    const { data: subscriptions } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!subscriptions || subscriptions.length === 0) {
      return { success: false, error: "No active push subscription registered for this device." };
    }

    let sent = 0;
    for (const sub of subscriptions) {
      const res = await sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        {
          title: "HOSPIRO Test Notification",
          body: "Push notifications are working perfectly on this device!",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-96x96.png",
          tag: "hospiro-test",
          data: { url: "/settings" },
        }
      );
      if (res.success) {
        sent++;
      } else if (res.expired) {
        await adminClient.from("push_subscriptions").update({ is_active: false }).eq("id", sub.id);
      }
    }

    return { success: sent > 0, data: { sentCount: sent } };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export interface BookingNotificationInput {
  homestayId: string;
  bookingRequestId?: string;
  bookingId?: string;
  guestName: string;
  guestPhone?: string;
  roomName?: string;
  checkIn: string;
  checkOut: string;
  numberOfGuests?: number;
  estimatedTotal?: number;
  bookingReference?: string;
}

/**
 * Core notification dispatcher:
 * 1. Guarantees idempotency (prevents duplicate alerts on retried submissions).
 * 2. Creates the in-app notification row scoped to the homestay.
 * 3. Identifies homestay owner, admin, and receptionists.
 * 4. Dispatches Web Push notifications to their subscribed devices.
 * 5. Cleans up expired subscriptions automatically.
 */
export async function dispatchBookingNotification(
  input: BookingNotificationInput
): Promise<{ success: boolean; notificationId?: string; pushSentCount: number; error?: string }> {
  try {
    const adminClient = createAdminClient();

    // 1. Idempotency Key Defense
    const idempotencyKey = input.bookingRequestId
      ? `booking_req:${input.bookingRequestId}`
      : `website_ref:${input.homestayId}:${input.bookingReference || `${input.guestName}_${input.checkIn}`}`;

    // Check if notification already exists
    const { data: existingNotif } = await adminClient
      .from("notifications")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingNotif) {
      console.log(`[HOSPIRO Push] Notification already exists for idempotency key ${idempotencyKey}. Skipping duplicate.`);
      return { success: true, notificationId: existingNotif.id, pushSentCount: 0 };
    }

    // 2. Fetch homestay details for brand context
    const { data: homestay } = await adminClient
      .from("homestays")
      .select("name, location")
      .eq("id", input.homestayId)
      .single();

    const homestayName = homestay?.name || "Homestay";
    const roomLabel = input.roomName ? ` for ${input.roomName}` : "";
    const amountLabel = input.estimatedTotal ? ` • ₹${input.estimatedTotal.toLocaleString("en-IN")}` : "";

    const title = `New Website Booking Request`;
    const message = `${input.guestName} requested ${roomLabel} (${input.checkIn} to ${input.checkOut})${amountLabel}`;

    // 3. Create in-app notification record
    let notificationId: string | undefined;
    const { data: insertedNotif, error: notifError } = await adminClient
      .from("notifications")
      .insert({
        homestay_id: input.homestayId,
        booking_request_id: input.bookingRequestId || null,
        booking_id: input.bookingId || null,
        type: "booking_request",
        title,
        message,
        data: {
          guest_name: input.guestName,
          guest_phone: input.guestPhone,
          room_name: input.roomName,
          check_in: input.checkIn,
          check_out: input.checkOut,
          number_of_guests: input.numberOfGuests || 1,
          estimated_total: input.estimatedTotal,
          homestay_name: homestayName,
          request_id: input.bookingRequestId,
          reference: input.bookingReference,
        },
        is_read: false,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .maybeSingle();

    if (notifError) {
      if (notifError.code !== "42P01") {
        console.warn("[HOSPIRO Push] Could not insert notification record:", notifError.message);
      }
    } else {
      notificationId = insertedNotif?.id;
    }

    // 4. Query target recipients:
    // Only partners assigned to this specific homestay (or super_admin)
    const { data: partners } = await adminClient
      .from("partners")
      .select("id, auth_user_id, role, homestay_id")
      .eq("is_active", true)
      .or(`homestay_id.eq.${input.homestayId},role.eq.super_admin`);

    const partnerIds = (partners || []).map((p) => p.id);
    const userIds = (partners || []).map((p) => p.auth_user_id).filter(Boolean);

    if (partnerIds.length === 0 && userIds.length === 0) {
      return { success: true, notificationId, pushSentCount: 0 };
    }

    // 5. Query active push subscriptions for these recipients
    let query = adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, partner_id")
      .eq("is_active", true);

    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    } else {
      query = query.in("partner_id", partnerIds);
    }

    const { data: subscriptions, error: subError } = await query;
    if (subError || !subscriptions || subscriptions.length === 0) {
      return { success: true, notificationId, pushSentCount: 0 };
    }

    // 6. Dispatch Web Push notifications
    let pushSentCount = 0;
    const pushPayload = {
      title,
      body: message,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      tag: input.bookingRequestId ? `booking-req-${input.bookingRequestId}` : `booking-notif-${Date.now()}`,
      data: {
        url: "/requests",
        requestId: input.bookingRequestId,
        homestayId: input.homestayId,
      },
    };

    for (const sub of subscriptions) {
      const res = await sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload
      );

      if (res.success) {
        pushSentCount++;
      } else if (res.expired) {
        // Automatically cleanup expired or revoked subscriptions
        await adminClient
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", sub.id);
      }
    }

    return { success: true, notificationId, pushSentCount };
  } catch (err: any) {
    console.error("[HOSPIRO Push] dispatchBookingNotification error:", err);
    return { success: false, pushSentCount: 0, error: err?.message };
  }
}

