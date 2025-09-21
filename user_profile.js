// js/user_profile.js
import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Handle avatar loading errors
function handleAvatarError(img) {
  console.log("Avatar image failed to load, using fallback");
  img.src =
    "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=120&h=120&crop=face";
  img.onerror = null; // Prevent infinite loop if fallback also fails
}

function formatNumberArabic(n) {
  return Number(n || 0).toLocaleString("ar-EG");
}

function updateValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value || "—";
}

function updateWeeklyChart(weeklyData) {
  const bars = document.querySelectorAll("[data-day]");
  if (!bars.length) return;

  const map = {};
  if (weeklyData && typeof weeklyData === "object") {
    Object.entries(weeklyData).forEach(([day, value]) => {
      map[day.trim()] = Number(value) || 0;
    });
  }

  const maxVal = Math.max(...Object.values(map), 1);
  const maxHeight = 120;

  bars.forEach((bar) => {
    const day = bar.dataset.day;
    const value = map[day] || 0;
    bar.style.height = `${Math.max(8, (value / maxVal) * maxHeight)}px`;
    bar.dataset.value = value;
  });
}

function renderAchievements(achievements) {
  const grid = document.getElementById("achievements-grid");
  if (!grid) return;

  if (!achievements || !achievements.length) {
    grid.innerHTML =
      '<p class="text-center text-slate-400">لا توجد إنجازات حتى الآن.</p>';
    return;
  }

  grid.innerHTML = achievements
    .map(
      (ach) => `
    <div class="achievement-badge bg-surface-700/50 rounded-lg p-4 text-center">
      <div class="text-3xl mb-2">${ach.emoji || "🏅"}</div>
      <div class="text-sm font-semibold text-white">${ach.name || "إنجاز"}</div>
      <div class="text-xs text-slate-400 mt-1">${
        ach.desc || "وصف الإنجاز"
      }</div>
    </div>
  `
    )
    .join("");
}

function renderFriendsPreview(friends) {
  const list = document.getElementById("friends-list");
  const countEl = document.getElementById("friends-count");
  const showAllBtn = document.getElementById("show-all-friends");
  if (!list || !countEl || !showAllBtn) return;

  list.innerHTML = "";

  if (!friends || !friends.length) {
    list.innerHTML =
      '<p class="text-center text-slate-400 p-4">لا توجد أصدقاء حتى الآن.</p>';
    countEl.textContent = "(0 أصدقاء)";
    showAllBtn.style.display = "none";
    return;
  }

  const preview = friends.slice(0, 3);
  countEl.textContent = `(${friends.length} أصدقاء)`;

  preview.forEach((friend) => {
    const card = document.createElement("div");
    card.className =
      "friend-card flex items-center gap-4 p-4 bg-surface-700/30 rounded-lg";
    card.innerHTML = `
      <img src="${
        friend.avatar ||
        friend.photoURL ||
        "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=48&h=48&crop=face"
      }" alt="${
      friend.name || friend.displayName || "صديق"
    }" class="w-12 h-12 rounded-full border-2 ${
      friend.status === "online" ? "border-accent-400" : "border-slate-600"
    }" onerror="handleAvatarError(this)">
      <div class="flex-1">
        <h3 class="font-semibold text-white">${
          friend.name || friend.displayName || "صديق"
        }</h3>
        <p class="text-sm text-slate-400">آخر نشاط: ${
          friend.lastActive || "غير محدد"
        }</p>
      </div>
      <div class="text-right">
        <p class="text-accent-400 font-semibold">${formatNumberArabic(
          friend.points || 0
        )}</p>
        <p class="text-xs text-slate-400">نقطة</p>
      </div>
      <div class="w-3 h-3 ${
        friend.status === "online" ? "bg-success-400" : "bg-slate-500"
      } rounded-full"></div>
    `;
    list.appendChild(card);
  });

  showAllBtn.style.display = friends.length > 3 ? "block" : "none";
}

function renderAllFriendsModal(friends) {
  const list = document.getElementById("all-friends-list");
  const modal = document.getElementById("all-friends-modal");
  const closeBtn = document.getElementById("close-friends-modal");
  if (!list || !modal || !closeBtn) return;

  if (!friends || !friends.length) {
    list.innerHTML =
      '<p class="text-center text-slate-400 p-4">لا توجد أصدقاء حتى الآن.</p>';
  } else {
    list.innerHTML = friends
      .map(
        (friend) => `
      <div class="friend-card flex items-center gap-4 p-4 bg-surface-700/30 rounded-lg">
        <img src="${
          friend.avatar ||
          friend.photoURL ||
          "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=48&h=48&crop=face"
        }" alt="${
          friend.name || friend.displayName || "صديق"
        }" class="w-12 h-12 rounded-full border-2 ${
          friend.status === "online" ? "border-accent-400" : "border-slate-600"
        }" onerror="handleAvatarError(this)">
        <div class="flex-1">
          <h3 class="font-semibold text-white">${
            friend.name || friend.displayName || "صديق"
          }</h3>
          <p class="text-sm text-slate-400">آخر نشاط: ${
            friend.lastActive || "غير محدد"
          }</p>
        </div>
        <div class="text-right">
          <p class="text-accent-400 font-semibold">${formatNumberArabic(
            friend.points || 0
          )}</p>
          <p class="text-xs text-slate-400">نقطة</p>
        </div>
        <div class="w-3 h-3 ${
          friend.status === "online" ? "bg-success-400" : "bg-slate-500"
        } rounded-full"></div>
      </div>
    `
      )
      .join("");
  }

  modal.classList.remove("hidden");
}

function showConfirmationModal(title, message, onConfirm) {
  const modal = document.getElementById("confirmation-modal");
  const titleEl = document.getElementById("modal-title");
  const messageEl = document.getElementById("modal-message");
  const cancelBtn = document.getElementById("modal-cancel");
  const confirmBtn = document.getElementById("modal-confirm");
  if (!modal || !titleEl || !messageEl || !cancelBtn || !confirmBtn) return;

  titleEl.textContent = title;
  messageEl.textContent = message;
  modal.classList.remove("hidden");

  // Set up new event listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.onclick = () => {
    onConfirm();
    modal.classList.add("hidden");
  };

  cancelBtn.onclick = () => modal.classList.add("hidden");
}

function animateCounters() {
  const counters = document.querySelectorAll(
    "#total-points, #current-streak, #total-questions"
  );
  counters.forEach((counter) => {
    counter.style.opacity = "0";
    counter.style.transform = "translateY(20px)";
    setTimeout(() => {
      counter.style.transition = "all 0.6s ease-out";
      counter.style.opacity = "1";
      counter.style.transform = "translateY(0)";
    }, Math.random() * 500 + 200);
  });
}

function addInteractiveEffects() {
  const friendCards = document.querySelectorAll(".friend-card");
  friendCards.forEach((card) => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateX(-5px)";
      card.style.backgroundColor = "rgba(51, 65, 85, 0.5)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "translateX(0)";
      card.style.backgroundColor = "rgba(51, 65, 85, 0.3)";
    });
  });

  const chartBars = document.querySelectorAll("[data-day]");
  chartBars.forEach((bar) => {
    bar.addEventListener("mouseenter", () => {
      const day = bar.dataset.day;
      const value = bar.dataset.value || 0;
      const tooltip = document.createElement("div");
      tooltip.className =
        "absolute bg-black text-white px-2 py-1 rounded text-xs z-10 -top-8 left-1/2 transform -translate-x-1/2";
      tooltip.textContent = `${day}: ${value} نقطة`;
      bar.parentElement.style.position = "relative";
      bar.parentElement.appendChild(tooltip);
      bar.style.backgroundColor = "#FBBF24";
    });
    bar.addEventListener("mouseleave", () => {
      const tooltip = bar.parentElement.querySelector(".absolute");
      if (tooltip) tooltip.remove();
      bar.style.backgroundColor = "#F59E0B";
    });
  });
}

function initializeAchievements() {
  const achievementBadges = document.querySelectorAll(".achievement-badge");
  achievementBadges.forEach((badge, index) => {
    badge.style.opacity = "0";
    badge.style.transform = "scale(0.8)";

    setTimeout(() => {
      badge.style.transition =
        "all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
      badge.style.opacity = "1";
      badge.style.transform = "scale(1)";
    }, index * 150 + 600);

    // Add hover effect
    badge.addEventListener("mouseenter", function () {
      this.style.transform = "scale(1.05) rotate(2deg)";
    });

    badge.addEventListener("mouseleave", function () {
      this.style.transform = "scale(1) rotate(0deg)";
    });
  });
}

function simulateRealTimeUpdates() {
  const stats = ["current-streak", "total-points"];
  const randomStat = stats[Math.floor(Math.random() * stats.length)];
  const element = document.getElementById(randomStat);

  if (element) {
    element.style.animation = "pulse 0.5s ease-in-out";
    setTimeout(() => {
      element.style.animation = "";
    }, 500);
  }
}

// Set up event listeners that don't depend on Firebase data
function setupGlobalEventListeners() {
  // Close friends modal
  const closeFriendsModal = document.getElementById("close-friends-modal");
  if (closeFriendsModal) {
    closeFriendsModal.addEventListener("click", () => {
      const modal = document.getElementById("all-friends-modal");
      if (modal) modal.classList.add("hidden");
    });
  }

  // Modal cancel button
  const modalCancel = document.getElementById("modal-cancel");
  if (modalCancel) {
    modalCancel.addEventListener("click", () => {
      const modal = document.getElementById("confirmation-modal");
      if (modal) modal.classList.add("hidden");
    });
  }

  // Close modals when clicking outside
  const confirmationModal = document.getElementById("confirmation-modal");
  if (confirmationModal) {
    confirmationModal.addEventListener("click", (e) => {
      if (e.target === confirmationModal) {
        confirmationModal.classList.add("hidden");
      }
    });
  }

  const allFriendsModal = document.getElementById("all-friends-modal");
  if (allFriendsModal) {
    allFriendsModal.addEventListener("click", (e) => {
      if (e.target === allFriendsModal) {
        allFriendsModal.classList.add("hidden");
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const confirmationModal = document.getElementById("confirmation-modal");
      const allFriendsModal = document.getElementById("all-friends-modal");

      if (confirmationModal) confirmationModal.classList.add("hidden");
      if (allFriendsModal) allFriendsModal.classList.add("hidden");
    }
  });
}

// Initialize the application
function initApp() {
  console.log("Initializing user profile...");
  setupGlobalEventListeners();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "./newlogin.html";
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.warn("No user data found in Firestore");
        // Create a basic user profile with minimal data
        updateValue("user-name", user.displayName || "مستخدم");
        updateValue("user-title", "مستخدم جديد");
        updateValue(
          "user-join-date",
          `عضو منذ: ${new Date(user.metadata.creationTime).toLocaleDateString(
            "ar-EG"
          )}`
        );
        updateValue("user-rank", "#—");

        // Set default stats
        updateValue("total-points", "0");
        updateValue("current-streak", "0");
        updateValue("accuracy-rate", "0%");
        updateValue("total-questions", "0");

        // Render empty achievements and friends
        renderAchievements([]);
        renderFriendsPreview([]);

        // Add interactive effects
        animateCounters();
        addInteractiveEffects();

        // Set up user-specific event listeners
        setupUserEventListeners([], user);
        return;
      }

      const data = userSnap.data();
      console.log("User data loaded:", data);

      // Update user info
      updateValue(
        "user-name",
        data.displayName || user.displayName || "مستخدم"
      );
      updateValue("user-title", data.title || "مستخدم جديد");
      updateValue(
        "user-join-date",
        `عضو منذ: ${
          data.joinDate ||
          new Date(user.metadata.creationTime).toLocaleDateString("ar-EG")
        }`
      );
      updateValue("user-rank", `#${data.rank || data.ranking || "—"}`);

      const avatarEl = document.getElementById("user-avatar");
      if (avatarEl) {
        // Use Firebase photoURL if available, otherwise keep the default
        if (user.photoURL) {
          avatarEl.src = user.photoURL;
          avatarEl.onerror = function () {
            handleAvatarError(this);
          };
        }
      }

      // Update stats
      const totalPoints =
        data.points || data.totalPoints || data.stats?.totalPoints || 0;
      updateValue("total-points", formatNumberArabic(totalPoints));

      const currentStreak =
        data.streak || data.currentStreak || data.stats?.currentStreak || 0;
      updateValue("current-streak", formatNumberArabic(currentStreak));

      // Calculate accuracy rate
      const totalCorrect =
        data.stats?.total_correct || data.correctAnswers || 0;
      const totalWrong = data.stats?.total_wrong || data.wrongAnswers || 0;
      const totalAnswered = totalCorrect + totalWrong;
      const accuracyRate =
        totalAnswered > 0
          ? Math.round((totalCorrect / totalAnswered) * 100)
          : 0;
      updateValue("accuracy-rate", `${accuracyRate}%`);

      updateValue("total-questions", formatNumberArabic(totalAnswered));

      // Update weekly chart
      updateWeeklyChart(
        data.weeklyStats || data.stats?.weekly || data.weekly || {}
      );

      // Update achievements
      const achievements =
        data.achievements?.unlocked || data.achievements || [];
      renderAchievements(achievements);

      // Update friends
      let friends = data.friends || [];
      if (!Array.isArray(friends)) {
        try {
          const friendsQuery = query(
            collection(db, "friends"),
            where("owner", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(10)
          );
          const friendsSnap = await getDocs(friendsQuery);
          friends = friendsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            avatar: doc.data().photoURL || doc.data().avatar,
            status: doc.data().status || "offline",
            lastActive: doc.data().lastActive || "غير محدد",
          }));
        } catch (error) {
          console.warn("Error fetching friends:", error);
          friends = [];
        }
      }
      renderFriendsPreview(friends);

      // Set up user-specific event listeners
      setupUserEventListeners(friends, user);

      // Interactive effects
      animateCounters();
      addInteractiveEffects();
      initializeAchievements();

      // Update stats every 45 seconds
      setInterval(simulateRealTimeUpdates, 45000);
    } catch (error) {
      console.error("Error loading profile:", error);
      // Don't show alert, just use fallback data
      console.log("Using fallback data due to error");

      // Update user info with fallback data
      updateValue("user-name", user.displayName || "مستخدم");
      updateValue("user-title", "مستخدم جديد");
      updateValue(
        "user-join-date",
        `عضو منذ: ${new Date(user.metadata.creationTime).toLocaleDateString(
          "ar-EG"
        )}`
      );
      updateValue("user-rank", "#—");

      // Set default stats
      updateValue("total-points", "0");
      updateValue("current-streak", "0");
      updateValue("accuracy-rate", "0%");
      updateValue("total-questions", "0");

      // Render empty achievements and friends
      renderAchievements([]);
      renderFriendsPreview([]);

      // Add interactive effects
      animateCounters();
      addInteractiveEffects();

      // Set up user-specific event listeners with empty friends array
      setupUserEventListeners([], user);
    }
  });
}

// Set up user-specific event listeners
function setupUserEventListeners(friends, user) {
  // Sign out functionality
  const signOutBtn = document.getElementById("sign-out-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      showConfirmationModal("تسجيل الخروج", "هل تريد تسجيل الخروج؟", () => {
        signOut(auth)
          .then(() => {
            document.body.style.transition = "opacity 0.5s ease-out";
            document.body.style.opacity = "0";
            setTimeout(() => (window.location.href = "/login_test.html"), 500);
          })
          .catch((error) => {
            console.error("Sign out error:", error);
          });
      });
    });
  }

  // Delete account functionality
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      showConfirmationModal(
        "حذف الحساب",
        "تحذير: هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك نهائياً.",
        () => {
          const deleteAnimation = document.createElement("div");
          deleteAnimation.className =
            "fixed inset-0 bg-error-600 z-50 flex items-center justify-center";
          deleteAnimation.innerHTML = `<div class="text-center text-white"><div class="text-6xl mb-4">⚠️</div><h2 class="text-2xl font-bold mb-2">جاري حذف الحساب...</h2><p class="text-lg opacity-75">شكراً لاستخدامك Zero Fake</p></div>`;
          document.body.appendChild(deleteAnimation);
          setTimeout(() => (window.location.href = "/login_test.html"), 3000);
        }
      );
    });
  }

  // Show all friends functionality
  const showAllFriendsBtn = document.getElementById("show-all-friends");
  if (showAllFriendsBtn) {
    showAllFriendsBtn.addEventListener("click", () => {
      renderAllFriendsModal(friends);
    });
  }
}

// Start the application when the DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
