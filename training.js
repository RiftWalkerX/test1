import { auth, db } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Show toast notification via custom event
function showToast(message, type = "info") {
  document.dispatchEvent(
    new CustomEvent("showToast", { detail: { message, type } })
  );
}

// --- Handle level click: show modal with level info and start/cancel buttons ---
export function handleLevelClick(level) {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  getDoc(userRef).then((userDoc) => {
    const completedLevels = userDoc.exists()
      ? userDoc.data().completedLevels || []
      : [];
    const levelData = getLevelData(level, completedLevels);
    if (!levelData) return;
    if (levelData.status === "locked") {
      showToast("هذا المستوى مقفل. أكمل المستويات السابقة أولاً.", "warning");
      return;
    }
    // Fill modal
    const modalIcon = document.getElementById("modalIcon");
    const modalTitle = document.getElementById("modalTitle");
    const modalDescription = document.getElementById("modalDescription");
    const startLevelBtn = document.getElementById("startLevelBtn");
    if (modalIcon && modalTitle && modalDescription && startLevelBtn) {
      modalIcon.className = `w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${levelData.bgClass}`;
      modalIcon.innerHTML = levelData.icon;
      modalTitle.textContent = levelData.title;
      modalDescription.textContent = levelData.description;
      startLevelBtn.textContent =
        levelData.status === "completed" ? "إعادة المستوى" : "بدء المستوى";
      startLevelBtn.dataset.level = level;
      showModal(document.getElementById("levelModal"));
    }
    // Modal action: start level
    document.getElementById("startLevelBtn").onclick = () =>
      window.startTrainingLevel(level);
    document.getElementById("closeModalBtn").onclick = () =>
      hideModal(document.getElementById("levelModal"));
  });
}

// --- Get Level Data (simulate loading from JSON for now) ---
export function getLevelData(level, completedLevels) {
  // Level config (simulate JSON)
  const levelData = {
    1: {
      title: "الأساسيات",
      description: "تعلم أساسيات اكتشاف الاحتيال والتصيد الإلكتروني",
      icon: '<svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>',
      bgClass: "bg-gradient-to-r from-green-500 to-emerald-600",
    },
    2: {
      title: "رسائل SMS",
      description: "تعرف على كيفية اكتشاف رسائل SMS المشبوهة والاحتيالية",
      icon: '<svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path></svg>',
      bgClass: "bg-gradient-to-r from-green-500 to-emerald-600",
    },
    3: {
      title: "المحادثات",
      description: "تدرب على اكتشاف المحادثات الاحتيالية والتلاعب النفسي",
      icon: '<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>',
      bgClass: "bg-gradient-to-r from-blue-500 to-purple-600",
    },
    4: {
      title: "الصور المشبوهة",
      description: "تعلم كيفية تحليل الصور المزيفة والمعدلة",
      icon: '<svg class="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>',
      bgClass: "bg-gray-600",
    },
    // ...extend for more levels if needed...
  };
  const data = levelData[level];
  if (!data) return null;

  // Status logic
  if (completedLevels.includes(level)) {
    data.status = "completed";
  } else if (level === 1 || completedLevels.includes(level - 1)) {
    data.status = "current";
  } else {
    data.status = "locked";
  }

  return data;
}

// --- Start Level (redirect to training interface, only if unlocked) ---
window.startTrainingLevel = async function (level) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const completedLevels = userDoc.data().completedLevels || [];
      if (level > 1 && !completedLevels.includes(level - 1)) {
        showToast("يجب عليك إكمال المستوى السابق أولاً.", "warning");
        return;
      }
      window.location.href = `training_level_interface.html?level=${level}`;
    }
  } catch (error) {
    showToast("فشل في بدء المستوى: " + error.message, "error");
  }
};

// --- Complete a training level ---
export const completeTrainingLevel = async function (level, score, timeSpent) {
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
        }, 2000);
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

// --- Update Levels based on user progress ---
export async function updateLevelsStatus(completedLevels = []) {
  // Determine current level (next level after last completed)
  const currentLevel =
    completedLevels.length > 0 ? Math.max(...completedLevels) + 1 : 1;

  // Update each level node
  for (let levelNumber = 1; levelNumber <= 20; levelNumber++) {
    const levelNode = document.querySelector(
      `.level-node[data-level="${levelNumber}"]`
    );
    if (!levelNode) continue;

    const isCompleted = completedLevels.includes(levelNumber);
    const isCurrent = levelNumber === currentLevel;
    const isLocked = levelNumber > currentLevel;

    // Remove all status classes
    levelNode.classList.remove("completed", "current", "locked");

    // Add the correct status class
    if (isCompleted) {
      levelNode.classList.add("completed");
    } else if (isCurrent) {
      levelNode.classList.add("current");
    } else {
      levelNode.classList.add("locked");
    }

    // Update the visual appearance based on status
    const iconContainer = levelNode.querySelector(".w-16.h-16");
    const statusText = levelNode.querySelector(".text-xs");

    if (iconContainer && statusText) {
      if (isCompleted) {
        // Completed level - green checkmark
        iconContainer.className =
          "w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg border-4 border-green-400 cursor-pointer hover:scale-110 transition-all duration-300";
        iconContainer.innerHTML = `
          <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
        `;
        // statusText.className = "text-xs text-green-300";
        // statusText.textContent = "مكتمل";

        // Remove frog avatar if it exists
        const frogAvatar = levelNode.querySelector(".absolute.-top-8");
        if (frogAvatar) {
          frogAvatar.remove();
        }
      } else if (isCurrent) {
        // Current level - blue with frog
        iconContainer.className =
          "w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg border-4 border-blue-400 cursor-pointer hover:scale-110 transition-all duration-300 animate-pulse";
        iconContainer.innerHTML = `
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L极3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        `;
        // statusText.className = "text-xs text-blue-300";
        // statusText.textContent = "متاح الآن";

        // Add frog avatar
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
      }
      else {
        // Locked level - gray
        iconContainer.className =
          "w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center shadow-lg border-4 border-gray-500 opacity-50";
        iconContainer.innerHTML = `
          <svg class="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7极V7a3 3 0 616 极0z" clip-rule="evenodd"/>
          </svg>
        `;
        // statusText.className = "text-xs text-gray-500";
        // statusText.textContent = "مقفل";

        // Remove frog avatar if it exists
        const frogAvatar = levelNode.querySelector(".absolute.-top-8");
        if (frogAvatar) {
          frogAvatar.remove();
        }
      }
    }
  }
}

// --- Modal helpers ---
function showModal(modal) {
  if (!modal) return;
  modal.classList.remove("opacity-0", "pointer-events-none");
  const modalContent = modal.querySelector(".bg-white\\/10");
  if (modalContent) {
    modalContent.classList.remove("scale-95");
    modalContent.classList.add("scale-100");
  }
}

function hideModal(modal) {
  if (!modal) return;
  modal.classList.add("opacity-0", "pointer-events-none");
  const modalContent = modal.querySelector(".bg-white\\/10");
  if (modalContent) {
    modalContent.classList.add("scale-95");
    modalContent.classList.remove("scale-100");
  }
}
