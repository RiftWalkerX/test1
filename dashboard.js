import { auth, db } from "./firebase-init.js";
import { loadFriendRequests, sendFriendRequest } from "./friends.js";
import { loadRoomInvites, setupRoomInviteListener } from "./room-invites.js";
import { checkDailyStreak } from "./streak.js";
import { loadProfileData } from "./profile.js";
import { updateLevelsStatus, handleLevelClick } from "./training.js";

// Dashboard initialization and event listeners
document.addEventListener("DOMContentLoaded", async function () {
  // Load initial profile data immediately if user is already authenticated
  if (auth.currentUser) {
    await loadProfileData();
  }

  // Auth state listener
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    await loadProfileData();
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
  // Level nodes
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
  const skipTutorialBtn = document.getElementById("skipTutorialBtn");
  const prevBtn = document.getElementById("prevTutorialBtn");
  const nextBtn = document.getElementById("nextTutorialBtn");

  let currentPage = 0;
  const totalPages = 8;

  // Tutorial content - in a real app, this would be loaded from a separate file or API
  const tutorialContent = [
    {
      title: "مرحبًا بك في دليل التدريب!",
      description:
        "سنساعدك في فهم كيفية استخدام منصة Zero Fake والاستفادة القصوى من ميزاتها.",
      image: "tutorial_welcome.png",
      content: `<div class="text-center">
        <div class="w-20 h-20 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h4 class="text-xl font-bold text-white mb-2">مرحبًا بك في دليل التدريب!</h4>
        <p class="text-blue-200">سنساعدك في فهم كيفية استخدام منصة Zero Fake والاستفادة القصوى من ميزاتها.</p>
      </div>`,
    },
    {
      title: "لوحة التحكم",
      description:
        "هذه هي لوحة التحكم الرئيسية حيث يمكنك رؤية إحصائياتك والتقدم في المستويات.",
      image: "dashboard_overview.png",
      content: `<div class="text-center">
        <img src="dashboard_screenshot.png" alt="لوحة التحكم" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">لوحة التحكم</h4>
        <p class="text-blue-200">هذه هي لوحة التحكم الرئيسية حيث يمكنك رؤية إحصائياتك والتقدم في المستويات.</p>
      </div>`,
    },
    {
      title: "خريطة التدريب",
      description:
        "هنا يمكنك رؤية جميع مستويات التدريب والتقدم الذي أحرزته فيها.",
      image: "training_map.png",
      content: `<div class="text-center">
        <img src="training_map_screenshot.png" alt="خريطة التدريب" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">خريطة التدريب</h4>
        <p class="text-blue-200">هنا يمكنك رؤية جميع مستويات التدريب والتقدم الذي أحرزته فيها.</p>
      </div>`,
    },
    {
      title: "النقاط والجوائز",
      description:
        "اكتسب النقاط من إكمال المستويات وحافظ على سلسلة الإنجازات اليومية.",
      image: "points_rewards.png",
      content: `<div class="text-center">
        <img src="points_screenshot.png" alt="النقاط والجوائز" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">النقاط والجوائز</h4>
        <p class="text-blue-200">اكتسب النقاط من إكمال المستويات وحافظ على سلسلة الإنجازات اليومية.</p>
      </div>`,
    },
    {
      title: "المستويات التدريبية",
      description:
        "كل مستوى يركز على نوع مختلف من التصيد والاحتيال الإلكتروني.",
      image: "training_levels.png",
      content: `<div class="text-center">
        <img src="levels_screenshot.png" alt="المستويات التدريبية" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">المستويات التدريبية</h4>
        <p class="text-blue-200">كل مستوى يركز على نوع مختلف من التصيد والاحتيال الإلكتروني.</p>
      </div>`,
    },
    {
      title: "التدريب الجماعي",
      description: "انضم إلى الغرف التدريبية مع أصدقائك لتتعلموا معًا.",
      image: "group_training.png",
      content: `<div class="text-center">
        <img src="group_training_screenshot.png" alt="التدريب الجماعي" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">التدريب الجماعي</h4>
        <p class="text-blue-200">انضم إلى الغرف التدريبية مع أصدقائك لتتعلموا معًا.</p>
      </div>`,
    },
    {
      title: "لوحة المتصدرين",
      description: "تابع ترتيبك بين المتدربين الآخرين وتنافس مع أصدقائك.",
      image: "leaderboard.png",
      content: `<div class="text-center">
        <img src="leaderboard_screenshot.png" alt="لوحة المتصدرين" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">لوحة المتصدرين</h4>
        <p class="text-blue-200">تابع ترتيبك بين المتدربين الآخرين وتنافس مع أصدقائك.</p>
      </div>`,
    },
    {
      title: "الملف الشخصي",
      description: "خصص ملفك الشخصي واطلع على إحصائياتك الكاملة.",
      image: "profile.png",
      content: `<div class="text-center">
        <img src="profile_screenshot.png" alt="الملف الشخصي" class="mx-auto mb-4 rounded-lg shadow-lg max-w-full h-48 object-cover">
        <h4 class="text-xl font-bold text-white mb-2">الملف الشخصي</h4>
        <p class="text-blue-200">خصص ملفك الشخصي واطلع على إحصائياتك الكاملة.</p>
      </div>`,
    },
  ];

  // Function to update tutorial content
  function updateTutorialContent() {
    const contentContainer = document.getElementById("tutorialContent");
    const progressText = document.getElementById("tutorialProgress");

    contentContainer.innerHTML = tutorialContent[currentPage].content;
    progressText.textContent = `الصفحة ${currentPage + 1} من ${totalPages}`;

    // Update button states
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage === totalPages - 1;

    // Change next button text on last page
    if (currentPage === totalPages - 1) {
      nextBtn.textContent = "إنهاء";
    } else {
      nextBtn.textContent = "التالي";
    }
  }

  trainingGuideBtn?.addEventListener("click", () => {
    currentPage = 0;
    updateTutorialContent();
    showModal(trainingGuideModal);
  });

  closeBtn?.addEventListener("click", () => {
    hideModal(trainingGuideModal);
  });

  startTutorialBtn?.addEventListener("click", () => {
    currentPage = 0;
    updateTutorialContent();
  });

  skipTutorialBtn?.addEventListener("click", () => {
    hideModal(trainingGuideModal);
  });

  prevBtn?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      updateTutorialContent();
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      updateTutorialContent();
    } else {
      hideModal(trainingGuideModal);
      // Redirect to full tutorial page
      window.location.href = "tutorial.html";
    }
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
      // Redirect to the room with the provided code
      window.location.href = `room.html?id=${roomCode}`;
    } catch (e) {
      showToast("فشل في الانضمام إلى الغرفة", "error");
    }
  });

  // Allow pressing Enter to submit the form
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
