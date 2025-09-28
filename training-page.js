// training-page.js
import { auth, db } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===========================
   Small utilities & polyfills
   =========================== */
if (!Set.prototype.difference) {
  Set.prototype.difference = function (otherSet) {
    const diff = new Set(this);
    for (const elem of otherSet) {
      diff.delete(elem);
    }
    return diff;
  };
}

function showToast(message, type = "info") {
  document.dispatchEvent(
    new CustomEvent("showToast", { detail: { message, type } })
  );
}

/* ===========================
   Level generation (fetch + mapping)
   =========================== */
async function generateLevels() {
  try {
    const now = Date.now();
    const [smsRes, dialogueRes, imageRes] = await Promise.all([
      fetch(`./sms-quiz.json?v=${now}`),
      fetch(`./dialogues.json?v=${now}`),
      fetch(`./image.json?v=${now}`),
    ]);

    if (!smsRes.ok || !dialogueRes.ok || !imageRes.ok) {
      throw new Error("Failed to fetch JSON files");
    }

    const sms = await smsRes.json();
    const dialogues = await dialogueRes.json();
    const images = await imageRes.json();

    function mapSms(s) {
      return {
        id: s.id ?? null,
        type: "sms",
        content: s.text ?? s.content ?? "",
        sender: s.sender ?? "جهة مجهولة",
        timestamp: s.timestamp ?? "الآن",
        correctAnswer: s.isPhish ? "phishing" : "safe",
        explanation: s.explanation ?? "",
      };
    }
    function mapDialogue(d) {
      return {
        id: d.id ?? null,
        type: "dialogue",
        messages: (d.messages ?? []).map((m) => ({
          text: m.text ?? "",
          sender: m.sender === "you" ? "user" : m.sender ?? "other",
          isPhishing: !!m.isPhish,
        })),
        explanation:
          d.explanation ??
          (d.isPhish ? "المحادثة تحتوي على رسائل احتيالية." : "المحادثة آمنة."),
      };
    }
    function mapImage(i) {
      return {
        id: i.id ?? null,
        type: "image",
        imageUrl: i.text ?? i.imageUrl ?? "",
        description: i.title ?? i.description ?? "",
        correctAnswer: i.isPhish ? "phishing" : "safe",
        explanation: i.explanation ?? "",
      };
    }

    const mappedSms = sms.map(mapSms);
    const mappedDialogues = dialogues.map(mapDialogue);
    const mappedImages = images.map(mapImage);

    function assignHardness(item) {
      let hardness = 1;
      const phishKeywords = [
        "urgent",
        "prize",
        "login",
        "password",
        "verify",
        "win",
        "free",
        "كسبت",
        "مبروك",
        "جايزة",
        "ادخل",
        "بياناتك",
        "رابط",
        "تحديث",
      ];
      let contentText = "";

      if (item.type === "dialogue") {
        contentText = item.messages.map((m) => m.text).join(" ");
        hardness += Math.min(3, Math.floor((item.messages?.length || 0) / 2));
      } else if (item.type === "sms") {
        contentText = item.content || "";
      } else if (item.type === "image") {
        contentText = `${item.description} ${item.explanation || ""}`;
        hardness += 1;
      }

      phishKeywords.forEach((kw) => {
        if (contentText.toLowerCase().includes(kw.toLowerCase())) hardness += 1;
      });

      return Math.max(1, Math.min(5, Math.floor(hardness)));
    }

    const allScenarios = [...mappedSms, ...mappedDialogues, ...mappedImages];

    const levels = {};
    for (let i = 1; i <= 20; i++) levels[i] = [];

    const imageScenarios = allScenarios.filter((s) => s.type === "image");
    imageScenarios.forEach((img, idx) => {
      const levelNum = Math.min(
        20,
        Math.floor((idx * 20) / Math.max(1, imageScenarios.length)) + 1
      );
      levels[levelNum].push(img);
    });

    const nonImages = allScenarios.filter((s) => s.type !== "image");
    nonImages.forEach((scenario, idx) => {
      const levelNum = Math.min(20, Math.floor(idx / 4) + 1);
      let placed = false;
      for (let i = levelNum; i <= 20 && !placed; i++) {
        if (levels[i].length < 5) {
          levels[i].push(scenario);
          placed = true;
        }
      }
      if (!placed) {
        for (let i = 1; i <= 20 && !placed; i++) {
          if (levels[i].length < 8) {
            levels[i].push(scenario);
            placed = true;
          }
        }
      }
    });

    for (let i = 1; i <= 20; i++) {
      if (levels[i].length === 0) {
        levels[i].push({
          type: "sms",
          content: "رسالة افتراضية: تحقق من رابط غريب قبل النقر.",
          sender: "جهة مجهولة",
          timestamp: "الآن",
          correctAnswer: "phishing",
          explanation: "مثال افتراضي.",
        });
      }
      levels[i].sort(() => Math.random() - 0.5);
    }

    try {
      localStorage.setItem("levelsData", JSON.stringify(levels));
    } catch (e) {
      console.warn("Unable to cache levelsData:", e);
    }

    window.levelsData = levels;
    console.log("Levels generated and cached.");
  } catch (err) {
    console.error("Error generating levels:", err);
    showToast(`فشل تحميل الأسئلة: ${err.message}`, "error");

    const cached = localStorage.getItem("levelsData");
    if (cached) {
      try {
        window.levelsData = JSON.parse(cached);
        console.log("Loaded levelsData from cache.");
        return;
      } catch (e) {
        console.warn("Failed to parse cached levelsData:", e);
      }
    }

    window.levelsData = {
      1: [
        {
          type: "sms",
          content:
            "مرحباً! لقد ربحت جائزة، انقر هنا للمطالبة بها: https://fake.com",
          sender: "جهة مجهولة",
          timestamp: "الآن",
          correctAnswer: "phishing",
          explanation:
            "الرسائل التي تحتوي على روابط مشبوهة غالباً ما تكون محاولات احتيال.",
        },
      ],
    };
  }
}

/* ===========================
   Training Level Interface
   =========================== */
class TrainingLevelInterface {
  constructor() {
    this.currentQuestion = 0;
    this.totalQuestions = 10;
    this.correctAnswers = 0;
    this.currentPoints = 250;
    this.currentStreak = 0;
    this.levelMultiplier = 1;
    this.passThreshold = 0.7;
    this.questions = [];
    this.currentLevel =
      parseInt(new URLSearchParams(window.location.search).get("level")) || 1;

    this.init();
  }

  async init() {
    await generateLevels();
    await this.fetchQuestions();
    this.bindEvents();
    await this.updateLevelInfo();
    await this.loadUserStats();
    this.loadQuestion();
    this.updateProgress();
  }

  async fetchQuestions() {
    try {
      if (window.levelsData && window.levelsData[this.currentLevel]) {
        this.questions = window.levelsData[this.currentLevel];
        this.totalQuestions = this.questions.length;
      } else {
        throw new Error(`No data for level ${this.currentLevel}`);
      }
    } catch (err) {
      console.error("fetchQuestions error:", err);
      showToast("فشل في تحميل الأسئلة، سيتم استخدام سؤال افتراضي.", "error");
      this.questions = [
        {
          type: "sms",
          content:
            "مرحباً! لقد ربحت جائزة، انقر هنا للمطالبة بها: https://fake.com",
          sender: "جهة مجهولة",
          timestamp: "الآن",
          correctAnswer: "phishing",
          explanation:
            "الرسائل التي تحتوي على روابط مشبوهة غالباً ما تكون محاولات احتيال.",
        },
      ];
      this.totalQuestions = this.questions.length;
    }
  }

  async updateLevelInfo() {
    const levelMetadata = {
      1: { title: "الأساسيات", description: "أساسيات اكتشاف الاحتيال" },
      2: { title: "رسائل SMS", description: "اكتشاف الرسائل النصية المزيفة" },
      3: { title: "المحادثات", description: "تحديد المحادثات المشبوهة" },
      4: {
        title: "الصور المشبوهة",
        description: "تحليل الصور المحتملة الاحتيال",
      },
    };
    const levelInfo = levelMetadata[this.currentLevel] || {
      title: `المستوى ${this.currentLevel}`,
      description: "وصف المستوى",
    };

    const levelNumberEl = document.getElementById("levelNumber");
    const levelTitleEl = document.getElementById("levelTitle");
    const levelDescriptionEl = document.getElementById("levelDescription");
    if (levelNumberEl) levelNumberEl.textContent = this.currentLevel;
    if (levelTitleEl) levelTitleEl.textContent = levelInfo.title;
    if (levelDescriptionEl)
      levelDescriptionEl.textContent = levelInfo.description;
  }

  async loadUserStats() {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        this.currentPoints = userData.stats?.totalPoints ?? 250;
        this.currentStreak = userData.stats?.streak ?? 0;
        const pointsEl = document.getElementById("userPoints");
        const streakEl = document.getElementById("userStreak");
        if (pointsEl) pointsEl.textContent = this.currentPoints;
        if (streakEl) streakEl.textContent = this.currentStreak;
      }
    } catch (err) {
      console.error("loadUserStats error:", err);
    }
  }

  bindEvents() {
    document.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const answer = e.currentTarget.getAttribute("data-answer");
        this.handleAnswer(answer);
      });
    });

    const submitDialogueBtn = document.getElementById("submitDialogue");
    submitDialogueBtn?.addEventListener("click", () =>
      this.handleDialogueAnswer()
    );

    const continueBtn = document.getElementById("continueBtn");
    continueBtn?.addEventListener("click", () => {
      this.closeFeedbackModal();
      this.nextQuestion();
    });

    const nextLevelBtn = document.getElementById("nextLevelBtn");
    nextLevelBtn?.addEventListener("click", () => {
      if ((nextLevelBtn.textContent || "").includes("إعادة")) {
        window.location.reload();
      } else {
        window.location.href = `training-page.html?level=${
          this.currentLevel + 1
        }`;
      }
    });

    const backBtn = document.getElementById("backToDashboard");
    backBtn?.addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) return;
      if (
        target.classList &&
        target.classList.contains("fixed") &&
        target.classList.contains("inset-0")
      ) {
        const modal = target;
        modal.classList.add("opacity-0", "pointer-events-none");
        const content = modal.querySelector(".bg-white, .bg-white\\/10");
        if (content) {
          content.classList.add("scale-95");
          content.classList.remove("scale-100");
        }
      }
    });
  }

  loadQuestion() {
    const smsPane = document.getElementById("smsQuestion");
    const dialoguePane = document.getElementById("dialogueQuestion");
    const imagePane = document.getElementById("imageQuestion");
    smsPane?.classList.add("hidden");
    dialoguePane?.classList.add("hidden");
    imagePane?.classList.add("hidden");

    if (this.currentQuestion >= this.questions.length) {
      this.completeLevel();
      return;
    }

    const q = this.questions[this.currentQuestion];

    if (q.type === "sms" && smsPane) {
      smsPane.classList.remove("hidden");
      const contentEl = document.getElementById("smsContent");
      const senderEl = document.getElementById("smsSender");
      const tsEl = document.getElementById("smsTimestamp");
      if (contentEl) contentEl.textContent = q.content || "";
      if (senderEl) senderEl.textContent = q.sender || "جهة مجهولة";
      if (tsEl) tsEl.textContent = q.timestamp || "الآن";
    } else if (q.type === "dialogue" && dialoguePane) {
      dialoguePane.classList.remove("hidden");
      const messagesContainer = document.getElementById("dialogueMessages");
      if (messagesContainer) {
        messagesContainer.innerHTML = "";
        q.messages.forEach((message, index) => {
          const wrapper = document.createElement("div");
          wrapper.className = `flex items-start gap-3 ${
            message.sender === "user" ? "justify-end" : ""
          }`;
          wrapper.innerHTML = `
            <div class="flex items-start gap-3 ${
              message.sender === "user" ? "flex-row-reverse" : ""
            }">
              <div class="w-8 h-8 ${
                message.sender === "user" ? "bg-blue-500" : "bg-gray-500"
              } rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <div class="flex-1 max-w-xs">
                <div class="bg-white/10 rounded-lg p-3 mb-2">
                  <p class="text-white text-sm">${this.escapeHtml(
                    message.text
                  )}</p>
                </div>
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="msg_${index}" class="w-4 h-4 text-red-500 bg-white/10 border-white/20 rounded focus:ring-red-400 focus:ring-2" data-is-phishing="${
            message.isPhishing
          }">
                  <label for="msg_${index}" class="text-xs text-white/60">محاولة احتيال</label>
                </div>
              </div>
            </div>
          `;
          messagesContainer.appendChild(wrapper);
        });
      }
    } else if (q.type === "image" && imagePane) {
      imagePane.classList.remove("hidden");
      const imgEl = document.getElementById("questionImage");
      const descEl = document.getElementById("imageDescription");
      if (imgEl && q.imageUrl) imgEl.src = q.imageUrl;
      if (descEl) descEl.textContent = q.description || "";
    }
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async handleAnswer(answer) {
    const q = this.questions[this.currentQuestion];
    const isCorrect = !!q && answer === q.correctAnswer;

    if (isCorrect) {
      this.correctAnswers++;
      this.currentPoints += 50 * this.levelMultiplier;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    await this.updateUserStats();
    this.showFeedback(isCorrect, q?.explanation ?? "");
  }

  async handleDialogueAnswer() {
    const q = this.questions[this.currentQuestion];
    if (!q) return;
    const checkboxes = document.querySelectorAll(
      "#dialogueMessages input[type='checkbox']"
    );
    let correctSelections = 0;
    q.messages.forEach((message, index) => {
      const isPhishing = !!message.isPhishing;
      const isChecked = !!(checkboxes[index] && checkboxes[index].checked);
      if ((isPhishing && isChecked) || (!isPhishing && !isChecked))
        correctSelections++;
    });

    const isCorrect = correctSelections === q.messages.length;
    if (isCorrect) {
      this.correctAnswers++;
      this.currentPoints += 50 * this.levelMultiplier;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    await this.updateUserStats();
    this.showFeedback(isCorrect, q.explanation ?? "");
  }

  showFeedback(isCorrect, explanation) {
    const modal = document.getElementById("feedbackModal");
    if (!modal) return;
    const icon = document.getElementById("feedbackIcon");
    const title = document.getElementById("feedbackTitle");
    const message = document.getElementById("feedbackMessage");
    const explanationEl = document
      .getElementById("feedbackExplanation")
      ?.querySelector("p");
    const pointsEarned = document.getElementById("pointsEarned");
    const currentScore = document.getElementById("currentScore");

    if (icon) {
      if (isCorrect) {
        icon.className =
          "w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4";
        icon.innerHTML = `
          <svg class="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
          </svg>
        `;
      } else {
        icon.className =
          "w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4";
        icon.innerHTML = `
          <svg class="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        `;
      }
    }

    if (title) title.textContent = isCorrect ? "عظيم!" : "خطأ!";
    if (message)
      message.textContent = isCorrect
        ? "إجابة صحيحة! لقد تعرفت بنجاح على محاولة الاحتيال."
        : "إجابة خاطئة. التعلم من الأخطاء جزء من العملية.";
    if (explanationEl) explanationEl.textContent = explanation || "";
    if (pointsEarned)
      pointsEarned.textContent = isCorrect
        ? `+${50 * this.levelMultiplier}`
        : "+0";
    if (currentScore)
      currentScore.textContent = `${this.correctAnswers}/${
        this.currentQuestion + 1
      }`;

    modal.classList.remove("opacity-0", "pointer-events-none");
    const content = modal.querySelector(".bg-white, .bg-white\\/10");
    if (content) {
      content.classList.remove("scale-95");
      content.classList.add("scale-100");
    }
  }

  closeFeedbackModal() {
    const modal = document.getElementById("feedbackModal");
    if (!modal) return;
    modal.classList.add("opacity-0", "pointer-events-none");
    const content = modal.querySelector(".bg-white, .bg-white\\/10");
    if (content) {
      content.classList.add("scale-95");
      content.classList.remove("scale-100");
    }
  }

  nextQuestion() {
    this.currentQuestion++;
    this.updateProgress();
    if (this.currentQuestion >= this.totalQuestions) {
      this.completeLevel();
    } else {
      this.loadQuestion();
    }
  }

  async updateUserStats() {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        "stats.totalPoints": this.currentPoints,
        "stats.streak": this.currentStreak,
      });
      const pointsEl = document.getElementById("userPoints");
      const streakEl = document.getElementById("userStreak");
      if (pointsEl) pointsEl.textContent = this.currentPoints;
      if (streakEl) streakEl.textContent = this.currentStreak;
    } catch (err) {
      console.error("updateUserStats error:", err);
    }
  }

  updateProgress() {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const progress =
      (this.currentQuestion / Math.max(1, this.totalQuestions)) * 100;
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressText)
      progressText.textContent = `${this.currentQuestion} من ${this.totalQuestions}`;
  }

  async completeLevel() {
    const successRate = this.correctAnswers / Math.max(1, this.totalQuestions);
    const passed = successRate >= this.passThreshold;

    const modal = document.getElementById("levelCompleteModal");
    const finalScore = document.getElementById("finalScore");
    const totalPointsEarned = document.getElementById("totalPointsEarned");
    const nextLevelBtn = document.getElementById("nextLevelBtn");

    if (finalScore)
      finalScore.textContent = `${this.correctAnswers}/${this.totalQuestions}`;
    if (totalPointsEarned)
      totalPointsEarned.textContent = `${this.currentPoints - 250}`;

    if (passed && auth.currentUser) {
      try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          completedLevels: arrayUnion(this.currentLevel),
          currentLevel: this.currentLevel + 1,
          "stats.totalPoints": this.currentPoints,
        });
        showToast(`مبروك! أكملت المستوى ${this.currentLevel}.`, "success");
      } catch (err) {
        console.error("completeLevel updateDoc error:", err);
        showToast("فشل حفظ نتيجة المستوى.", "error");
      }
    } else if (!passed) {
      if (nextLevelBtn) nextLevelBtn.textContent = "إعادة المحاولة";
      showToast("لم تستوفِ الحد المطلوب، حاول مرة أخرى.", "warning");
    }

    if (modal) {
      modal.classList.remove("opacity-0", "pointer-events-none");
      const content = modal.querySelector(".bg-white, .bg-white\\/10");
      if (content) {
        content.classList.remove("scale-95");
        content.classList.add("scale-100");
      }
    }
  }
}

/* ===========================
   Start the interface
   =========================== */
document.addEventListener("DOMContentLoaded", () => {
  new TrainingLevelInterface();
});
