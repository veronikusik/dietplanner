import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

const MEAL_CHANNEL = 'meal-reminders';
const COACH_CHANNEL = 'coach-reminders';
const BACKGROUND_TASK = 'DIETPLANNER_DAILY_CHECK';

// ── setup ─────────────────────────────────────────────────────────────

export async function initNotifications() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    if (newStatus !== 'granted') return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEAL_CHANNEL, {
      name: 'Meal Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 200, 100, 200],
    });
    await Notifications.setNotificationChannelAsync(COACH_CHANNEL, {
      name: 'Coach & Payments',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return true;
}

// ── meal reminders ────────────────────────────────────────────────────

const MEAL_TIMES = {
  2: [{ h: 11, m: 0, name: 'Brunch' }, { h: 18, m: 30, name: 'Dinner' }],
  3: [{ h: 8, m: 0, name: 'Breakfast' }, { h: 12, m: 30, name: 'Lunch' }, { h: 19, m: 0, name: 'Dinner' }],
  4: [{ h: 8, m: 0, name: 'Breakfast' }, { h: 12, m: 30, name: 'Lunch' }, { h: 15, m: 30, name: 'Snack' }, { h: 19, m: 0, name: 'Dinner' }],
  5: [{ h: 7, m: 30, name: 'Breakfast' }, { h: 10, m: 0, name: 'Snack' }, { h: 12, m: 30, name: 'Lunch' }, { h: 15, m: 30, name: 'Snack' }, { h: 19, m: 0, name: 'Dinner' }],
};

export async function scheduleMealReminders(mealsPerDay) {
  await cancelMealReminders();
  const meals = MEAL_TIMES[mealsPerDay] || MEAL_TIMES[3];

  for (const meal of meals) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🍽️ ${meal.name} time`,
        body: `Time for your ${meal.name.toLowerCase()}. Open DietPlanner to see what's on your plan.`,
        ...(Platform.OS === 'android' && { channelId: MEAL_CHANNEL }),
      },
      trigger: {
        type: 'daily',
        hour: meal.h,
        minute: meal.m,
      },
      identifier: `meal_${meal.name.toLowerCase()}_${meal.h}`,
    });
  }
}

export async function cancelMealReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith('meal_')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── coach expiry & check-in ───────────────────────────────────────────

export async function scheduleCoachReminders(expiresAt) {
  await cancelCoachReminders();
  if (!expiresAt) return;

  const now = Date.now();
  const twoHoursBefore = expiresAt - 2 * 3600000;

  if (twoHoursBefore > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Micro-Coach expiring soon',
        body: 'Your daily coaching pass expires in 2 hours. Renew with 1 SKR to keep your streak alive.',
        ...(Platform.OS === 'android' && { channelId: COACH_CHANNEL }),
      },
      trigger: {
        type: 'date',
        date: new Date(twoHoursBefore),
      },
      identifier: 'coach_expiry_warning',
    });
  }

  if (expiresAt > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔒 Micro-Coach expired',
        body: 'Your daily pass has ended. Open DietPlanner and renew for 1 SKR to continue your streak.',
        ...(Platform.OS === 'android' && { channelId: COACH_CHANNEL }),
      },
      trigger: {
        type: 'date',
        date: new Date(expiresAt),
      },
      identifier: 'coach_expired',
    });
  }
}

export async function scheduleCheckInNudge() {
  await cancelNotification('coach_checkin_nudge');
  const now = new Date();
  const nudge = new Date(now);
  nudge.setHours(14, 0, 0, 0);
  if (nudge <= now) nudge.setDate(nudge.getDate() + 1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💪 Don\'t forget your check-in',
      body: 'You haven\'t checked in today. Tap to maintain your nutrition streak!',
      ...(Platform.OS === 'android' && { channelId: COACH_CHANNEL }),
    },
    trigger: {
      type: 'daily',
      hour: 14,
      minute: 0,
    },
    identifier: 'coach_checkin_nudge',
  });
}

export async function cancelCheckInNudgeForToday() {
  await cancelNotification('coach_checkin_nudge');
}

export async function cancelCoachReminders() {
  const ids = ['coach_expiry_warning', 'coach_expired', 'coach_checkin_nudge'];
  for (const id of ids) {
    await cancelNotification(id);
  }
}

// ── morning renewal reminder ──────────────────────────────────────────

export async function scheduleMorningCoachReminder() {
  await cancelNotification('coach_morning_renew');
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '☀️ Start your day with Micro-Coach',
      body: 'Renew your daily pass (1 SKR) and check in to keep your streak going.',
      ...(Platform.OS === 'android' && { channelId: COACH_CHANNEL }),
    },
    trigger: {
      type: 'daily',
      hour: 8,
      minute: 0,
    },
    identifier: 'coach_morning_renew',
  });
}

export async function cancelMorningCoachReminder() {
  await cancelNotification('coach_morning_renew');
}

// ── helpers ───────────────────────────────────────────────────────────

async function cancelNotification(id) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (_) {}
}

export async function cancelAllDietPlannerNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
