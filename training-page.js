import { auth, db } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  getDoc,
  increment,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Utility to create Set.difference for older browsers
Set.prototype.difference = function (otherSet) {
  const diff = new Set(this);
  for (const elem of otherSet) {
    diff.delete(elem);
  }
  return diff;
};

async function generateLevels() {
  try {
    const [smsRes, dialogueRes, imageRes] = await Promise.all([
      fetch("https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=" + Date.now()),
      fetch("https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=" + Date.now()),
      fetch("https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=" + Date.now())
    ]);

    if (!smsRes.ok || !dialogueRes.ok || !imageRes.ok) {
      throw new Error("Failed to fetch JSON files");
    }

    const sms = await smsRes.json();
    const dialogues = await dialogueRes.json();
    const images = await imageRes.json();

    console.log("SMS parsed:", sms.length, "items");
    console.log("Dialogues parsed:", dialogues.length, "items");
    console.log("Images parsed:", images.length, "items");

    // Map JSON structure to match expected format
    const mappedSms = sms.map(s => ({
      type: "sms",
      content: s.text,
      sender: s.sender,
      timestamp: "الآن",
      correctAnswer: s.isPhish ? "phishing" : "safe",
      difficulty: assignHardness(s),
      explanation: s.explanation
    }));

    const mappedDialogues = dialogues.map(d => ({
      type: "dialogue",
      messages: d.messages.map(m => ({
        text: m.text,
        sender: m.sender === "you" ? "user" : m.sender,
        isPhishing: m.isPhish
      })),
      difficulty: assignHardness(d),
      explanation: d.explanation || (d.isPhish ? "المحادثة تحتوي على رسائل احتيالية." : "المحادثة آمنة.")
    }));

    const mappedImages = images.map(i => ({
      type: "image",
      imageUrl: i.text,
      description: i.title,
      correctAnswer: i.isPhish ? "phishing" : "safe",
      difficulty: assignHardness(i),
      explanation: i.explanation
    }));

    let allScenarios = [...mappedSms, ...mappedDialogues, ...mappedImages];
    console.log("Total scenarios:", allScenarios.length);

    function assignHardness(scenario) {
      let hardness = 1; // Base
      const phishKeywords = ['urgent', 'prize', 'login', 'password', 'verify', 'win', 'free', 'كسبت', 'مبروك', 'جايزة', 'ادخل', 'بياناتك', 'رابط', 'تحديث'];
      let content = '';
      if (scenario.type === 'dialogue') {
        content = scenario.messages ? scenario.messages.map(m => m.text).join(' ') : '';
        hardness += (scenario.messages?.length || 0) / 2;
      } else if (scenario.type === 'sms') {
        content = scenario.text || scenario.content || '';
      } else if (scenario.type === 'image') {
        content = (scenario.title || '') + ' ' + (scenario.explanation || '');
        hardness += 2;
      }

      phishKeywords.forEach(kw => {
        if (content.toLowerCase().includes(kw.toLowerCase())) hardness += 1;
      });

      return Math.min(5, Math.floor(hardness));
    }

    allScenarios.forEach((s) => {
      s.difficulty = assignHardness(s); // Ensure consistency
      console.log(`Scenario ${s.id || s.content?.slice(0, 10)} (${s.type}): Difficulty = ${s.difficulty}`);
    });

    allScenarios.sort((a, b) => a.difficulty - b.difficulty);

    const levels = {};
    for (let i = 1; i <= 20; i++) levels[i] = [];

    // Distribute images
    const imageScenarios = allScenarios.filter((s) => s.type === "image");
    imageScenarios.forEach((img, idx) => {
      const levelNum = Math.min(20, Math.floor((idx * 20) / imageScenarios.length) + 1);
      levels[levelNum].push(img);
    });

    // Distribute non-images
    let nonImageScenarios = allScenarios.filter((s) => s.type !== "image");
    nonImageScenarios.forEach((scenario, idx) => {
      const levelNum = Math.min(20, Math.floor(idx / 4) + 1);
      if (levelNum === 1 && levels[1].length < 5) {
        levels[1].push(scenario);
      } else if (levels[levelNum].length < 5) {
        levels[levelNum].push(scenario);
      } else {
        for (let i = levelNum + 1; i <= 20; i++) {
          if (levels[i].length < 5) {
            levels[i].push(scenario);
            break;
          }
        }
      }
    });

    // Balance types per level
    Object.keys(levels).forEach((key) => {
      const level = levels[key];
      const types = new Set(level.map(s => s.type));
      const missingTypes = new Set(['sms', 'dialogue', 'image']).difference(types);
      missingTypes.forEach((mt) => {
        const toAdd = nonImageScenarios.find(s => s.type === mt);
        if (toAdd) {
          level.push(toAdd);
          nonImageScenarios = nonImageScenarios.filter(s => s !== toAdd);
        }
      });
    });

    // Randomization within levels
    Object.keys(levels).forEach((key) => {
      levels[key].sort(() => Math.random() - 0.5);
    });

    // Debug: Log scenarios per level
    Object.keys(levels).forEach((key) => {
      console.log(
        `Level ${key}: ${levels[key].length} scenarios, Types: ${levels[key]
          .map((s) => s.type)
          .join(", ")}`
      );
    });

    // Cache in localStorage
    localStorage.setItem('levelsData', JSON.stringify(levels));

    window.levelsData = levels;
  } catch (error) {
    console.error("Error generating levels:", error);
    showToast(`فشل تحميل الأسئلة: ${error.message}`, "error");
    // Fallback to cached data
    const cached = localStorage.getItem('levelsData');
    if (cached) {
      window.levelsData = JSON.parse(cached);
    } else {
      // Fallback default question
      window.levelsData = {
        1: [{
          type: "sms",
          content: "مرحباً! لقد ربحت جائزة، انقر هنا للمطالبة بها: https://fake.com",
          sender: "جهة مجهولة",
          timestamp: "الآن",
          correctAnswer: "phishing",
          difficulty: 1,
          explanation: "الرسائل التي تحتوي على روابط مشبوهة غالباً ما تكون محاولات احتيال."
        }]
      };
    }
  }
}

class TrainingLevelInterface {
  constructor() {
    this.currentQuestion = 0;
    this.totalQuestions = 10;
    this.correctAnswers = 0;
    this.currentPoints = 250;
    this.currentStreak = 5;
    this.levelMultiplier = 1;
    this.passThreshold = 0.7;
    this.questions = [];
    this.currentLevel = parseInt(new URLSearchParams(window.location.search).get("level")) || 1;

    this.init();
  }

  async init() {
    await generateLevels(); // Generate levels first
    await this.fetchQuestions();
    await this.updateLevelInfo();
    await this.loadUserStats();
    this.bindEvents();
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
    } catch (error) {
      console.error("Error fetching questions:", error);
      this.showToast("فشل في تحميل الأسئلة، حاول مرة أخرى", "error");
      this.questions = [{
        type: "sms",
        content: "مرحباً! لقد ربحت جائزة، انقر هنا للمطالبة بها: https://fake.com",
        sender: "جهة مجهولة",
        timestamp: "الآن",
        correctAnswer: "phishing",
        difficulty: 1,
        explanation: "الرسائل التي تحتوي على روابط مشبوهة غالباً ما تكون محاولات احتيال."
      }];
      this.totalQuestions = 1;
    }
  }

  async updateLevelInfo() {
    const levelMetadata = {
      1: { title: "الأساسيات", description: "أساسيات اكتشاف الاحتيال" },
      2: { title: "رسائل SMS", description: "اكتشاف الرسائل النصية المزيفة" },
      3: { title: "المحادثات", description: "تحديد المحادثات المشبوهة" },
      // Add more as needed
    };
    const levelInfo = levelMetadata[this.currentLevel] || { title: `المستوى ${this.currentLevel}`, description: "وصف المستوى" };
    document.getElementById("levelNumber").textContent = this.currentLevel;
    document.getElementById("levelTitle").textContent = levelInfo.title;
    document.getElementById("levelDescription").textContent = levelInfo.description;
  }

  async loadUserStats() {
    if (!auth.currentUser) return;
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      this.currentPoints = userData.points || 250;
      this.currentStreak = userData.streak || 5;
      document.getElementById("userPoints").textContent = this.currentPoints;
      document.getElementById("userStreak").textContent = this.currentStreak;
    }
  }

  bindEvents() {
    document.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const answer = e.currentTarget.getAttribute("data-answer");
        this.handleAnswer(answer);
      });
    });

    document.getElementById("submitDialogue").addEventListener("click", () => {
      this.handleDialogueAnswer();
    });

    document.getElementById("continueBtn").addEventListener("click", () => {
      this.closeFeedbackModal();
      this.nextQuestion();
    });

    document.getElementById("nextLevelBtn").addEventListener("click", () => {
      window.location.href = `training-page.html?level=${this.currentLevel + 1}`;
    });

    document.getElementById("backToDashboard").addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });

    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("fixed") && e.target.classList.contains("inset-0")) {
        const modal = e.target;
        modal.classList.add("opacity-0", "pointer-events-none");
        modal.querySelector(".bg-white").classList.add("scale-95");
        modal.querySelector(".bg-white").classList.remove("scale-100");
      }
    });
  }

  loadQuestion() {
    document.getElementById("smsQuestion").classList.add("hidden");
    document.getElementById("dialogueQuestion").classList.add("hidden");
    document.getElementById("imageQuestion").classList.add("hidden");

    if (this.currentQuestion >= this.questions.length) {
      this.completeLevel();
      return;
    }

    const question = this.questions[this.currentQuestion];
    this.updateDifficultyIndicator(question.difficulty);

    switch (question.type) {
      case "sms":
        this.loadSMSQuestion(question);
        break;
      case "dialogue":
        this.loadDialogueQuestion(question);
        break;
      case "image":
        this.loadImageQuestion(question);
        break;
    }
  }

  loadSMSQuestion(question) {
    document.getElementById("smsQuestion").classList.remove("hidden");
    document.getElementById("smsContent").textContent = question.content;
    document.getElementById("smsSender").textContent = question.sender || "جهة مجهولة";
    document.getElementById("smsTimestamp").textContent = question.timestamp || "الآن";
  }

  loadDialogueQuestion(question) {
    document.getElementById("dialogueQuestion").classList.remove("hidden");
    const messagesContainer = document.getElementById("dialogueMessages");
    messagesContainer.innerHTML = "";

    question.messages.forEach((message, index) => {
      const messageDiv = document.createElement("div");
      messageDiv.className = `flex items-start gap-3 ${message.sender === "user" ? "justify-end" : ""}`;
      messageDiv.innerHTML = `
        <div class="flex items-start gap-3 ${message.sender === "user" ? "flex-row-reverse" : ""}">
          <div class="w-8 h-8 ${message.sender === "user" ? "bg-blue-500" : "bg-gray-500"} rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="flex-1 max-w-xs">
            <div class="bg-white/10 rounded-lg p-3 mb-2">
              <p class="text-white text-sm">${message.text}</p>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="msg_${index}" class="w-4 h-4 text-red-500 bg-white/10 border-white/20 rounded focus:ring-red-400 focus:ring-2" data-is-phishing="${message.isPhishing}">
              <label for="msg_${index}" class="text-xs text-white/60">محاولة احتيال</label>
            </div>
          </div>
        </div>
      `;
      messagesContainer.appendChild(messageDiv);
    });
  }

  loadImageQuestion(question) {
    document.getElementById("imageQuestion").classList.remove("hidden");
    document.getElementById("questionImage").src = question.imageUrl;
    document.getElementById("imageDescription").textContent = question.description;
  }

  async handleAnswer(answer) {
    const question = this.questions[this.currentQuestion];
    const isCorrect = answer === question.correctAnswer;

    if (isCorrect) {
      this.correctAnswers++;
      this.currentPoints += 50 * this.levelMultiplier;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    await this.updateUserStats();
    this.showFeedback(isCorrect, question.explanation);
  }

  async handleDialogueAnswer() {
    const question = this.questions[this.currentQuestion];
    const checkboxes = document.querySelectorAll("#dialogueMessages input[type='checkbox']");
    let correctSelections = 0;

    question.messages.forEach((message, index) => {
      const isPhishing = message.isPhishing;
      const isChecked = checkboxes[index].checked;
      if ((isPhishing && isChecked) || (!isPhishing && !isChecked)) {
        correctSelections++;
      }
    });

    const isCorrect = correctSelections === question.messages.length;

    if (isCorrect) {
      this.correctAnswers++;
      this.currentPoints += 50 * this.levelMultiplier;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    await this.updateUserStats();
    this.showFeedback(isCorrect, question.explanation);
  }

  showFeedback(isCorrect, explanation) {
    const modal = document.getElementById("feedbackModal");
    const icon = document.getElementById("feedbackIcon");
    const title = document.getElementById("feedbackTitle");
    const message = document.getElementById("feedbackMessage");
    const explanationEl = document.getElementById("feedbackExplanation").querySelector("p");
    const pointsEarned = document.getElementById("pointsEarned");
    const currentScore = document.getElementById("currentScore");

    if (isCorrect) {
      icon.className = "w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4";
      icon.innerHTML = `
        <svg class="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
        </svg>
      `;
      title.textContent = "عظيم!";
      message.textContent = "إجابة صحيحة! لقد تعرفت بنجاح على محاولة الاحتيال.";
      pointsEarned.textContent = `+${50 * this.levelMultiplier}`;
    } else {
      icon.className = "w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4";
      icon.innerHTML = `
        <svg class="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
        </svg>
      `;
      title.textContent = "خطأ!";
      message.textContent = "إجابة خاطئة. لا تقلق، التعلم من الأخطاء جزء من العملية.";
      pointsEarned.textContent = "+0";
    }

    explanationEl.textContent = explanation;
    currentScore.textContent = `${this.correctAnswers}/${this.currentQuestion + 1}`;

    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.querySelector(".bg-white").classList.remove("scale-95");
    modal.querySelector(".bg-white").classList.add("scale-100");
  }

  closeFeedbackModal() {
    const modal = document.getElementById("feedbackModal");
    modal.classList.add("opacity-0", "pointer-events-none");
    modal.querySelector(".bg-white").classList.add("scale-95");
    modal.querySelector(".bg-white").classList.remove("scale-100");
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
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      points: this.currentPoints,
      streak: this.currentStreak,
    });
    document.getElementById("userPoints").textContent = this.currentPoints;
    document.getElementById("userStreak").textContent = this.currentStreak;
  }

  updateProgress() {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const progress = (this.currentQuestion / this.totalQuestions) * 100;

    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${this.currentQuestion} من ${this.totalQuestions}`;
  }

  updateDifficultyIndicator(difficulty) {
    const stars = document.querySelectorAll("#difficultyStars svg");
    const labels = ["سهل", "متوسط", "صعب", "خبير", "متقدم"];
    stars.forEach((star, index) => {
      if (index < difficulty) {
        star.classList.remove("text-white/30");
        star.classList.add("text-yellow-400");
      } else {
        star.classList.remove("text-yellow-400");
        star.classList.add("text-white/30");
      }
    });
    const difficultyLabel = document.querySelector("#difficultyStars").parentElement.querySelector(".text-blue-200");
    difficultyLabel.textContent = labels[difficulty - 1] || "متوسط";
  }

  async completeLevel() {
    const successRate = this.correctAnswers / this.totalQuestions;
    const passed = successRate >= this.passThreshold;

    const modal = document.getElementById("levelCompleteModal");
    const finalScore = document.getElementById("finalScore");
    const totalPointsEarned = document.getElementById("totalPointsEarned");
    const nextLevelBtn = document.getElementById("nextLevelBtn");

    finalScore.textContent = `${this.correctAnswers}/${this.totalQuestions}`;
    totalPointsEarned.textContent = this.currentPoints - 250;

    if (passed && auth.currentUser) {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        completedLevels: arrayUnion(this.currentLevel),
        currentLevel: this.currentLevel + 1,
        points: increment(this.currentPoints - 250),
      });
    } else {
      nextLevelBtn.textContent = "إعادة المحاولة";
      nextLevelBtn.onclick = () => {
        window.location.reload();
      };
    }

    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.querySelector(".bg-white").classList.remove("scale-95");
    modal.querySelector(".bg-white").classList.add("scale-100");
  }

  showToast(message, type = "info") {
    const event = new CustomEvent("showToast", { detail: { message, type } });
    document.dispatchEvent(event);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new TrainingLevelInterface();
});
