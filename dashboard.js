// dashboard.js
import { auth, db } from "./firebase-init.js";
import { loadFriendRequests, sendFriendRequest } from "./friends.js";
import { loadRoomInvites, setupRoomInviteListener } from "./room-invites.js";
import { checkDailyStreak } from "./streak.js";
import { loadProfileData } from "./profile.js";
import { updateLevelsStatus, handleLevelClick } from "./training.js";
import { startTutorial, endTutorial } from "./tutorial.js";

// Update profile images & display name using auth.currentUser (falls back to img.svg)
function updateProfileImages() {
  const user = auth.currentUser;
  const profileImg = document.getElementById("userProfileImage");
  const profileImgCard = document.getElementById("userProfileImageCard");
  const displayNameEl = document.getElementById("userDisplayName");

  const photoUrl = user?.photoURL || null;
  const displayName = user?.displayName || "";

  if (profileImg) {
    profileImg.src = photoUrl || "img.svg";
    profileImg.onerror = () => (profileImg.src = "img.svg");
  }
  if (profileImgCard) {
    profileImgCard.src = photoUrl || "img.svg";
    profileImgCard.onerror = () => (profileImgCard.src = "img.svg");
  }
  if (displayNameEl) displayNameEl.textContent = displayName;
}

// Dashboard initialization and event listeners
document.addEventListener("DOMContentLoaded", async function () {
  // If already signed in, load profile & update images immediately
  if (auth.currentUser) {
    try {
      await loadProfileData();
    } catch (e) {
      // ignore if loadProfileData not ready
      console.warn("loadProfileData error:", e);
    }
    updateProfileImages();
  }

  // Auth state listener
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "newlogin.html";
      return;
    }

    await loadProfileData();
    updateProfileImages();

    loadFriendRequests();
    loadRoomInvites();
    setupRoomInviteListener();
    checkDailyStreak(user.uid);
  });

  // Set up UI event listeners
  setupUIEventListeners();
});

function setupUIEventListeners() {
  // Settings menu
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  if (settingsBtn && settingsMenu) {
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMenu.classList.toggle("opacity-0");
      settingsMenu.classList.toggle("pointer-events-none");
    });

    document.addEventListener("click", (e) => {
      if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
        settingsMenu.classList.add("opacity-0", "pointer-events-none");
      }
    });
  }

  // Add friend modal
  setupAddFriendModal();
  setupJoinRoomModal();
  setupTrainingGuideModal();

  // Level nodes - ensure these exist and attach click handlers
  document.querySelectorAll(".level-node").forEach((node) => {
    node.addEventListener("click", () => {
      const level = parseInt(node.dataset.level);
      handleLevelClick(level);
    });
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideModal(document.getElementById("levelModal"));
      hideModal(document.getElementById("addFriendModal"));
      hideModal(document.getElementById("joinRoomModal"));
      hideModal(document.getElementById("trainingGuideModal"));

      if (isTutorialActive) {
        endTutorial();
      }

      settingsMenu?.classList.add("opacity-0", "pointer-events-none");
    }
  });
}

function setupAddFriendModal() {
  const addFriendBtn = document.getElementById("addFriendBtn");
  const addFriendModal = document.getElementById("addFriendModal");
  const closeBtn = document.getElementById("closeAddFriendModalBtn");
  const sendBtn = document.getElementById("sendFriendRequestBtn");
  const input = document.getElementById("friendIdInput");

  addFriendBtn?.addEventListener("click", () => {
    showModal(addFriendModal);
    input?.focus();
  });

  closeBtn?.addEventListener("click", () => {
    hideModal(addFriendModal);
    if (input) input.value = "";
  });

  sendBtn?.addEventListener("click", async () => {
    const friendId = input?.value.trim();
    if (!friendId) {
      showToast("يرجى إدخال معرف المستخدم", "warning");
      return;
    }

    try {
      await sendFriendRequest(friendId);
      if (input) input.value = "";
      hideModal(addFriendModal);
    } catch (e) {
      showToast("فشل في إرسال طلب الصداقة", "error");
    }
  });
}

function setupTrainingGuideModal() {
  const trainingGuideBtn = document.getElementById("openTrainingGuideBtn");
  const trainingGuideModal = document.getElementById("trainingGuideModal");
  const closeBtn = document.getElementById("closeTrainingGuideBtn");
  const startTutorialBtn = document.getElementById("startTutorialBtn");

  trainingGuideBtn?.addEventListener("click", () => {
    showModal(trainingGuideModal);
  });

  closeBtn?.addEventListener("click", () => {
    hideModal(trainingGuideModal);
  });

  startTutorialBtn?.addEventListener("click", () => {
    hideModal(trainingGuideModal);
    startTutorial(); // This should now work properly
  });
}

function setupJoinRoomModal() {
  const joinRoomBtn = document.getElementById("openJoinRoomModalBtn");
  const joinRoomModal = document.getElementById("joinRoomModal");
  const closeBtn = document.getElementById("closeJoinRoomModalBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const input = document.getElementById("roomCodeInput");

  joinRoomBtn?.addEventListener("click", () => {
    showModal(joinRoomModal);
    input?.focus();
  });

  closeBtn?.addEventListener("click", () => {
    hideModal(joinRoomModal);
    if (input) input.value = "";
  });

  joinBtn?.addEventListener("click", async () => {
    const roomCode = input?.value.trim();
    if (!roomCode) {
      showToast("يرجى إدخال رمز الغرفة", "warning");
      return;
    }

    try {
      window.location.href = `room.html?id=${roomCode}`;
    } catch (e) {
      showToast("فشل في الانضمام إلى الغرفة", "error");
    }
  });

  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      joinBtn?.click();
    }
  });
}

// Modal utilities
function showModal(modal) {
  if (!modal) return;
  modal.classList.remove("opacity-0", "pointer-events-none");
  const content = modal.querySelector(".bg-white\\/10");
  if (content) {
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  }
}

function hideModal(modal) {
  if (!modal) return;
  modal.classList.add("opacity-0", "pointer-events-none");
  const content = modal.querySelector(".bg-white\\/10");
  if (content) {
    content.classList.add("scale-95");
    content.classList.remove("scale-100");
  }
}

function toggleNotification(id) {
  const notifications = [
    "friend-request-notification",
    "room-invite-notification",
    "friends-list",
  ];

  notifications.forEach((notificationId) => {
    if (notificationId !== id) {
      document.getElementById(notificationId)?.classList.add("hidden");
    }
  });

  const target = document.getElementById(id);
  if (target) target.classList.toggle("hidden");
}

// Toast notification system
document.addEventListener("showToast", (e) =>
  showToast(e.detail.message, e.detail.type)
);

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform translate-x-full transition-transform duration-300`;

  const bgColor =
    {
      warning: "bg-yellow-500",
      success: "bg-green-500",
      error: "bg-red-500",
      info: "bg-blue-500",
    }[type] || "bg-blue-500";

  toast.classList.add(bgColor, "text-white");

  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>
      <span class="text-sm font-medium">${message}</span>
    </div>
  `;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.remove("translate-x-full"), 100);

  // Animate out and remove
  setTimeout(() => {
    toast.classList.add("translate-x-full");
    setTimeout(
      () => document.body.contains(toast) && document.body.removeChild(toast),
      300
    );
  }, 3000);
}

// Image error fallback
window.handleImageError = function (img) {
  img.src = "img.svg";
  img.onerror = null;
};
