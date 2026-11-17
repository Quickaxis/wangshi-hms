"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Bell, CheckCheck, Inbox, Calendar, ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { createClient } from "@/lib/supabase/client";
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  InAppNotification,
} from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

// Gentle audio chime synthesized with Web Audio API (zero external assets needed)
function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.5);
  } catch (e) {
    // Audio autoplay might be prevented by browser policy if un-interacted
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { selectedHomestayId } = useHMSContext();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createClient(), []);

  // Fetch notifications
  const loadNotifications = useCallback(async () => {
    try {
      const res = await getNotificationsAction(selectedHomestayId || undefined);
      if (res.success) {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn("[HOSPIRO Notifications] Failed to fetch notifications:", err);
    }
  }, [selectedHomestayId]);

  useEffect(() => {
    let isMounted = true;
    loadNotifications();

    // Unique channel identifier prevents collisions and duplicate subscription attempts
    // during React Strict Mode double-invocations and fast effect re-runs
    const channelId = `notifications-${selectedHomestayId || "global"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase.channel(channelId);

    // Register all 'postgres_changes' listeners BEFORE calling .subscribe()
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          ...(selectedHomestayId ? { filter: `homestay_id=eq.${selectedHomestayId}` } : {}),
        },
        (payload) => {
          if (!isMounted) return;
          const newNotif = payload.new as InAppNotification;
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          setUnreadCount((c) => c + 1);
          setIsAnimating(true);
          playNotificationChime();
          setTimeout(() => {
            if (isMounted) setIsAnimating(false);
          }, 1200);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          ...(selectedHomestayId ? { filter: `homestay_id=eq.${selectedHomestayId}` } : {}),
        },
        (payload) => {
          if (!isMounted) return;
          const updated = payload.new as InAppNotification;
          setNotifications((prev) => {
            const next = prev.map((n) => (n.id === updated.id ? updated : n));
            setUnreadCount(next.filter((n) => !n.is_read).length);
            return next;
          });
        }
      );

    // Call subscribe once, strictly after all listeners are registered
    channel.subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedHomestayId, loadNotifications, supabase]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Handle clicking a notification
  const handleNotificationClick = async (notif: InAppNotification) => {
    // 1. Mark as read
    if (!notif.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      await markNotificationReadAction(notif.id);
    }

    setIsOpen(false);

    // 2. Navigate to requests or bookings view
    if (notif.booking_request_id || notif.type === "booking_request") {
      router.push("/requests");
    } else if (notif.booking_id) {
      router.push("/bookings");
    } else {
      router.push("/requests");
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await markAllNotificationsReadAction(selectedHomestayId || undefined);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center glass-panel-secondary border border-[#E8E7F2] transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[#5146D8]/50",
          isOpen ? "bg-[#F0EEFF] text-[#5146D8] border-[#5146D8]/30" : "text-[#77758F] hover:bg-[#F0EEFF] hover:text-[#5146D8]",
          isAnimating && "animate-bounce text-[#5146D8]"
        )}
      >
        <Bell className={cn("w-4 h-4", isAnimating && "animate-spin")} />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#5146D8] text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(81,70,216,0.5)] animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover / Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#FFFFFF] border border-[#E8E5F5] rounded-3xl shadow-[0_20px_50px_rgba(37,35,66,0.12)] z-[100] overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E5F5] bg-[#FAF9FF]/80">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#252342] tracking-wide">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-[#5146D8] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-[#5146D8] hover:text-[#4338CA] px-2 py-1 rounded-lg hover:bg-[#F0EEFF] transition-colors flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-[#77758F] hover:text-[#252342] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto hide-scrollbar divide-y divide-[#E8E5F5]/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-[#77758F]">
                <div className="w-12 h-12 rounded-2xl bg-[#F0EEFF] flex items-center justify-center text-[#5146D8] mb-3">
                  <Inbox className="w-6 h-6 opacity-60" />
                </div>
                <p className="text-xs font-semibold text-[#252342]">No notifications yet</p>
                <p className="text-[11px] text-[#77758F] mt-1 max-w-[200px]">
                  Incoming website booking submissions will appear here in real time.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const timeAgo = (() => {
                  try {
                    return formatDistanceToNow(new Date(notif.created_at), { addSuffix: true });
                  } catch {
                    return "Recently";
                  }
                })();

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      "px-5 py-3.5 cursor-pointer transition-colors flex items-start gap-3.5 group",
                      notif.is_read
                        ? "bg-white hover:bg-[#FAF9FF]"
                        : "bg-[#F7F6FC] hover:bg-[#F0EEFF]/60"
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm mt-0.5",
                        notif.is_read
                          ? "bg-[#FAF9FF] border border-[#E8E5F5] text-[#77758F]"
                          : "bg-[#F0EEFF] border border-[#5146D8]/20 text-[#5146D8]"
                      )}
                    >
                      <Calendar className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={cn(
                            "text-xs truncate block",
                            notif.is_read ? "font-semibold text-[#252342]" : "font-bold text-[#5146D8]"
                          )}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-[#77758F] shrink-0 font-normal">
                          {timeAgo}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#555268] line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      {notif.data?.guest_phone && (
                        <span className="text-[10px] text-[#77758F] block mt-1">
                          Phone: {notif.data.guest_phone}
                        </span>
                      )}
                    </div>

                    {/* Unread dot */}
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#5146D8] shrink-0 mt-2 shadow-[0_0_6px_rgba(81,70,216,0.6)]" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#E8E5F5] bg-[#FAF9FF] flex items-center justify-between text-xs">
            <span className="text-[11px] text-[#77758F]">HOSPIRO Realtime Push</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push("/requests");
              }}
              className="text-[11px] font-bold text-[#5146D8] hover:text-[#4338CA] flex items-center gap-1"
            >
              All Requests
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

