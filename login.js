import { auth, db } from "./firebase-init.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
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

/* ------------------ Security Config ------------------ */
const SECURITY_CONFIG = {
  maxLoginAttempts: 5,
  lockoutTime: 15 * 60 * 1000, // 15 minutes
  passwordMinLength: 8,
  loginAttempts: new Map(), // In-memory storage (in production, use Redis/Firestore)
};

/* ------------------ Password Strength Validation ------------------ */
function validatePasswordStrength(password) {
  const requirements = {
    minLength: password.length >= SECURITY_CONFIG.passwordMinLength,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  return {
    isValid: Object.values(requirements).every(Boolean),
    requirements,
    score: Object.values(requirements).filter(Boolean).length,
  };
}

/* ------------------ Rate Limiting ------------------ */
function checkRateLimit(email) {
  const now = Date.now();
  const attemptData = SECURITY_CONFIG.loginAttempts.get(email);

  if (attemptData) {
    if (attemptData.lockedUntil > now) {
      const remainingTime = Math.ceil(
        (attemptData.lockedUntil - now) / 1000 / 60
      );
      throw new Error(
        `حسابك مؤقتاً مغلق due to too many failed attempts. Try again in ${remainingTime} minutes.`
      );
    }

    if (attemptData.count >= SECURITY_CONFIG.maxLoginAttempts) {
      attemptData.lockedUntil = now + SECURITY_CONFIG.lockoutTime;
      SECURITY_CONFIG.loginAttempts.set(email, attemptData);
      throw new Error(
        `Too many failed attempts. Account locked for 15 minutes.`
      );
    }
  }
}

function recordFailedAttempt(email) {
  const now = Date.now();
  const attemptData = SECURITY_CONFIG.loginAttempts.get(email) || {
    count: 0,
    lockedUntil: 0,
    lastAttempt: 0,
  };

  attemptData.count++;
  attemptData.lastAttempt = now;

  // Reset counter if last attempt was more than 1 hour ago
  if (now - attemptData.lastAttempt > 60 * 60 * 1000) {
    attemptData.count = 1;
  }

  SECURITY_CONFIG.loginAttempts.set(email, attemptData);
  return attemptData.count;
}

function clearLoginAttempts(email) {
  SECURITY_CONFIG.loginAttempts.delete(email);
}

/* ------------------ Input Validation & Sanitization ------------------ */
function sanitizeInput(input) {
  return input.trim().replace(/[<>]/g, "");
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function sanitizeName(name) {
  return name
    .replace(/[<>{}[\]]/g, "")
    .trim()
    .substring(0, 50);
}

/* ------------------ Error Handling ------------------ */
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

/* ------------------ Email Verification ------------------ */
async function sendVerificationEmail(user) {
  try {
    await sendEmailVerification(user);
    showSuccess(
      "تم إرسال رابط التحقق إلى بريدك الإلكتروني. يرجى التحقق قبل تسجيل الدخول."
    );
  } catch (error) {
    console.error("Failed to send verification email:", error);
    showError("email", "فشل إرسال رابط التحقق. يرجى المحاولة لاحقاً.");
  }
}

function checkEmailVerification(user) {
  if (!user.emailVerified) {
    showSuccess(
      "يجب التحقق من بريدك الإلكتروني قبل تسجيل الدخول. تم إرسال رابط التحقق مرة أخرى."
    );
    sendVerificationEmail(user);
    return false;
  }
  return true;
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

    const displayName = sanitizeName(
      document.getElementById("fullName")?.value || ""
    );
    const email = sanitizeInput(document.getElementById("email")?.value || "");
    const password = document.getElementById("password")?.value || "";
    const confirmPassword =
      document.getElementById("confirmPassword")?.value || "";

    // Input validation
    if (!displayName || displayName.length < 2) {
      showError("fullName", "الاسم الكامل مطلوب (على الأقل حرفين)");
      return;
    }

    if (!isValidEmail(email)) {
      showError("email", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    // Password validation
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      const requirements = passwordValidation.requirements;
      let errorMsg = "كلمة المرور يجب أن تحتوي على:";
      if (!requirements.minLength)
        errorMsg += `\n• ${SECURITY_CONFIG.passwordMinLength} أحرف على الأقل`;
      if (!requirements.hasUpperCase) errorMsg += "\n• حرف كبير واحد على الأقل";
      if (!requirements.hasLowerCase) errorMsg += "\n• حرف صغير واحد على الأقل";
      if (!requirements.hasNumbers) errorMsg += "\n• رقم واحد على الأقل";
      if (!requirements.hasSpecialChar)
        errorMsg += "\n• رمز خاص واحد على الأقل";
      showError("password", errorMsg);
      return;
    }

    if (password !== confirmPassword) {
      showError("confirmPassword", "كلمات المرور غير متطابقة");
      return;
    }

    // Create user account
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Update profile with sanitized name
    try {
      await updateProfile(user, { displayName });
    } catch (e) {
      console.warn("Could not set display name:", e);
    }

    // Send verification email
    await sendVerificationEmail(user);

    // Create user document in Firestore
    const userRef = doc(db, "users", user.uid);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    await setDoc(userRef, {
      uid: user.uid,
      displayName,
      email,
      emailVerified: false,
      photoURL: user.photoURL || null,
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
      security: {
        loginAttempts: 0,
        lastFailedAttempt: null,
        accountLockedUntil: null,
      },
    });

    showSuccess(
      "تم إنشاء الحساب بنجاح! يرجى التحقق من بريدك الإلكتروني لتتمكن من تسجيل الدخول."
    );
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === "auth/email-already-in-use") {
      showError("email", "هذا البريد مستخدم بالفعل. جرب تسجيل الدخول.");
    } else if (error.code === "auth/weak-password") {
      showError(
        "password",
        "كلمة المرور ضعيفة جداً. يرجى استخدام كلمة مرور أقوى."
      );
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

    const email = sanitizeInput(document.getElementById("email")?.value || "");
    const password = document.getElementById("password")?.value || "";
    const rememberMe = document.getElementById("rememberMe")?.checked;

    // Input validation
    if (!isValidEmail(email)) {
      showError("email", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    if (!password) {
      showError("password", "كلمة المرور مطلوبة");
      return;
    }

    // Rate limiting check
    try {
      checkRateLimit(email);
    } catch (rateLimitError) {
      showError("email", rateLimitError.message);
      return;
    }

    // Set persistence
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );

    // Attempt login
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Check email verification
    if (!checkEmailVerification(user)) {
      await auth.signOut(); // Sign out if not verified
      return;
    }

    // Clear failed attempts on successful login
    clearLoginAttempts(email);

    // Update user document
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        lastLoginDate: serverTimestamp(),
        "security.loginAttempts": 0,
        "security.lastFailedAttempt": null,
        "security.accountLockedUntil": null,
      });
    } catch (err) {
      console.warn("Could not update user document:", err);
    }

    // Redirect to dashboard
    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error("Login error:", error);

    // Record failed attempt
    const email = sanitizeInput(document.getElementById("email")?.value || "");
    if (email) {
      const attempts = recordFailedAttempt(email);
      const remainingAttempts = SECURITY_CONFIG.maxLoginAttempts - attempts;

      if (remainingAttempts > 0) {
        showError(
          "password",
          `كلمة المرور غير صحيحة. لديك ${remainingAttempts} محاولات متبقية.`
        );
      } else {
        showError(
          "email",
          `تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. الحساب مغلق لمدة 15 دقيقة.`
        );
      }
    }

    // Firebase specific errors
    if (error.code === "auth/invalid-email") {
      showError("email", "البريد الإلكتروني غير صالح.");
    } else if (error.code === "auth/user-not-found") {
      showError("email", "لا يوجد حساب بهذا البريد. يرجى التسجيل.");
    } else if (error.code === "auth/wrong-password") {
      // Error message handled by rate limiting above
    } else if (error.code === "auth/too-many-requests") {
      showError(
        "email",
        "تم إيقاف الوصول مؤقتاً due to too many failed attempts. Please try again later."
      );
    }
  } finally {
    stopLoading();
  }
}

/* ------------------ Social Sign-In ------------------ */
async function googleSignIn() {
  try {
    startLoading();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleSocialSignIn(result.user);
  } catch (error) {
    console.error("Google sign-in error:", error);
    if (error.code === "auth/account-exists-with-different-credential") {
      showError(
        "email",
        "هذا البريد الإلكتروني مسجل بالفعل بطريقة مختلفة. يرجى استخدام طريقة التسجيل الأصلية."
      );
    } else {
      showError(
        "email",
        "فشل تسجيل الدخول عبر جوجل: " + (error.message || error)
      );
    }
  } finally {
    stopLoading();
  }
}

async function facebookSignIn() {
  try {
    startLoading();
    const provider = new FacebookAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleSocialSignIn(result.user);
  } catch (error) {
    console.error("Facebook sign-in error:", error);
    if (error.code === "auth/account-exists-with-different-credential") {
      showError(
        "email",
        "هذا البريد الإلكتروني مسجل بالفعل بطريقة مختلفة. يرجى استخدام طريقة التسجيل الأصلية."
      );
    } else {
      showError(
        "email",
        "فشل تسجيل الدخول عبر فيسبوك: " + (error.message || error)
      );
    }
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
      displayName: sanitizeName(user.displayName || "User"),
      email: user.email || null,
      emailVerified: user.emailVerified || false,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      lastLoginDate: serverTimestamp(),
      lastPracticeDate: null,
      practiceHistory: [],
      streak: 0,
      stats: { totalPoints: 0, quizzesTaken: 0 },
      timezone,
      security: {
        loginAttempts: 0,
        lastFailedAttempt: null,
        accountLockedUntil: null,
      },
    });
  } else {
    try {
      await updateDoc(userRef, {
        lastLoginDate: serverTimestamp(),
        emailVerified: user.emailVerified || snap.data().emailVerified,
      });
    } catch (err) {
      console.warn("Could not update user document:", err);
    }
  }

  window.location.href = "./dashboard.html";
}

/* ------------------ Forgot Password ------------------ */
async function forgotPassword() {
  try {
    const email = sanitizeInput(
      document.getElementById("forgotEmail")?.value || ""
    );

    if (!isValidEmail(email)) {
      showError("forgotEmail", "يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    await sendPasswordResetEmail(auth, email);
    showSuccess("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.");

    setTimeout(() => {
      document.getElementById("forgotModal").classList.add("hidden");
      hideSuccess();
    }, 5000);
  } catch (error) {
    console.error("Forgot password error:", error);
    if (error.code === "auth/user-not-found") {
      showError("forgotEmail", "لا يوجد حساب مرتبط بهذا البريد الإلكتروني.");
    } else if (error.code === "auth/too-many-requests") {
      showError("forgotEmail", "طلبات كثيرة جداً. يرجى المحاولة لاحقاً.");
    } else {
      showError("forgotEmail", "فشل إرسال الرابط: " + (error.message || error));
    }
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
        errorDiv.className =
          "text-red-400 text-sm mt-1 hidden whitespace-pre-line";
        inputContainer.appendChild(errorDiv);
      }
    }
  );

  // Password visibility toggle
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

  // Real-time password strength indicator
  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      const password = passwordInput.value;
      if (password.length > 0) {
        const validation = validatePasswordStrength(password);
        const errorElem = document.getElementById("password-error");

        if (!validation.isValid && errorElem) {
          let strengthMsg = "قوة كلمة المرور: ";
          if (validation.score <= 2) strengthMsg += "ضعيفة";
          else if (validation.score <= 4) strengthMsg += "متوسطة";
          else strengthMsg += "قوية";

          errorElem.textContent = strengthMsg;
          errorElem.classList.remove("hidden");
        }
      }
    });
  }

  // Mode switch between login/register
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

      // Clear all errors and inputs
      hideError("fullName");
      hideError("email");
      hideError("password");
      hideError("confirmPassword");
      hideSuccess();

      ["fullName", "email", "password", "confirmPassword"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
          input.value = "";
          hideError(id);
        }
      });
    });
  }

  // Form submission
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

  // Social login buttons
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

  // Forgot password modal
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

  // Clear errors on input
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
