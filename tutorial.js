// Tutorial steps configuration - expanded with more elements
const tutorialSteps = [
  {
    elementSelector: "a[href='./user_profile.html']",
    title: "ملفك الشخصي",
    description:
      "هنا يمكنك رؤية صورتك الشخصية واسمك. انقر للوصول إلى صفحة ملفك الشخصي.",
    position: "bottom",
    highlightPadding: 12,
  },
  {
    elementSelector: "a[href='./leaderboard.html']",
    title: "لوحة المتصدرين",
    description: "شاهد ترتيبك بين المستخدمين الآخرين وتنافس مع أصدقائك.",
    position: "bottom",
    highlightPadding: 16,
  },
  {
    elementSelector:
      ".bg-white\\/10.backdrop-blur-lg.rounded-2xl.p-6.border.border-white\\/20",
    title: "إحصائياتك",
    description: "تابع تقدمك، نقاطك، وسلسلة إنجازاتك اليومية هنا.",
    position: "left",
    highlightPadding: 20,
  },
  {
    elementId: "createRoomBtn",
    title: "إنشاء غرفة",
    description: "أنشئ غرفة تدريب جماعية جديدة وادعُ أصدقاءك للانضمام.",
    position: "right",
    highlightPadding: 16,
  },

  {
    elementId: "joinRoomBtn",
    title: "الانضمام إلى غرفة",
    description:
      "انضم إلى غرف التدريب الجماعي باستخدام رمز الغرفة للتدريب مع الآخرين.",
    position: "right",
    highlightPadding: 16,
  },
  {
    elementId: "addFriendBtn",
    title: "إضافة صديق",
    description: "أضف أصدقاء جدد للتدريب معهم ومشاركة التحديات.",
    position: "right",
    highlightPadding: 16,
  },
  {
    elementId: "roadmapContainer",
    title: "خريطة التدريب",
    description:
      "استكشف المستويات التدريبية وتابع تقدمك هنا. المستويات الخضراء مكتملة، والزرقاء جارية، والرمادية مقفلة.",
    position: "top",
    highlightPadding: 24,
  },
];
// Tutorial state
let currentStep = 0;
let isTutorialActive = false;

// Get element by ID or selector
function getTutorialElement(step) {
  if (step.elementId) {
    return document.getElementById(step.elementId);
  } else if (step.elementSelector) {
    return document.querySelector(step.elementSelector);
  }
  return null;
}

// Initialize tutorial event listeners
function initializeTutorial() {
  // Event listeners for tutorial navigation
  const prevBtn = document.getElementById("tutorialPrev");
  const nextBtn = document.getElementById("tutorialNext");
  const skipBtn = document.getElementById("tutorialSkip");

  if (prevBtn) {
    prevBtn.addEventListener("click", goToPreviousStep);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", goToNextStep);
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", endTutorial);
  }

  // Close tutorial on overlay click (outside content)
  const overlay = document.getElementById("tutorialOverlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.id === "tutorialOverlay") {
        endTutorial();
      }
    });
  }

  // Keyboard navigation
  document.addEventListener("keydown", handleTutorialKeyboard);
}

// Start the tutorial
export function startTutorial() {
  currentStep = 0;
  isTutorialActive = true;

  // Close any open modals first
  const modals = document.querySelectorAll('[id$="Modal"]');
  modals.forEach((modal) => {
    if (!modal.classList.contains("opacity-0")) {
      modal.classList.add("opacity-0", "pointer-events-none");
    }
  });

  const overlay = document.getElementById("tutorialOverlay");
  if (overlay) {
    // Create a dimming overlay instead of using backdrop blur on the main overlay
    createDimmingOverlay();

    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // Prevent scrolling
    showTutorialStep(currentStep);

    // Track tutorial completion
    localStorage.setItem("tutorialCompleted", "true");
  } else {
    console.error("Tutorial overlay not found");
    showToast("خطأ في تحميل الدليل التدريبي", "error");
  }
}

// Create a dimming overlay that doesn't affect the highlighted element
function createDimmingOverlay() {
  // Remove existing dimming overlay
  const existingDim = document.getElementById("tutorialDimmingOverlay");
  if (existingDim) existingDim.remove();

  const dimmingOverlay = document.createElement("div");
  dimmingOverlay.id = "tutorialDimmingOverlay";
  dimmingOverlay.className = "fixed inset-0 bg-black/40 z-40";
  document.body.appendChild(dimmingOverlay);
}

// Remove dimming overlay
function removeDimmingOverlay() {
  const dimmingOverlay = document.getElementById("tutorialDimmingOverlay");
  if (dimmingOverlay) dimmingOverlay.remove();
}

// Show a specific tutorial step
function showTutorialStep(stepIndex) {
  if (!isTutorialActive) return;

  const step = tutorialSteps[stepIndex];
  const element = getTutorialElement(step);

  if (!element) {
    console.warn(`Tutorial element not found for step ${stepIndex}, skipping.`);
    if (stepIndex < tutorialSteps.length - 1) {
      currentStep++;
      setTimeout(() => showTutorialStep(currentStep), 100);
    } else {
      endTutorial();
    }
    return;
  }

  const highlight = document.getElementById("tutorialHighlight");
  const content = document.getElementById("tutorialContent");
  const stepNumber = document.getElementById("tutorialStepNumber");
  const title = document.getElementById("tutorialTitle");
  const description = document.getElementById("tutorialDescription");

  if (!highlight || !content) {
    console.error("Tutorial elements not found");
    return;
  }

  // Update content
  stepNumber.textContent = stepIndex + 1;
  title.textContent = step.title;
  description.textContent = step.description;

  // Make sure the element is visible and not covered by anything
  element.style.zIndex = "60"; // Higher than the dimming overlay
  element.style.position = "relative"; // Ensure z-index works

  // Scroll element into view if needed (more gentle scroll)
  const elementRect = element.getBoundingClientRect();
  const isElementVisible =
    elementRect.top >= 0 &&
    elementRect.left >= 0 &&
    elementRect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    elementRect.right <=
      (window.innerWidth || document.documentElement.clientWidth);

  if (!isElementVisible) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }

  // Wait a bit for any scrolling to complete
  setTimeout(() => {
    positionTutorialElements(element, highlight, content, step);
    updateNavigationButtons(stepIndex);
  }, 400);
}

function positionTutorialElements(element, highlight, content, step) {
  const rect = element.getBoundingClientRect();
  const padding = step.highlightPadding || 12;

  // Position highlight - make it very prominent
  highlight.style.width = `${rect.width + padding * 2}px`;
  highlight.style.height = `${rect.height + padding * 2}px`;
  highlight.style.top = `${rect.top + window.scrollY - padding}px`;
  highlight.style.left = `${rect.left + window.scrollX - padding}px`;
  highlight.style.border = "3px solid #facc15"; // Brighter yellow
  highlight.style.boxShadow =
    "0 0 0 9999px rgba(0, 0, 0, 0.3), 0 0 20px rgba(250, 204, 21, 0.8)";
  highlight.style.zIndex = "55";

  // Position content box with better logic
  positionContentBox(content, rect, step.position);
}

function positionContentBox(content, rect, position) {
  const contentWidth = content.offsetWidth;
  const contentHeight = content.offsetHeight;
  const viewportPadding = 20;
  const elementPadding = 10;

  let contentTop, contentLeft;

  switch (position) {
    case "top":
      contentTop = rect.top + window.scrollY - contentHeight - elementPadding;
      contentLeft =
        rect.left + window.scrollX + (rect.width - contentWidth) / 2;
      break;
    case "bottom":
      contentTop = rect.bottom + window.scrollY + elementPadding;
      contentLeft =
        rect.left + window.scrollX + (rect.width - contentWidth) / 2;
      break;
    case "right":
      contentTop =
        rect.top + window.scrollY + (rect.height - contentHeight) / 2;
      contentLeft = rect.right + window.scrollX + elementPadding;
      break;
    case "left":
      contentTop =
        rect.top + window.scrollY + (rect.height - contentHeight) / 2;
      contentLeft = rect.left + window.scrollX - contentWidth - elementPadding;
      break;
    default:
      contentTop = rect.bottom + window.scrollY + elementPadding;
      contentLeft =
        rect.left + window.scrollX + (rect.width - contentWidth) / 2;
  }

  // Ensure content box stays within viewport with better boundaries
  const maxTop = window.scrollY + viewportPadding;
  const maxBottom =
    window.scrollY + window.innerHeight - contentHeight - viewportPadding;
  const maxLeft = window.scrollX + viewportPadding;
  const maxRight =
    window.scrollX + window.innerWidth - contentWidth - viewportPadding;

  contentTop = Math.max(maxTop, Math.min(contentTop, maxBottom));
  contentLeft = Math.max(maxLeft, Math.min(contentLeft, maxRight));

  // Apply positioning with smooth transition
  content.style.top = `${contentTop}px`;
  content.style.left = `${contentLeft}px`;
  content.style.opacity = "1";
  content.style.transform = "scale(1)";
  content.style.zIndex = "60";
}

function updateNavigationButtons(stepIndex) {
  const prevBtn = document.getElementById("tutorialPrev");
  const nextBtn = document.getElementById("tutorialNext");

  if (prevBtn) {
    prevBtn.disabled = stepIndex === 0;
    prevBtn.classList.toggle("opacity-50", stepIndex === 0);
    prevBtn.classList.toggle("cursor-not-allowed", stepIndex === 0);
  }

  if (nextBtn) {
    nextBtn.textContent =
      stepIndex === tutorialSteps.length - 1 ? "إنهاء" : "التالي";
  }
}

function goToPreviousStep() {
  if (currentStep > 0) {
    currentStep--;
    showTutorialStep(currentStep);
  }
}

function goToNextStep() {
  if (currentStep < tutorialSteps.length - 1) {
    currentStep++;
    showTutorialStep(currentStep);
  } else {
    endTutorial();
    showToast("تهانينا! لقد أكملت الدليل التدريبي بنجاح 🎉", "success");
  }
}

function handleTutorialKeyboard(e) {
  if (!isTutorialActive) return;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      goToPreviousStep();
      break;
    case "ArrowRight":
    case " ":
      e.preventDefault();
      goToNextStep();
      break;
    case "Escape":
      e.preventDefault();
      endTutorial();
      break;
  }
}

// End the tutorial
export function endTutorial() {
  isTutorialActive = false;
  currentStep = 0;

  // Reset all element styles
  tutorialSteps.forEach((step) => {
    const element = getTutorialElement(step);
    if (element) {
      element.style.zIndex = "";
      element.style.position = "";
    }
  });

  const overlay = document.getElementById("tutorialOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }

  removeDimmingOverlay();
  document.body.style.overflow = ""; // Restore scrolling
}

// Check if user is new and show tutorial
export function checkFirstTimeUser() {
  const tutorialCompleted = localStorage.getItem("tutorialCompleted");
  const isFirstTime = !tutorialCompleted;

  if (isFirstTime) {
    // Show welcome message and offer tutorial after page loads
    setTimeout(() => {
      if (
        confirm("مرحباً بك في Zero Fake! هل تريد بدء جولة تعريفية بالمنصة؟")
      ) {
        startTutorial();
      } else {
        localStorage.setItem("tutorialCompleted", "true");
      }
    }, 1500);
  }
}

// Show toast notification
function showToast(message, type = "info") {
  // Remove existing toasts
  const existingToasts = document.querySelectorAll('[id^="tutorial-toast"]');
  existingToasts.forEach((toast) => toast.remove());

  const toast = document.createElement("div");
  toast.id = "tutorial-toast-" + Date.now();
  toast.className = `fixed bottom-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg text-white shadow-lg z-50 transition-all duration-300 animate-slide-up`;

  switch (type) {
    case "success":
      toast.classList.add("bg-green-500");
      break;
    case "error":
      toast.classList.add("bg-red-500");
      break;
    case "warning":
      toast.classList.add("bg-yellow-500");
      break;
    default:
      toast.classList.add("bg-blue-500");
  }

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// Initialize tutorial when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeTutorial();

  // Check if this is a first-time user (after a short delay)
  setTimeout(() => {
    checkFirstTimeUser();
  }, 1000);
});
