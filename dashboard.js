// dashboard.js - Consolidated version with training and room invitation handling
import { auth, db } from "./firebase-init.js";
import { loadFriendRequests, sendFriendRequest } from "./friends.js";
import { loadRoomInvites, setupRoomInviteListener } from "./room-invites.js";
import { checkDailyStreak } from "./streak.js";
import { loadProfileData } from "./profile.js";
import { startTutorial, endTutorial, isTutorialActive } from "./tutorial.js";
import { showLobbyModal } from "./room-system.js";
import {
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Toast notification system
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

// Event listener for toast notifications
document.addEventListener("showToast", (e) =>
  showToast(e.detail.message, e.detail.type)
);

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

// Handle room invitations from URL parameters
async function joinRoomFromInvitation(roomId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      showToast("يجب تسجيل الدخول أولاً", "error");
      return;
    }

    // Check if room exists and is waiting
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("الغرفة لم تعد موجودة", "error");
      return;
    }

    const roomData = roomDoc.data();

    if (roomData.status !== "waiting") {
      showToast("الغرفة لم تعد في حالة انتظار", "error");
      return;
    }

    // Check if user is already in the room
    const existingPlayer = roomData.players.find((p) => p.uid === user.uid);
    if (!existingPlayer) {
      // Add user to room if not already there
      const playerData = {
        uid: user.uid,
        displayName: user.displayName || "لاعب",
        isHost: false,
        isReady: false,
        score: 0,
        joinedAt: new Date().toISOString(),
      };

      await updateDoc(roomRef, {
        players: arrayUnion(playerData),
      });

      // Add to players subcollection
      await setDoc(doc(db, `rooms/${roomId}/players`, user.uid), {
        ...playerData,
        joinedAt: serverTimestamp(),
      });
    }

    // Show lobby modal instead of going directly to room
    showLobbyModal(roomId, false);

    // Remove the parameter from URL
    window.history.replaceState({}, document.title, window.location.pathname);

    showToast("تم الانضمام إلى الغرفة بنجاح!", "success");
  } catch (error) {
    console.error("Error joining room from invitation:", error);
    showToast("فشل في الانضمام إلى الغرفة: " + error.message, "error");
  }
}

// --- Training Level Functions ---

// --- Handle level click: show modal with level info and start/cancel buttons ---
async function handleLevelClick(level) {
  const user = auth.currentUser;
  if (!user) {
    showToast("الرجاء تسجيل الدخول للمتابعة.", "warning");
    return;
  }

  const userRef = doc(db, "users", user.uid);
  try {
    const userDoc = await getDoc(userRef);
    const completedLevels = userDoc.exists()
      ? userDoc.data().completedLevels || []
      : [];
    
    const levelData = getLevelData(level, completedLevels);
    if (!levelData) {
      showToast("لا يوجد بيانات لهذا المستوى بعد.", "warning");
      return;
    }

    // Check if level is locked - show toast instead of modal
    if (levelData.status === "locked") {
      showToast("يجب عليك إكمال المستوى السابق أولاً.", "warning");
      return;
    }

    // Fill modal elements
    const modalIcon = document.getElementById("modalIcon");
    const modalTitle = document.getElementById("modalTitle");
    const modalDescription = document.getElementById("modalDescription");
    const startLevelBtn = document.getElementById("startLevelBtn");

    if (modalIcon && modalTitle && modalDescription && startLevelBtn) {
      // Get the actual level node from the container
      const levelNode = document.querySelector(`.level-node[data-level="${level}"]`);
      const levelIconContainer = levelNode?.querySelector('.w-16.h-16');
      const textContainer = levelNode?.querySelector('.text-center');
      
      // Sync the icon
      if (levelIconContainer) {
        modalIcon.innerHTML = levelIconContainer.innerHTML;
        modalIcon.className = levelIconContainer.className + ' mx-auto';
      } else {
        modalIcon.className = `w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${levelData.bgClass}`;
        modalIcon.innerHTML = levelData.icon;
      }
      
      // Sync the title from HTML (h3 element)
      const levelTitleEl = textContainer?.querySelector('h3');
      if (levelTitleEl) {
        modalTitle.textContent = levelTitleEl.textContent;
      } else {
        modalTitle.textContent = levelData.title;
      }
      
      // Sync the description from HTML (first p element after h3)
      const levelDescEl = textContainer?.querySelector('h3 + p');
      if (levelDescEl && levelDescEl.textContent.trim()) {
        modalDescription.textContent = levelDescEl.textContent;
      } else {
        modalDescription.textContent = levelData.description;
      }
      
      // Get the status text from HTML (last p element)
      const statusTextEl = textContainer?.querySelector('p:last-child');
      let statusText = "بدء المستوى";
      if (statusTextEl) {
        if (statusTextEl.textContent.includes("مكتمل")) {
          statusText = "إعادة المستوى";
        } else if (statusTextEl.textContent.includes("متاح الآن")) {
          statusText = "بدء المستوى";
        }
      }
      
      startLevelBtn.textContent = statusText;

      // ensure we remove previous handler to avoid stacking handlers
      startLevelBtn.replaceWith(startLevelBtn.cloneNode(true));
      const newStartBtn = document.getElementById("startLevelBtn");
      newStartBtn.addEventListener("click", () =>
        window.startTrainingLevel(level)
      );
    }

    // show modal
    showModal(document.getElementById("levelModal"));

    // close handler
    document.getElementById("closeModalBtn").onclick = () =>
      hideModal(document.getElementById("levelModal"));
  } catch (err) {
    console.error("handleLevelClick error:", err);
    showToast("حدث خطأ أثناء تحميل بيانات المستوى.", "error");
  }
}

// Get Level Data (supports 1..20)
function getLevelData(level, completedLevels = []) {
  // base known data for first levels
  const base = {
    1: {
      title: "الأساسيات",
      description: "تعلم أساسيات اكتشاف الاحتيال والتصيد الإلكتروني",
      icon: '<svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>',
      bgClass: "bg-gradient-to-r from-green-500 to-emerald-600",
    },
    2: {
      title: "رسائل SMS",
      description: "تعرف على كيفية اكتشاف رسائل SMS المشبوهة والاحتيالية",
      icon: '<svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>',
      bgClass: "bg-gradient-to-r from-green-500 to-emerald-600",
    },
    3: {
      title: "المحادثات",
      description: "تدرب على اكتشاف المحادثات الاحتيالية والتلاعب النفسي",
      icon: '<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
      bgClass: "bg-gradient-to-r from-blue-500 to-purple-600",
    },
    4: {
      title: "الصور المشبوهة",
      description: "تعلم كيفية تحليل الصور المزيفة والمعدلة",
      icon: '<svg class="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 0 1 6 0z" clip-rule="evenodd"/></svg>',
      bgClass: "bg-gray-600",
    },
  };

  // if base has it, use that
  if (base[level]) {
    const data = { ...base[level] };
    // determine status
    if (completedLevels.includes(level)) data.status = "completed";
    else if (level === 1 || completedLevels.includes(level - 1))
      data.status = "current";
    else data.status = "locked";
    return data;
  }

  // for levels beyond defined ones, generate defaults
  const defaultTitle = `المستوى ${level}`;
  const defaultDescription = "وصف المستوى وسيتم تحديثه لاحقًا.";
  const defaultIcon =
    '<svg class="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 0 1 6 0z" clip-rule="evenodd"/></svg>';
  const data = {
    title: defaultTitle,
    description: defaultDescription,
    icon: defaultIcon,
    bgClass: "bg-gray-600",
  };

  if (completedLevels.includes(level)) data.status = "completed";
  else if (level === 1 || completedLevels.includes(level - 1))
    data.status = "current";
  else data.status = "locked";

  return data;
}

// Start Level (redirect to training page, only if unlocked)
async function startTrainingLevel(level) {
  const user = auth.currentUser;
  if (!user) {
    showToast("الرجاء تسجيل الدخول للمتابعة.", "warning");
    return;
  }
  try {
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const completedLevels = userDoc.data().completedLevels || [];
      if (level > 1 && !completedLevels.includes(level - 1)) {
        showToast("يجب عليك إكمال المستوى السابق أولاً.", "warning");
        return;
      }
      // IMPORTANT: redirect to training-page.html to match your training-page.js
      window.location.href = `training-page.html?level=${level}`;
    } else {
      showToast("لم يتم العثور على بيانات المستخدم.", "error");
    }
  } catch (error) {
    showToast("فشل في بدء المستوى: " + error.message, "error");
  }
}

// Complete a training level
const completeTrainingLevel = async function (level, score, timeSpent) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const completedLevels = userData.completedLevels || [];
      const totalPoints = (userData.stats?.totalPoints || 0) + score;
      if (!completedLevels.includes(level)) {
        await updateDoc(userRef, {
          completedLevels: arrayUnion(level),
          "stats.totalPoints": totalPoints,
          "stats.lastCompletedLevel": level,
          "stats.lastCompletionTime": new Date(),
        });
        showToast(
          `مبروك! أكملت المستوى ${level} وحصلت على ${score} نقطة.`,
          "success"
        );
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        await updateDoc(userRef, { "stats.totalPoints": totalPoints });
        showToast(
          `أعدت إكمال المستوى ${level} وحصلت على ${score} نقطة.`,
          "info"
        );
      }
    }
  } catch (error) {
    showToast("فشل في حفظ نتائج المستوى: " + error.message, "error");
  }
};

// Update Levels based on user progress (current level shows star SVG)
async function updateLevelsStatus(completedLevels = []) {
  const currentLevel =
    completedLevels.length > 0 ? Math.max(...completedLevels) + 1 : 1;

  for (let levelNumber = 1; levelNumber <= 20; levelNumber++) {
    const levelNode = document.querySelector(
      `.level-node[data-level="${levelNumber}"]`
    );
    if (!levelNode) continue;

    const isCompleted = completedLevels.includes(levelNumber);
    const isCurrent = levelNumber === currentLevel;

    // Remove all status classes
    levelNode.classList.remove("completed", "current", "locked");
    if (isCompleted) levelNode.classList.add("completed");
    else if (isCurrent) levelNode.classList.add("current");
    else levelNode.classList.add("locked");

    // Update visuals (icon container)
    const iconContainer = levelNode.querySelector(".w-16.h-16");
    const textContainer = levelNode.querySelector(".text-center");
    const statusText = textContainer
      ? textContainer.querySelector("p:last-child")
      : null;

    // Find the number badge element
    const numberBadge = levelNode.querySelector(".absolute.-top-2.-right-2");

    if (!iconContainer || !statusText || !numberBadge) continue;

    if (isCompleted) {
      // Completed level - checkmark icon
      iconContainer.className =
        "w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg border-4 border-green-400 cursor-pointer hover:scale-110 transition-all duration-300";
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
      `;
      statusText.className = "text-xs text-green-300 mt-1";
      statusText.textContent = "مكتمل";

      // Update number badge for completed level
      numberBadge.className =
        "absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center";

      const frogAvatar = levelNode.querySelector(".absolute.-top-8");
      if (frogAvatar) frogAvatar.remove();
    } else if (isCurrent) {
      // Current level - star icon
      iconContainer.className =
        "w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg border-4 border-blue-400 cursor-pointer hover:scale-110 transition-all duration-300 animate-pulse";
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
      `;
      statusText.className = "text-xs text-blue-300 mt-1";
      statusText.textContent = "متاح الآن";

      // Update number badge for current level
      numberBadge.className =
        "absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center";

      if (!levelNode.querySelector(".absolute.-top-8")) {
        const frogAvatar = document.createElement("div");
        frogAvatar.className =
          "absolute -top-8 left-1/2 transform -translate-x-1/2 animate-bounce";
        frogAvatar.innerHTML = `
          <div class="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
            <span class="text-lg">🐸</span>
          </div>
        `;
        levelNode.querySelector(".relative").prepend(frogAvatar);
      }
    } else {
      // Locked level - lock icon
      iconContainer.className =
        "w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center shadow-lg border-4 border-gray-500 opacity-50";
      iconContainer.innerHTML = `
        <svg class="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 0 1 6 0z" clip-rule="evenodd"/>
        </svg>
      `;
      statusText.className = "text-xs text-gray-500 mt-1";
      statusText.textContent = "مقفل";

      // Update number badge for locked level
      numberBadge.className =
        "absolute -top-2 -right-2 w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center";

      const frogAvatar = levelNode.querySelector(".absolute.-top-8");
      if (frogAvatar) frogAvatar.remove();
    }
  }
}

// --- Dashboard Initialization ---

document.addEventListener("DOMContentLoaded", async function () {
  // If already signed in, load profile & update images immediately
  if (auth.currentUser) {
    try {
      await loadProfileData();
    } catch (e) {
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

    // Handle room invitations from URL parameters after auth is ready
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get("joinRoom");

    if (joinRoomId) {
      // Wait a bit for the page to load completely
      setTimeout(() => {
        joinRoomFromInvitation(joinRoomId);
      }, 1500);
    }
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
      if (node.classList.contains("locked")) {
        showToast("يجب عليك إكمال المستوى السابق أولاً.", "warning");
        return;
      }
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
    startTutorial();
  });
}

function setupJoinRoomModal() {
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const joinRoomModal = document.getElementById("joinRoomModal");
  const closeBtn = document.getElementById("closeJoinRoomBtn");
  const joinBtn = document.getElementById("joinRoomConfirmBtn");
  const input = document.getElementById("joinRoomIdInput");

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
      // Use the room invitation functionality
      await joinRoomFromInvitation(roomCode);
      hideModal(joinRoomModal);
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

// Image error fallback
window.handleImageError = function (img) {
  img.src = "img.svg";
  img.onerror = null;
};

// Export functions for use in other modules
window.joinRoomFromInvitation = joinRoomFromInvitation;
window.showModal = showModal;
window.hideModal = hideModal;
window.showToast = showToast;
window.startTrainingLevel = startTrainingLevel;
window.completeTrainingLevel = completeTrainingLevel;

// Export for training modules
export {
  handleLevelClick,
  getLevelData,
  completeTrainingLevel,
  updateLevelsStatus,
  showToast,
  showModal,
  hideModal,
};
