import { auth, db } from "./firebase-init.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ------------------ Helpers ------------------ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(inputId, message = "") {
  const errorElem = document.getElementById(`${inputId}-error`);
  const inputElem = document.getElementById(inputId);
  if (errorElem && inputElem) {
    errorElem.textContent = message;
    errorElem.classList.remove("hidden");
    inputElem.classList.add("border-red-500", "focus:ring-red-500");
  }
}

function hideError(inputId) {
  const errorElem = document.getElementById(`${inputId}-error`);
  const inputElem = document.getElementById(inputId);
  if (errorElem && inputElem) {
    errorElem.classList.add("hidden");
    inputElem.classList.remove("border-red-500", "focus:ring-red-500");
  }
}

function showSuccess(message = "") {
  const successElem = document.getElementById("successMessage");
  if (successElem) {
    successElem.textContent = message;
    successElem.classList.remove("hidden");
  }
}

function hideSuccess() {
  const successElem = document.getElementById("successMessage");
  if (successElem) {
    successElem.classList.add("hidden");
  }
}

function startLoading() {
  const submitText = document.getElementById("submitText");
  const spinner = document.getElementById("submitSpinner");
  const btn = document.getElementById("submitBtn");
  if (submitText) submitText.classList.add("hidden");
  if (spinner) spinner.classList.remove("hidden");
  if (btn) btn.disabled = true;
}

function stopLoading() {
  const submitText = document.getElementById("submitText");
  const spinner = document.getElementById("submitSpinner");
  const btn = document.getElementById("submitBtn");
  if (submitText) submitText.classList.remove("hidden");
  if (spinner) spinner.classList.add("hidden");
  if (btn) btn.disabled = false;
}

/* ------------------ Registration ------------------ */
async function register() {
  try {
    startLoading();
    hideError("fullName");
    hideError("email");
    hideError("password");
    hideError("confirmPassword");
    hideSuccess();

    const displayName = document.getElementById("fullName")?.value.trim() || "";
    const email = document.getElementById("email")?.value.trim() || "";
    const password = document.getElementById("password")?.value || "";
    const confirmPassword =
      document.getElementById("confirmPassword")?.value || "";

    if (!displayName) {
      showError("fullName", "الاسم الكامل مطلوب");
      return;
    }
    if (!isValidEmail(email)) {
      showError("email", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }
    if (!password || password.length < 6) {
      showError("password", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      showError("confirmPassword", "كلمات المرور غير متطابقة");
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    try {
      await updateProfile(userCredential.user, { displayName });
    } catch (e) {
      console.warn("Could not set display name:", e);
    }

    const userRef = doc(db, "users", userCredential.user.uid);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    await setDoc(userRef, {
      uid: userCredential.user.uid,
      displayName,
      email,
      photoURL: userCredential.user.photoURL || null,
      createdAt: serverTimestamp(),
      lastLoginDate: serverTimestamp(),
      lastPracticeDate: null,
      practiceHistory: [],
      streak: 0,
      stats: {
        totalPoints: 0,
        quizzesTaken: 0,
      },
      timezone,
    });

    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === "auth/email-already-in-use") {
      showError("email", "هذا البريد مستخدم بالفعل. جرب تسجيل الدخول.");
    } else {
      showError("email", "فشل التسجيل: " + (error.message || error));
    }
  } finally {
    stopLoading();
  }
}

/* ------------------ Email/password Login ------------------ */
async function login() {
  try {
    startLoading();
    hideError("email");
    hideError("password");
    hideSuccess();

    const email = document.getElementById("email")?.value.trim() || "";
    const password = document.getElementById("password")?.value || "";
    const rememberMe = document.getElementById("rememberMe")?.checked;

    if (!isValidEmail(email)) {
      showError("email", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }
    if (!password || password.length < 6) {
      showError("password", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    try {
      const userRef = doc(db, "users", userCredential.user.uid);
      await updateDoc(userRef, { lastLoginDate: serverTimestamp() });
    } catch (err) {
      console.warn("Could not update lastLoginDate:", err);
    }

    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error("Login error:", error);
    if (error.code === "auth/invalid-email") {
      showError("email", "البريد الإلكتروني غير صالح.");
    } else if (error.code === "auth/user-not-found") {
      showError("email", "لا يوجد حساب بهذا البريد. يرجى التسجيل.");
    } else if (error.code === "auth/wrong-password") {
      showError("password", "كلمة المرور غير صحيحة.");
    } else {
      showError(
        "email",
        "User not Found لا يوجد حساب بهذا البريد. يرجى التسجيل."
      );
    }
  } finally {
    stopLoading();
  }
}

/* ------------------ Google Sign-In ------------------ */
async function googleSignIn() {
  try {
    startLoading();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleSocialSignIn(result.user);
  } catch (error) {
    console.error("Google sign-in error:", error);
    showError(
      "email",
      "فشل تسجيل الدخول عبر جوجل: " + (error.message || error)
    );
  } finally {
    stopLoading();
  }
}

/* ------------------ Facebook Sign-In ------------------ */
async function facebookSignIn() {
  try {
    startLoading();
    const provider = new FacebookAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleSocialSignIn(result.user);
  } catch (error) {
    console.error("Facebook sign-in error:", error);
    showError(
      "email",
      "فشل تسجيل الدخول عبر فيسبوك: " + (error.message || error)
    );
  } finally {
    stopLoading();
  }
}

async function handleSocialSignIn(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || "User",
      email: user.email || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      lastLoginDate: serverTimestamp(),
      lastPracticeDate: null,
      practiceHistory: [],
      streak: 0,
      stats: { totalPoints: 0, quizzesTaken: 0 },
      timezone,
    });
  } else {
    try {
      await updateDoc(userRef, { lastLoginDate: serverTimestamp() });
    } catch (err) {
      console.warn("Could not update lastLoginDate:", err);
    }
  }

  window.location.href = "./dashboard.html";
}

/* ------------------ Forgot Password ------------------ */
async function forgotPassword() {
  try {
    const email = document.getElementById("forgotEmail")?.value.trim() || "";
    if (!isValidEmail(email)) {
      showError("forgotEmail", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }
    await sendPasswordResetEmail(auth, email);
    showSuccess("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.");
    setTimeout(() => {
      document.getElementById("forgotModal").classList.add("hidden");
      hideSuccess();
    }, 3000);
  } catch (error) {
    console.error("Forgot password error:", error);
    showError("forgotEmail", "فشل إرسال الرابط: " + (error.message || error));
  }
}

/* ------------------ DOM Loaded ------------------ */
window.addEventListener("DOMContentLoaded", () => {
  let isRegisterMode = false;

  const form = document.getElementById("authForm");
  const formContainer = document.getElementById("formContainer");
  const formTitle = document.getElementById("formTitle");
  const formSubtitle = document.getElementById("formSubtitle");
  const nameField = document.getElementById("nameField");
  const confirmPasswordField = document.getElementById("confirmPasswordField");
  const loginOptions = document.getElementById("loginOptions");
  const submitText = document.getElementById("submitText");
  const switchText = document.getElementById("switchText");
  const switchAction = document.getElementById("switchAction");
  const modeSwitch = document.getElementById("modeSwitch");
  const forgotBtn = document.getElementById("forgotPassword");
  const forgotModal = document.getElementById("forgotModal");
  const closeModal = document.getElementById("closeModal");
  const cancelModal = document.getElementById("cancelModal");
  const forgotForm = document.getElementById("forgotForm");
  const togglePassword = document.getElementById("togglePassword");
  const toggleConfirmPassword = document.getElementById(
    "toggleConfirmPassword"
  );
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  // Add error divs dynamically
  ["email", "password", "fullName", "confirmPassword", "forgotEmail"].forEach(
    (id) => {
      const inputContainer = document.getElementById(id)?.parentElement;
      if (inputContainer) {
        const errorDiv = document.createElement("div");
        errorDiv.id = `${id}-error`;
        errorDiv.className = "text-red-400 text-sm mt-1 hidden";
        inputContainer.appendChild(errorDiv);
      }
    }
  );

  // Toggle password visibility
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      togglePassword.querySelector("i").classList.toggle("fa-eye");
      togglePassword.querySelector("i").classList.toggle("fa-eye-slash");
    });
  }

  if (toggleConfirmPassword && confirmPasswordInput) {
    toggleConfirmPassword.addEventListener("click", () => {
      const type =
        confirmPasswordInput.type === "password" ? "text" : "password";
      confirmPasswordInput.type = type;
      toggleConfirmPassword.querySelector("i").classList.toggle("fa-eye");
      toggleConfirmPassword.querySelector("i").classList.toggle("fa-eye-slash");
    });
  }

  // Mode switch
  if (modeSwitch) {
    modeSwitch.addEventListener("click", () => {
      isRegisterMode = !isRegisterMode;
      if (isRegisterMode) {
        formContainer.classList.add("registration-mode");
        formTitle.textContent = "إنشاء حساب";
        formSubtitle.textContent = "انضم إلينا اليوم";
        nameField.classList.remove("field-hidden");
        confirmPasswordField.classList.remove("field-hidden");
        loginOptions.classList.add("field-hidden");
        submitText.textContent = "إنشاء الحساب";
        switchText.textContent = "لديك حساب بالفعل؟";
        switchAction.textContent = "تسجيل الدخول";
      } else {
        formContainer.classList.remove("registration-mode");
        formTitle.textContent = "تسجيل الدخول";
        formSubtitle.textContent = "مرحباً بك مرة أخرى";
        nameField.classList.add("field-hidden");
        confirmPasswordField.classList.add("field-hidden");
        loginOptions.classList.remove("field-hidden");
        submitText.textContent = "تسجيل الدخول";
        switchText.textContent = "ليس لديك حساب؟";
        switchAction.textContent = "إنشاء حساب";
      }
      hideError("fullName");
      hideError("email");
      hideError("password");
      hideError("confirmPassword");
      hideSuccess();
      [
        document.getElementById("fullName"),
        document.getElementById("email"),
        document.getElementById("password"),
        document.getElementById("confirmPassword"),
      ].forEach((input) => {
        if (input) {
          input.value = "";
          hideError(input.id);
        }
      });
    });
  }

  // Form submit
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (isRegisterMode) {
        register();
      } else {
        login();
      }
    });
  }

  // Social buttons
  const googleBtn = document.querySelector(
    'button img[alt="Google"]'
  )?.parentElement;
  if (googleBtn) {
    googleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      googleSignIn();
    });
  }

  const facebookBtn = document.querySelector(
    'button img[alt="Facebook"]'
  )?.parentElement;
  if (facebookBtn) {
    facebookBtn.addEventListener("click", (e) => {
      e.preventDefault();
      facebookSignIn();
    });
  }

  // Forgot password
  if (forgotBtn) {
    forgotBtn.addEventListener("click", () => {
      if (forgotModal) forgotModal.classList.remove("hidden");
    });
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => {
      if (forgotModal) forgotModal.classList.add("hidden");
      hideError("forgotEmail");
      hideSuccess();
    });
  }

  if (cancelModal) {
    cancelModal.addEventListener("click", () => {
      if (forgotModal) forgotModal.classList.add("hidden");
      hideError("forgotEmail");
      hideSuccess();
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", (e) => {
      e.preventDefault();
      forgotPassword();
    });
  }

  // Hide errors on input
  ["fullName", "email", "password", "confirmPassword", "forgotEmail"].forEach(
    (id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", () => {
          hideError(id);
        });
      }
    }
  );
});
