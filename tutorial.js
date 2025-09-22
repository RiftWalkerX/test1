// Tutorial steps configuration
const tutorialSteps = [
  {
    elementId: "userProfileImage",
    title: "ملفك الشخصي",
    description: "هنا يمكنك رؤية صورتك الشخصية واسمك.",
    position: "bottom",
  },
  {
    elementId: "settingsBtn",
    title: "قائمة الإعدادات",
    description: "اضغط هنا للوصول إلى الملف الشخصي، لوحة المتصدرين، أو تسجيل الخروج.",
    position: "bottom",
  },
  {
    elementId: "openTrainingGuideBtn",
    title: "دليل التدريب",
    description: "ابدأ الدليل التدريبي لتعلم كيفية استخدام المنصة.",
    position: "right",
  },
  {
    elementId: "addFriendBtn",
    title: "إضافة صديق",
    description: "أضف أصدقاء جدد للتدريب معهم.",
    position: "right",
  },
  {
    elementId: "openJoinRoomModalBtn",
    title: "الانضمام إلى غرفة",
    description: "انضم إلى غرف التدريب الجماعي باستخدام رمز الغرفة.",
    position: "right",
  },
  {
    elementId: "roadmapContainer",
    title: "خريطة التدريب",
    description: "استكشف المستويات التدريبية وتابع تقدمك هنا.",
    position: "top",
  },
];

// Tutorial state
let currentStep = 0;

// Initialize tutorial event listeners
function initializeTutorial() {
  // Event listeners for tutorial navigation
  document.getElementById("tutorialPrev").addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      showTutorialStep(currentStep);
    }
  });

  document.getElementById("tutorialNext").addEventListener("click", () => {
    if (currentStep < tutorialSteps.length - 1) {
      currentStep++;
      showTutorialStep(currentStep);
    } else {
      endTutorial();
    }
  });

  document.getElementById("tutorialSkip").addEventListener("click", endTutorial);
}

// Start the tutorial
export function startTutorial() {
  currentStep = 0;
  const overlay = document.getElementById("tutorialOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    showTutorialStep(currentStep);
  } else {
    console.error("Tutorial overlay not found");
    showToast("خطأ في تحميل الدليل التدريبي", "error");
  }
}

// Show a specific tutorial step
function showTutorialStep(stepIndex) {
  const step = tutorialSteps[stepIndex];
  const element = document.getElementById(step.elementId);

  if (!element) {
    console.warn(`Element ${step.elementId} not found, skipping step.`);
    if (stepIndex < tutorialSteps.length - 1) {
      currentStep++;
      showTutorialStep(currentStep);
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

  // Update content
  stepNumber.textContent = stepIndex + 1;
  title.textContent = step.title;
  description.textContent = step.description;

  // Position highlight
  const rect = element.getBoundingClientRect();
  highlight.style.width = `${rect.width + 16}px`;
  highlight.style.height = `${rect.height + 16}px`;
  highlight.style.top = `${rect.top + window.scrollY - 8}px`;
  highlight.style.left = `${rect.left + window.scrollX - 8}px`;

  // Position content box based on step.position
  const contentWidth = content.offsetWidth;
  const contentHeight = content.offsetHeight;
  let contentTop, contentLeft;

  switch (step.position) {
    case "top":
      contentTop = rect.top + window.scrollY - contentHeight - 16;
      contentLeft = rect.left + window.scrollX + (rect.width - contentWidth) / 2;
      break;
    case "bottom":
      contentTop = rect.bottom + window.scrollY + 16;
      contentLeft = rect.left + window.scrollX + (rect.width - contentWidth) / 2;
      break;
    case "right":
      contentTop = rect.top + window.scrollY + (rect.height - contentHeight) / 2;
      contentLeft = rect.right + window.scrollX + 16;
      break;
    case "left":
      contentTop = rect.top + window.scrollY + (rect.height - contentHeight) / 2;
      contentLeft = rect.left + window.scrollX - contentWidth - 16;
      break;
    default:
      contentTop = rect.bottom + window.scrollY + 16;
      contentLeft = rect.left + window.scrollX + (rect.width - contentWidth) / 2;
  }

  // Ensure content box stays within viewport
  contentTop = Math.max(16, Math.min(contentTop, window.innerHeight + window.scrollY - contentHeight - 16));
  contentLeft = Math.max(16, Math.min(contentLeft, window.innerWidth + window.scrollX - contentWidth - 16));

  content.style.top = `${contentTop}px`;
  content.style.left = `${contentLeft}px`;

  // Update navigation buttons
  document.getElementById("tutorialPrev").disabled = stepIndex === 0;
  document.getElementById("tutorialNext").textContent = stepIndex === tutorialSteps.length - 1 ? "إنهاء" : "التالي";
}

// End the tutorial
function endTutorial() {
  const overlay = document.getElementById("tutorialOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }
  currentStep = 0;
}

// Show toast notification
function showToast(message, type = "info") {
  const toast = document.createElement("div");
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
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize tutorial event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", initializeTutorial);
