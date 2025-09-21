import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateLevelsStatus } from "./training.js";
export async function loadProfileData() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    // Get user document
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);

    // If user document doesn't exist, create it
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        displayName: user.displayName || "مستخدم",
        email: user.email,
        photoURL: user.photoURL || "img.svg",
        completedLevels: [],
        stats: {
          totalPoints: 0,
          lastCompletedLevel: 0,
          lastCompletionTime: null,
        },
        streak: 0,
        lastLoginDate: new Date(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });

      // Get fresh document
      userDoc = await getDoc(userRef);
    }

    const userData = userDoc.data();

    // Update profile images
    const profileImages = document.querySelectorAll("#userProfileImage");
    const photoURL = user.photoURL || userData.photoURL || "img.svg";

    profileImages.forEach((img) => {
      img.src = photoURL;
      img.onerror = () => {
        img.src = "img.svg";
        img.onerror = null;
      };
    });

    // Update display name in header
    const displayNameElements = document.querySelectorAll("#userDisplayName");
    const displayName = user.displayName || userData.displayName || "مستخدم";

    displayNameElements.forEach((el) => {
      el.textContent = displayName;
    });

    // Update display name in main content (the empty h3 element)
    const mainDisplayName = document.querySelector(
      ".text-center.mb-6 .text-lg.font-bold.text-white"
    );
    if (mainDisplayName) {
      mainDisplayName.textContent = displayName;
    }

    // Update stats
    const stats = userData.stats || { totalPoints: 0 };
    const streak = userData.streak || 0;
    const completedLevels = userData.completedLevels || [];
    if (typeof updateLevelsStatus === "function") {
      await updateLevelsStatus(completedLevels);
    }
    // Total points
    const pointsElement = document.querySelector(
      ".text-2xl.font-bold.text-yellow-400"
    );
    if (pointsElement) {
      pointsElement.textContent = stats.totalPoints;
    }

    // Streak
    const streakElement = document.querySelector(
      ".text-2xl.font-bold.text-orange-400"
    );
    if (streakElement) {
      streakElement.textContent = `${streak}🔥`;
    }

    // Completed levels
    const progressElement = document.querySelector(
      ".text-2xl.font-bold.text-green-400"
    );
    if (progressElement) {
      progressElement.textContent = `${completedLevels.length}/20`;
    }

    // Progress bar
    const progressPercent = (completedLevels.length / 20) * 100;

    const progressBar = document.querySelector(
      ".bg-gradient-to-r.from-blue-500.to-purple-600"
    );
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    const progressText = document.querySelector(
      ".flex.items-center.justify-between.mb-2 .text-sm.text-blue-200"
    );
    if (progressText) {
      progressText.textContent = `${Math.round(progressPercent)}%`;
    }
  } catch (error) {
    console.error("Error loading profile data:", error);
    // Show error toast
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "فشل في تحميل بيانات الملف الشخصي",
          type: "error",
        },
      })
    );
  }
}

// Profile form submission handler
window.updateProfile = async function () {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const displayName = document.getElementById("displayName").value.trim();
    const email = document.getElementById("email").value.trim();
    const timezone = document.getElementById("timezone").value;

    const userRef = doc(db, "users", user.uid);

    await updateDoc(userRef, {
      displayName,
      email,
      timezone,
      updatedAt: new Date(),
    });

    // Update auth profile
    await user.updateProfile({ displayName });
    if (email !== user.email) {
      await user.updateEmail(email);
    }

    // Refresh profile data
    await loadProfileData();

    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "تم تحديث الملف الشخصي بنجاح!",
          type: "success",
        },
      })
    );
  } catch (error) {
    console.error("Error updating profile:", error);
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "فشل في تحديث الملف الشخصي: " + error.message,
          type: "error",
        },
      })
    );
  }
};

// Set up profile functionality
document.addEventListener("DOMContentLoaded", function () {
  const profileForm = document.getElementById("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      window.updateProfile();
    });
  }

  // Load profile when profile section opened
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", loadProfileData);
  }
});

// Image error handler
window.handleImageError = function (img) {
  img.src = "img.svg";
  img.onerror = null;
};
