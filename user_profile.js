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
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Handle avatar loading errors
function handleAvatarError(img) {
  console.log("Avatar image failed to load, using fallback");
  img.src = "img.svg";
  img.onerror = null; // Prevent infinite loop if fallback also fails
}

function formatNumberArabic(n) {
  return Number(n || 0).toLocaleString("ar-EG");
}

function updateValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value || "—";
}

function renderAchievements(achievements) {
  const grid = document.getElementById("achievements-grid");
  if (!grid) return;

  if (!achievements || !achievements.length) {
    grid.innerHTML =
      '<p class="text-center text-slate-400">لا توجد إنجازات حتى الآن.</p>';
    return;
  }

  // Map to objects if they are strings (from Firestore unlocked array)
  const mappedAchievements = achievements.map((ach) => {
    if (typeof ach === "string") {
      return {
        emoji: "🏆",
        name: ach,
        desc: "إنجاز مكتسب",
      };
    } else {
      return ach;
    }
  });

  grid.innerHTML = mappedAchievements
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
      <img src="${friend.avatar || friend.photoURL || "img.svg"}" alt="${
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
        <p class="text-accent-400 font-semibold">${formatNumberArabic(
          friend.streak || 0
        )}</p>
        <p class="text-xs text-slate-400">سلسلة 🔥</p>
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
        <img src="${friend.avatar || friend.photoURL || "img.svg"}" alt="${
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
          <p class="text-accent-400 font-semibold">${formatNumberArabic(
            friend.streak || 0
          )}</p>
          <p class="text-xs text-slate-400">سلسلة 🔥</p>
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

function showConfirmationModal(
  title,
  message,
  onConfirm,
  requiresCheckbox = false
) {
  const modal = document.getElementById("confirmation-modal");
  const titleEl = document.getElementById("modal-title");
  const messageEl = document.getElementById("modal-message");

  if (!modal || !titleEl || !messageEl) return;

  // Clear previous content and reset
  titleEl.textContent = title;
  messageEl.textContent = message;

  // Remove any existing checkbox
  const existingCheckbox = document.getElementById("checkbox-input");
  if (existingCheckbox) {
    existingCheckbox.remove();
  }

  // Get fresh button references (they might have been cloned before)
  let confirmBtn = document.getElementById("modal-confirm");
  let cancelBtn = document.getElementById("modal-cancel");

  // Clone and replace buttons to remove old event listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  // Update references to the new buttons
  confirmBtn = newConfirmBtn;
  cancelBtn = newCancelBtn;

  // Reset confirm button state
  confirmBtn.disabled = false;
  confirmBtn.style.opacity = "1";
  confirmBtn.style.cursor = "pointer";

  // Add checkbox if required
  if (requiresCheckbox) {
    const checkboxField = document.createElement("div");
    checkboxField.id = "checkbox-input";
    checkboxField.className =
      "mb-4 flex items-center gap-3 bg-surface-700/50 p-3 rounded-lg";
    checkboxField.innerHTML = `
      <input type="checkbox" id="confirm-delete" 
             class="w-5 h-5 text-error-600 bg-surface-800 border-surface-600 rounded focus:ring-error-500 focus:ring-2">
      <label for="confirm-delete" class="text-slate-300 text-sm">
        أنا أدرك أن هذا الإجراء لا يمكن التراجع عنه وأوافق على حذف حسابي نهائياً
      </label>
    `;
    messageEl.parentNode.insertBefore(checkboxField, messageEl.nextSibling);

    // Initially disable confirm button
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = "0.5";
    confirmBtn.style.cursor = "not-allowed";

    // Add checkbox change listener
    const checkbox = document.getElementById("confirm-delete");
    checkbox.addEventListener("change", function () {
      if (this.checked) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = "1";
        confirmBtn.style.cursor = "pointer";
      } else {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = "0.5";
        confirmBtn.style.cursor = "not-allowed";
      }
    });
  }

  // Add click event listeners
  confirmBtn.addEventListener("click", function confirmHandler() {
    if (requiresCheckbox) {
      const isChecked = document.getElementById("confirm-delete")?.checked;
      if (!isChecked) {
        alert("يرجى الموافقة على المربع لتأكيد حذف الحساب");
        return;
      }
    }
    onConfirm();
    modal.classList.add("hidden");
  });

  cancelBtn.addEventListener("click", function cancelHandler() {
    modal.classList.add("hidden");
  });

  // Show the modal
  modal.classList.remove("hidden");
}
function animateCounters() {
  const counters = document.querySelectorAll(
    "#total-points, #current-streak, #total-questions, #accuracy-rate"
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
        updateValue("user-title","user id :" + user.uid);

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
      updateValue(
        "user-title",  data.uid ||"USER ID:   "+ user.uid || " كود المستخدم"
      );

      // FIXED: Handle rank properly - check multiple possible fields
      const userRank = data.rank || data.ranking || data.globalRank || "—";
      updateValue("user-rank", `#${userRank}`);

      const avatarEl = document.getElementById("user-avatar");
      if (avatarEl) {
        // Use Firebase photoURL if available, otherwise keep the default
        if (data.photoURL || user.photoURL) {
          avatarEl.src = data.photoURL || user.photoURL;
          avatarEl.onerror = function () {
            handleAvatarError(this);
          };
        }
      }

      // Update stats from data.stats
      const stats = data.stats || {};
      const totalPoints = stats.totalPoints || data.totalPoints || 0;
      updateValue("total-points", formatNumberArabic(totalPoints));

      const currentStreak = stats.streak || data.streak || 0;
      updateValue("current-streak", formatNumberArabic(currentStreak));

      // Calculate accuracy rate
      const totalCorrect = stats.total_correct || data.correctAnswers || 0;
      const totalWrong = stats.total_wrong || data.wrongAnswers || 0;
      const totalAnswered = totalCorrect + totalWrong;
      const accuracyRate =
        totalAnswered > 0
          ? Math.round((totalCorrect / totalAnswered) * 100)
          : 0;
      updateValue("accuracy-rate", `${accuracyRate}%`);

      updateValue("total-questions", formatNumberArabic(totalAnswered));

      // Update achievements
      const achievements =
        data.achievements?.unlocked || data.achievements || [];
      renderAchievements(achievements);

      // Update friends from top-level "friends" collection
      let friends = [];
      try {
        const friendsQuery = query(
          collection(db, "friends"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const friendsSnap = await getDocs(friendsQuery);
        friends = await Promise.all(
          friendsSnap.docs.map(async (friendSnap) => {
            const friendData = friendSnap.data();
            // Fetch friend's user data
            const friendUserRef = doc(db, "users", friendData.friendId);
            const friendUserSnap = await getDoc(friendUserRef);
            let friendUserData = {};
            if (friendUserSnap.exists()) {
              friendUserData = friendUserSnap.data();
            }

            let lastActive = null;
            let lastActiveStr = "غير محدد";

            // Parse lastActiveDate
            if (friendUserData.lastActiveDate) {
              if (friendUserData.lastActiveDate.toDate) {
                lastActive = friendUserData.lastActiveDate.toDate();
              } else if (typeof friendUserData.lastActiveDate === "string") {
                lastActive = new Date(friendUserData.lastActiveDate);
              }
            }
            // Fallback to lastLoginDate
            else if (friendUserData.lastLoginDate) {
              if (friendUserData.lastLoginDate.toDate) {
                lastActive = friendUserData.lastLoginDate.toDate();
              } else if (typeof friendUserData.lastLoginDate === "string") {
                lastActive = new Date(friendUserData.lastLoginDate);
              }
            }

            if (lastActive && !isNaN(lastActive.getTime())) {
              lastActiveStr = lastActive.toLocaleString("ar-EG");
            }

            const isOnline =
              lastActive &&
              !isNaN(lastActive.getTime()) &&
              Date.now() - lastActive.getTime() < 30 * 60 * 1000;

            return {
              id: friendSnap.id,
              ...friendData,
              displayName:
                friendData.friendName || friendUserData.displayName || "صديق",
              name:
                friendData.friendName || friendUserData.displayName || "صديق",
              photoURL: friendUserData.photoURL || null,
              avatar: friendUserData.photoURL || null,
              status: isOnline ? "online" : "offline",
              lastActive: lastActiveStr,
              points: friendUserData.stats?.totalPoints || 0,
              streak: friendUserData.streak || 0,
            };
          })
        );
      } catch (error) {
        console.warn("Error fetching friends:", error);
        friends = [];
      }
      renderFriendsPreview(friends);

      // Set up user-specific event listeners
      setupUserEventListeners(friends, user);

      // Interactive effects
      animateCounters();
      addInteractiveEffects();
      initializeAchievements();
    } catch (error) {
      console.error("Error loading profile:", error);
      // Don't show alert, just use fallback data
      console.log("Using fallback data due to error");

      // Update user info with fallback data
      updateValue("user-name", user.displayName || "مستخدم");
      updateValue("user-title", user.uid);

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
            setTimeout(() => (window.location.href = "./newlogin.html"), 500);
          })
          .catch((error) => {
            console.error("Sign out error:", error);
            alert("حدث خطأ أثناء تسجيل الخروج: " + error.message);
          });
      });
    });
  }

  // Delete account functionality - UPDATED with checkbox
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      showConfirmationModal(
        "حذف الحساب",
        "تحذير: هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك نهائياً.",
        async () => {
          try {
            // Show loading animation
            const deleteAnimation = document.createElement("div");
            deleteAnimation.className =
              "fixed inset-0 bg-error-600 z-50 flex items-center justify-center";
            deleteAnimation.innerHTML = `<div class="text-center text-white"><div class="text-6xl mb-4">⚠️</div><h2 class="text-2xl font-bold mb-2">جاري حذف الحساب...</h2><p class="text-lg opacity-75">شكراً لاستخدامك Zero Fake</p></div>`;
            document.body.appendChild(deleteAnimation);

            // Delete user data from Firestore first
            const userRef = doc(db, "users", user.uid);
            await deleteDoc(userRef);

            // Then delete the auth account
            await deleteUser(user);

            setTimeout(() => (window.location.href = "./newlogin.html"), 2000);
          } catch (error) {
            console.error("Error deleting account:", error);
            alert("حدث خطأ أثناء حذف الحساب: " + error.message);

            // Remove loading animation
            const deleteAnimation = document.querySelector(".fixed.inset-0");
            if (deleteAnimation) deleteAnimation.remove();
          }
        },
        true // Requires checkbox confirmation
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
