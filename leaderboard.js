// leaderboard.js
import { db, auth } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function formatNumberArabic(n) {
  try {
    return Number(n || 0).toLocaleString("ar-EG");
  } catch {
    return n ?? 0;
  }
}

function getSafeValue(obj, path, fallback = 0) {
  return (
    path
      .split(".")
      .reduce((acc, p) => (acc && acc[p] !== undefined ? acc[p] : null), obj) ??
    fallback
  );
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./newnewlogin.html";
    return;
  }

  const leaderboardList = document.getElementById("leaderboard-list");
  if (!leaderboardList) {
    console.error("leaderboard-list element not found.");
    document.querySelector("main").innerHTML +=
      '<p class="text-error-400 text-center">خطأ: عنصر لوحة الصدارة غير موجود.</p>';
    return;
  }

  leaderboardList.innerHTML = `
    <div class="loading-state text-center p-8 bg-surface-800 rounded-lg">
      <div class="loading-spinner border-4 border-primary-600 border-t-primary-400 rounded-full w-8 h-8 animate-spin mx-auto mb-4"></div>
      <p class="text-text-secondary">جاري تحميل بيانات المتصدرين...</p>
    </div>
  `;

  try {
    const pointsQ = query(
      collection(db, "users"),
      orderBy("stats.totalPoints", "desc"),
      limit(10)
    );
    const pointsSnap = await getDocs(pointsQ);
    console.log(
      "Fetched points data:",
      pointsSnap.docs.map((d) => d.data())
    );

    leaderboardList.innerHTML = "";

    const pointsSection = document.createElement("div");
    pointsSection.className = "leaderboard-section mb-8";
    pointsSection.innerHTML =
      '<h3 class="text-xl font-bold text-accent-500 mb-4">🏆 أعلى النقاط</h3>';
    const pointsTable = document.createElement("div");
    pointsTable.className = "leaderboard-table flex flex-col gap-3";

    if (pointsSnap.empty) {
      pointsTable.innerHTML =
        '<p class="no-data text-center text-text-tertiary">لا توجد بيانات متاحة</p>';
    } else {
      let rank = 1;
      pointsSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const isCurrentUser = docSnap.id === user.uid;
        const displayName = d.displayName || d.name || "مستخدم";
        const totalPoints = getSafeValue(d, "stats.totalPoints", d.points ?? 0);
        const correctAnswers = getSafeValue(d, "stats.total_correct", 0);

        const row = document.createElement("div");
        row.className = `leaderboard-row flex items-center justify-between p-4 bg-surface-800 rounded-lg shadow-card hover:bg-surface-700/70 ${
          isCurrentUser ? "bg-primary-500/10 border border-primary-600" : ""
        }`;
        row.innerHTML = `
          <div class="rank w-12 text-2xl font-bold text-accent-500 text-center">${rank}</div>
          <div class="player-info flex-1 ml-4">
            <div class="player-name font-semibold text-text-primary">${displayName}${
          isCurrentUser ? " (أنت)" : ""
        }</div>
            <div class="player-stats text-sm text-text-secondary">${formatNumberArabic(
              correctAnswers
            )} إجابة صحيحة</div>
          </div>
          <div class="points text-lg font-bold text-primary-400 text-right">${formatNumberArabic(
            totalPoints
          )} نقطة</div>
        `;
        pointsTable.appendChild(row);
        rank++;
      });
    }

    pointsSection.appendChild(pointsTable);
    leaderboardList.appendChild(pointsSection);

    const streakQ = query(
      collection(db, "users"),
      orderBy("streak", "desc"),
      limit(10)
    );
    const streakSnap = await getDocs(streakQ);
    console.log(
      "Fetched streak data:",
      streakSnap.docs.map((d) => d.data())
    );

    const streakSection = document.createElement("div");
    streakSection.className = "leaderboard-section mb-8";
    streakSection.innerHTML =
      '<h3 class="text-xl font-bold text-accent-500 mb-4">🔥 أطول المتابعات</h3>';
    const streakTable = document.createElement("div");
    streakTable.className = "leaderboard-table flex flex-col gap-3";

    if (streakSnap.empty) {
      streakTable.innerHTML =
        '<p class="no-data text-center text-text-tertiary">لا توجد بيانات متاحة</p>';
    } else {
      let rank = 1;
      streakSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const isCurrentUser = docSnap.id === user.uid;
        const displayName = d.displayName || d.name || "مستخدم";
        const streak = d.streak ?? 0;
        const totalPoints = getSafeValue(d, "stats.totalPoints", 0);

        const row = document.createElement("div");
        row.className = `leaderboard-row flex items-center justify-between p-4 bg-surface-800 rounded-lg shadow-card hover:bg-surface-700/70 ${
          isCurrentUser ? "bg-primary-500/10 border border-primary-600" : ""
        }`;
        row.innerHTML = `
          <div class="rank w-12 text-2xl font-bold text-accent-500 text-center">${rank}</div>
          <div class="player-info flex-1 ml-4">
            <div class="player-name font-semibold text-text-primary">${displayName}${
          isCurrentUser ? " (أنت)" : ""
        }</div>
            <div class="player-stats text-sm text-text-secondary">${formatNumberArabic(
              totalPoints
            )} نقطة</div>
          </div>
          <div class="streak text-lg font-bold text-primary-400 text-right">${formatNumberArabic(
            streak
          )} يوم</div>
        `;
        streakTable.appendChild(row);
        rank++;
      });
    }

    streakSection.appendChild(streakTable);
    leaderboardList.appendChild(streakSection);
  } catch (err) {
    console.error("Error loading leaderboard:", err);
    leaderboardList.innerHTML = `
      <div class="error-state text-center p-8 bg-surface-800 rounded-lg">
        <p class="text-error-400">⚠️ حدث خطأ في تحميل بيانات المتصدرين</p>
        <p class="text-text-secondary">يرجى المحاولة مرة أخرى لاحقاً</p>
      </div>
    `;
  }
});
