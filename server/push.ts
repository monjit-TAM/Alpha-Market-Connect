import webpush from "web-push";
import { storage } from "./storage";
import type { PushSubscription as DBPushSubscription } from "@shared/schema";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@alphamarket.com";
let pushEnabled = false;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushEnabled = true;
    console.log("[Push] Web push notifications configured successfully");
  } catch (err) {
    console.error("[Push] Failed to configure VAPID:", err);
  }
} else {
  console.warn("[Push] VAPID keys not configured - push notifications disabled");
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, any>;
}

async function sendToSubscriptions(subs: DBPushSubscription[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || subs.length === 0) return;
  const jsonPayload = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await storage.deletePushSubscription(sub.endpoint);
        }
        throw err;
      }
    })
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.log(`Push notifications: ${results.length - failed} sent, ${failed} failed/expired`);
  }
}

export async function notifyStrategySubscribers(
  strategyId: string,
  strategyName: string,
  type: string,
  payload: PushPayload
): Promise<void> {
  try {
    await storage.createNotification({
      type,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      targetScope: "strategy_subscribers",
      strategyId,
    });

    const activeSubs = await storage.getActiveSubscriptionsByStrategy(strategyId);
    const userIds = Array.from(new Set(activeSubs.map((s) => s.userId)));
    const pushSubs = await storage.getPushSubscriptionsForUserIds(userIds);
    if (pushSubs.length > 0) {
      await sendToSubscriptions(pushSubs, payload);
    }
  } catch (err) {
    console.error("Error sending strategy notifications:", err);
  }
}

export async function notifyAllUsers(payload: PushPayload): Promise<void> {
  try {
    await storage.createNotification({
      type: "general_alert",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      targetScope: "all_users",
    });

    const allSubs = await storage.getAllPushSubscriptions();
    const loggedInSubs = allSubs.filter((s) => s.userId);
    if (loggedInSubs.length > 0) {
      await sendToSubscriptions(loggedInSubs, payload);
    }
  } catch (err) {
    console.error("Error sending broadcast notifications:", err);
  }
}

export async function notifyAllVisitors(payload: PushPayload): Promise<void> {
  try {
    await storage.createNotification({
      type: "general_alert",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      targetScope: "all_visitors",
    });

    const allSubs = await storage.getAllPushSubscriptions();
    if (allSubs.length > 0) {
      await sendToSubscriptions(allSubs, payload);
    }
  } catch (err) {
    console.error("Error sending visitor notifications:", err);
  }
}

export { vapidPublicKey, pushEnabled };
