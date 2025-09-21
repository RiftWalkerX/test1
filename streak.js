import { db, auth } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Get date in user's timezone
export function getTimezoneDate(date, timezone) {
  const options = { timeZone: timezone };
  const dateString = date.toLocaleDateString("en-US", options);
  return new Date(dateString);
}

// Format date as YYYY-MM-DD
export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parse date from YYYY-MM-DD format
export function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Calculate streak based on login dates
export function calculateStreak(loginDates, timezone) {
  if (!loginDates || loginDates.length === 0) return 0;

  // Convert login dates to timezone dates and format
  const timezoneDates = loginDates.map((date) => {
    let dateObj;
    if (typeof date.toDate === "function") {
      dateObj = date.toDate();
    } else if (date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else {
      dateObj = new Date(date);
    }
    return formatDate(getTimezoneDate(dateObj, timezone));
  });

  // Sort dates in descending order
  const sortedDates = [...new Set(timezoneDates)].sort(
    (a, b) => parseDate(b) - parseDate(a)
  );

  if (sortedDates.length === 0) return 0;

  const today = formatDate(getTimezoneDate(new Date(), timezone));
  const yesterday = formatDate(
    new Date(
      getTimezoneDate(new Date(), timezone).setDate(
        getTimezoneDate(new Date(), timezone).getDate() - 1
      )
    )
  );

  // Check if last login was today or yesterday
  const lastLogin = sortedDates[0];
  if (lastLogin !== today && lastLogin !== yesterday) {
    return 1; // Streak broken, start over
  }

  // Calculate consecutive days
  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const currentDate = parseDate(sortedDates[i - 1]);
    const previousDate = parseDate(sortedDates[i]);
    const dayDiff = Math.floor(
      (currentDate - previousDate) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff === 1) {
      streak++;
    } else if (dayDiff > 1) {
      break;
    }
  }

  return streak;
}

// Check and update daily streak
export async function checkDailyStreak(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const timezone =
      userData.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC";
    const today = formatDate(getTimezoneDate(new Date(), timezone));

    // Check if user already logged in today
    const lastLoginDate = userData.lastLoginDate;
    if (lastLoginDate) {
      let lastLoginDateObj;
      if (typeof lastLoginDate.toDate === "function") {
        lastLoginDateObj = lastLoginDate.toDate();
      } else if (lastLoginDate.seconds) {
        lastLoginDateObj = new Date(lastLoginDate.seconds * 1000);
      } else {
        lastLoginDateObj = new Date(lastLoginDate);
      }

      const lastLogin = formatDate(getTimezoneDate(lastLoginDateObj, timezone));
      if (lastLogin === today) {
        return; // Already logged in today
      }
    }

    // Update streak
    const loginDates = userData.loginDates || [];
    loginDates.push(new Date());

    const streak = calculateStreak(loginDates, timezone);
    const totalPoints = (userData.stats?.totalPoints || 0) + 10; // +10 points for daily login

    await updateDoc(userRef, {
      lastLoginDate: new Date(),
      loginDates: loginDates,
      streak: streak,
      "stats.totalPoints": totalPoints,
    });

    // Update streak display in UI
    const streakElement = document.getElementById("streak-count");
    if (streakElement) {
      streakElement.textContent = streak;
    }

    // Update points display in UI
    const pointsElement = document.getElementById("total-points");
    if (pointsElement) {
      pointsElement.textContent = totalPoints;
    }

    // Show streak notification
    if (streak > 1) {
      const toastEvent = new CustomEvent("showToast", {
        detail: {
          message: `🔥 سلسلة ${streak} أيام! لقد حصلت على 10 نقاط.`,
          type: "success",
        },
      });
      document.dispatchEvent(toastEvent);
    } else {
      const toastEvent = new CustomEvent("showToast", {
        detail: {
          message: "🔥 لقد حصلت على 10 نقاط لتسجيل الدخول اليوم!",
          type: "success",
        },
      });
      document.dispatchEvent(toastEvent);
    }
  } catch (error) {
    console.error("Error checking daily streak:", error);
  }
}
