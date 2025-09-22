import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class RoomGame {
  constructor() {
    this.roomId = null;
    this.userId = null;
    this.roomData = null;
    this.currentQuestion = 0;
    this.totalQuestions = 10;
    this.userScore = 0;
    this.currentStreak = 0;
    this.timer = 30;
    this.timerInterval = null;
    this.hasAnswered = false;
    this.questions = [];
    this.players = [];

    this.init();
  }

  async init() {
    // Get room ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.roomId = urlParams.get("roomId");
    this.userId = auth.currentUser?.uid;

    if (!this.roomId || !this.userId) {
      this.showError("معرف الغرفة أو المستخدم غير صحيح");
      return;
    }

    this.setupEventListeners();
    await this.loadRoomData();
    this.setupRealtimeListeners();
  }

  setupEventListeners() {
    // Answer buttons
    document.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (this.hasAnswered) return;
        const answer = e.currentTarget.getAttribute("data-answer");
        this.handleAnswer(answer);
      });
    });

    // Dialogue submit button
    document.getElementById("submitDialogue")?.addEventListener("click", () => {
      if (this.hasAnswered) return;
      this.handleDialogueAnswer();
    });

    // Game over buttons
    document.getElementById("playAgainBtn")?.addEventListener("click", () => {
      window.location.reload();
    });

    document
      .getElementById("backToDashboard")
      ?.addEventListener("click", () => {
        window.location.href = "dashboard.html";
      });
  }

  async loadRoomData() {
    try {
      const roomRef = doc(db, "rooms", this.roomId);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        this.showError("لم يتم العثور على الغرفة");
        return;
      }

      this.roomData = roomDoc.data();
      this.totalQuestions = this.roomData.questionCount || 10;

      // Update UI with room info
      this.updateRoomInfo();

      // Load questions from GitHub based on quiz type
      await this.loadQuestionsFromGitHub();

      // Hide loading overlay
      this.hideLoading();
    } catch (error) {
      console.error("Error loading room data:", error);
      this.showError("فشل تحميل بيانات الغرفة");
    }
  }

  setupRealtimeListeners() {
    // Listen to room changes
    onSnapshot(doc(db, "rooms", this.roomId), (doc) => {
      if (doc.exists()) {
        const newData = doc.data();
        this.handleRoomUpdate(newData);
      }
    });

    // Listen to players changes
    onSnapshot(collection(db, `rooms/${this.roomId}/players`), (snapshot) => {
      this.players = snapshot.docs.map((doc) => doc.data());
      this.updatePlayersStatus();
    });
  }

  handleRoomUpdate(newData) {
    this.roomData = newData;

    // Handle game state changes
    if (newData.status === "started" && this.roomData.status !== "started") {
      this.startGame();
    } else if (newData.status === "ended") {
      this.endGame();
    }

    // Handle question progression
    if (newData.currentQuestion !== this.currentQuestion) {
      this.currentQuestion = newData.currentQuestion;
      this.loadQuestion();
    }

    this.updateRoomInfo();
  }

  async loadQuestionsFromGitHub() {
    try {
      const now = Date.now();
      const quizType = this.roomData.quizType || "mixed";

      // Fetch data from GitHub repositories
      const [smsRes, dialogueRes, imageRes] = await Promise.all([
        fetch(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=${now}`
        ),
        fetch(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=${now}`
        ),
        fetch(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=${now}`
        ),
      ]);

      if (!smsRes.ok || !dialogueRes.ok || !imageRes.ok) {
        throw new Error("Failed to fetch questions from GitHub");
      }

      const smsData = await smsRes.json();
      const dialogueData = await dialogueRes.json();
      const imageData = await imageRes.json();

      // Map the data to your question format
      this.questions = this.generateQuestionsFromData(
        smsData,
        dialogueData,
        imageData,
        quizType
      );
    } catch (error) {
      console.error("Error loading questions from GitHub:", error);
      this.questions = this.generateSampleQuestions();
      this.showToast(
        "تم استخدام أسئلة تجريبية بسبب مشكلة في التحميل",
        "warning"
      );
    }
  }

  generateQuestionsFromData(smsData, dialogueData, imageData, quizType) {
    // Map SMS questions
    const mappedSms = smsData.map((sms) => ({
      id: sms.id,
      type: "sms",
      content: sms.text,
      sender: sms.sender || "جهة مجهولة",
      timestamp: "الآن",
      correctAnswer: sms.isPhish ? "phishing" : "safe",
      difficulty: this.calculateDifficulty(sms.text),
      explanation: sms.explanation || "لا يوجد تفسير متاح",
    }));

    // Map dialogue questions
    const mappedDialogues = dialogueData.map((dialogue) => ({
      id: dialogue.id,
      type: "dialogue",
      messages: dialogue.messages.map((msg) => ({
        text: msg.text,
        sender: msg.sender === "you" ? "user" : msg.sender || "other",
        isPhishing: !!msg.isPhish,
      })),
      correctAnswer: dialogue.messages.some((msg) => msg.isPhish)
        ? "phishing"
        : "safe",
      difficulty: this.calculateDialogueDifficulty(dialogue.messages),
      explanation: dialogue.explanation || "المحادثة تحتوي على رسائل احتيالية",
    }));

    // Map image questions
    const mappedImages = imageData.map((img) => ({
      id: img.id,
      type: "image",
      imageUrl: img.text || img.imageUrl,
      description: img.title || img.description || "صورة للتحليل",
      correctAnswer: img.isPhish ? "phishing" : "safe",
      difficulty: 3, // Images are generally harder
      explanation: img.explanation || "لا يوجد تفسير متاح للصورة",
    }));

    // Filter questions based on quiz type
    let selectedQuestions = [];

    switch (quizType) {
      case "sms":
        selectedQuestions = this.selectRandomQuestions(
          mappedSms,
          this.totalQuestions
        );
        break;
      case "dialogue":
        selectedQuestions = this.selectRandomQuestions(
          mappedDialogues,
          this.totalQuestions
        );
        break;
      case "image":
        selectedQuestions = this.selectRandomQuestions(
          mappedImages,
          this.totalQuestions
        );
        break;
      case "mixed":
      default:
        // Mix questions from all types
        const allQuestions = [
          ...mappedSms,
          ...mappedDialogues,
          ...mappedImages,
        ];
        selectedQuestions = this.selectRandomQuestions(
          allQuestions,
          this.totalQuestions
        );
        break;
    }

    return selectedQuestions;
  }

  selectRandomQuestions(questions, count) {
    // Shuffle array and select required number of questions
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  calculateDifficulty(text) {
    let difficulty = 1;
    const phishingKeywords = [
      "ربح",
      "جائزة",
      "كسب",
      "مجاني",
      "هدية",
      "عاجل",
      "مهم",
      "فوري",
      "رابط",
      "اضغط",
      "ادخل",
      "بيانات",
      "حساب",
      "بطاقة",
      "رقم",
      "عربي",
      "جنيه",
      "ريال",
      "دولار",
      "مليون",
      "الف",
      "مكافأة",
    ];

    const textLower = text.toLowerCase();
    phishingKeywords.forEach((keyword) => {
      if (textLower.includes(keyword.toLowerCase())) {
        difficulty++;
      }
    });

    return Math.min(5, Math.max(1, difficulty));
  }

  calculateDialogueDifficulty(messages) {
    let difficulty = 1;

    // Increase difficulty based on number of messages
    difficulty += Math.min(2, Math.floor(messages.length / 2));

    // Increase difficulty if phishing messages are subtle
    const hasPhishing = messages.some((msg) => msg.isPhish);
    if (hasPhishing) {
      difficulty += 1;
    }

    return Math.min(5, Math.max(1, difficulty));
  }

  startGame() {
    this.currentQuestion = 0;
    this.userScore = 0;
    this.currentStreak = 0;
    this.hasAnswered = false;

    this.updateQuestionProgress();
    this.loadQuestion();
    this.startTimer();
  }

  loadQuestion() {
    if (this.currentQuestion >= this.questions.length) {
      this.endGame();
      return;
    }

    const question = this.questions[this.currentQuestion];
    this.hasAnswered = false;

    // Reset UI states
    this.hideAllQuestionTypes();
    this.showElement("questionContent");
    this.hideElement("waitingState");
    this.hideElement("resultsState");

    // Update difficulty indicator
    this.updateDifficultyIndicator(question.difficulty);

    // Load question based on type
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

    this.updateQuestionProgress();
    this.resetTimer();
  }

  loadSMSQuestion(question) {
    this.showElement("smsQuestion");
    document.getElementById("smsContent").textContent = question.content;
    document.getElementById("smsSender").textContent = question.sender;
    document.getElementById("smsTimestamp").textContent = question.timestamp;
    this.hideElement("submitDialogue");
  }

  loadDialogueQuestion(question) {
    this.showElement("dialogueQuestion");
    const messagesContainer = document.getElementById("dialogueMessages");
    messagesContainer.innerHTML = "";

    question.messages.forEach((message, index) => {
      const messageElement = document.createElement("div");
      messageElement.className = `flex items-start gap-3 ${
        message.sender === "user" ? "justify-end" : ""
      }`;
      messageElement.innerHTML = `
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
              <p class="text-white text-sm">${this.escapeHtml(message.text)}</p>
            </div>
            ${
              message.sender !== "user"
                ? `
            <div class="flex items-center gap-2">
              <input type="checkbox" id="msg_${index}" class="w-4 h-4 text-red-500 bg-white/10 border-white/20 rounded focus:ring-red-400 focus:ring-2">
              <label for="msg_${index}" class="text-xs text-white/60">محاولة احتيال</label>
            </div>
            `
                : ""
            }
          </div>
        </div>
      `;
      messagesContainer.appendChild(messageElement);
    });

    this.showElement("submitDialogue");
  }

  loadImageQuestion(question) {
    this.showElement("imageQuestion");
    const imgElement = document.getElementById("questionImage");
    const descElement = document.getElementById("imageDescription");

    if (imgElement && question.imageUrl) {
      imgElement.src = question.imageUrl;
      imgElement.onerror = () => {
        imgElement.src =
          "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?w=400";
      };
    }
    if (descElement) {
      descElement.textContent = question.description;
    }
    this.hideElement("submitDialogue");
  }

  async handleAnswer(answer) {
    if (this.hasAnswered) return;

    const question = this.questions[this.currentQuestion];
    const isCorrect = answer === question.correctAnswer;

    this.hasAnswered = true;
    this.stopTimer();

    // Update user score
    if (isCorrect) {
      this.userScore += 50;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    // Update UI
    this.updateScoreDisplay();
    this.showResults(isCorrect, question.explanation);

    // Save answer to Firebase
    await this.saveAnswer(answer, isCorrect);

    // Wait for all players or proceed after timeout
    setTimeout(() => {
      this.proceedToNextQuestion();
    }, 3000);
  }

  async handleDialogueAnswer() {
    if (this.hasAnswered) return;

    const question = this.questions[this.currentQuestion];
    const checkboxes = document.querySelectorAll(
      '#dialogueMessages input[type="checkbox"]'
    );

    let correctSelections = 0;
    question.messages.forEach((message, index) => {
      if (message.sender !== "user") {
        const isPhishing = message.isPhishing;
        const isChecked = checkboxes[index]?.checked || false;
        if ((isPhishing && isChecked) || (!isPhishing && !isChecked)) {
          correctSelections++;
        }
      }
    });

    const totalNonUserMessages = question.messages.filter(
      (m) => m.sender !== "user"
    ).length;
    const isCorrect = correctSelections === totalNonUserMessages;

    this.handleAnswer(isCorrect ? question.correctAnswer : "incorrect");
  }

  async saveAnswer(answer, isCorrect) {
    try {
      const playerRef = doc(db, `rooms/${this.roomId}/players`, this.userId);
      await updateDoc(playerRef, {
        score: this.userScore,
        streak: this.currentStreak,
        lastAnswer: answer,
        lastAnswerCorrect: isCorrect,
        answeredAt: serverTimestamp(),
      });

      // Update room with answer count
      const roomRef = doc(db, "rooms", this.roomId);
      await updateDoc(roomRef, {
        [`answers.${this.currentQuestion}.${this.userId}`]: {
          answer: answer,
          correct: isCorrect,
          timestamp: serverTimestamp(),
        },
      });
    } catch (error) {
      console.error("Error saving answer:", error);
    }
  }

  showResults(isCorrect, explanation) {
    this.showElement("resultsState");
    this.hideElement("questionContent");

    document.getElementById("resultIcon").textContent = isCorrect ? "✓" : "✗";
    document.getElementById("resultTitle").textContent = isCorrect
      ? "إجابة صحيحة!"
      : "إجابة خاطئة";
    document.getElementById("resultMessage").textContent = isCorrect
      ? "لقد تعرفت بنجاح على محاولة الاحتيال."
      : "حاول مرة أخرى في السؤال القادم.";
    document.getElementById("resultExplanation").textContent = explanation;
    document.getElementById("pointsEarned").textContent = isCorrect
      ? "+50"
      : "+0";

    // Update players correct count (this would come from Firebase in real implementation)
    const correctPlayers = this.players.filter(
      (p) => p.lastAnswerCorrect
    ).length;
    document.getElementById(
      "playersCorrect"
    ).textContent = `${correctPlayers}/${this.players.length}`;
  }

  proceedToNextQuestion() {
    this.currentQuestion++;

    if (this.currentQuestion >= this.totalQuestions) {
      this.endGame();
    } else {
      // Update room to next question
      this.updateRoomQuestion();
    }
  }

  async updateRoomQuestion() {
    try {
      const roomRef = doc(db, "rooms", this.roomId);
      await updateDoc(roomRef, {
        currentQuestion: this.currentQuestion,
      });
    } catch (error) {
      console.error("Error updating room question:", error);
    }
  }

  startTimer() {
    this.timer = 30;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      this.timer--;
      this.updateTimerDisplay();

      if (this.timer <= 0) {
        this.handleTimeUp();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTimer() {
    this.stopTimer();
    this.timer = 30;
    this.updateTimerDisplay();
    this.startTimer();
  }

  handleTimeUp() {
    this.stopTimer();
    if (!this.hasAnswered) {
      this.handleAnswer("timeout");
    }
  }

  endGame() {
    this.stopTimer();
    this.showGameOverModal();

    // Update room status to ended
    this.updateRoomStatus("ended");
  }

  async updateRoomStatus(status) {
    try {
      const roomRef = doc(db, "rooms", this.roomId);
      await updateDoc(roomRef, {
        status: status,
        endedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating room status:", error);
    }
  }

  showGameOverModal() {
    const modal = document.getElementById("gameOverModal");
    const finalScores = document.getElementById("finalScores");

    // Sort players by score
    const sortedPlayers = [...this.players].sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );

    finalScores.innerHTML = sortedPlayers
      .map(
        (player, index) => `
      <div class="flex items-center justify-between p-3 ${
        index === 0 ? "bg-yellow-500/10 rounded-lg" : ""
      }">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span class="text-white font-bold text-sm">${
              player.displayName?.charAt(0) || "?"
            }</span>
          </div>
          <div>
            <p class="text-gray-900 font-medium">${player.displayName} ${
          player.isHost ? "👑" : ""
        }</p>
            <p class="text-gray-600 text-xs">${index === 0 ? "الفائز!" : ""}</p>
          </div>
        </div>
        <div class="text-lg font-bold ${
          index === 0 ? "text-yellow-600" : "text-gray-700"
        }">
          ${player.score || 0} نقطة
        </div>
      </div>
    `
      )
      .join("");

    this.showModal(modal);
  }

  // Fallback method for sample questions
  generateSampleQuestions() {
    const questions = [];
    for (let i = 0; i < this.totalQuestions; i++) {
      questions.push({
        id: i + 1,
        type: "sms",
        content:
          "هذا سؤال تجريبي. الجواب الصحيح: " +
          (Math.random() > 0.5 ? "احتيال" : "آمنة"),
        sender: "جهة مجهولة",
        timestamp: "الآن",
        correctAnswer: Math.random() > 0.5 ? "phishing" : "safe",
        difficulty: 2,
        explanation: "هذا سؤال تجريبي للعرض فقط",
      });
    }
    return questions;
  }

  // Utility methods
  updateRoomInfo() {
    document.getElementById("roomTitle").textContent =
      this.roomData?.roomName || "غرفة التدريب";
    document.getElementById(
      "roomCodeDisplay"
    ).textContent = `رمز: ${this.roomId}`;
  }

  updateQuestionProgress() {
    document.getElementById("questionProgress").textContent = `سؤال ${
      this.currentQuestion + 1
    } من ${this.totalQuestions}`;
  }

  updateScoreDisplay() {
    document.getElementById("userPoints").textContent = this.userScore;
    document.getElementById("currentStreak").textContent = this.currentStreak;
  }

  updateTimerDisplay() {
    document.getElementById("timer").textContent = this.timer;
  }

  updatePlayersStatus() {
    const container = document.getElementById("playersStatus");
    if (!container) return;

    container.innerHTML = this.players
      .map(
        (player) => `
      <div class="text-center">
        <div class="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center relative">
          <span class="text-white font-bold">${
            player.displayName?.charAt(0) || "?"
          }</span>
          ${
            player.lastAnswer
              ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>'
              : ""
          }
        </div>
        <p class="text-white text-sm font-medium truncate">${
          player.displayName
        }</p>
        <p class="text-blue-200 text-xs">${player.score || 0} نقطة</p>
        ${
          player.isHost
            ? '<p class="text-yellow-400 text-xs">👑 المضيف</p>'
            : ""
        }
      </div>
    `
      )
      .join("");
  }

  updateDifficultyIndicator(difficulty) {
    const stars = document.querySelectorAll("#difficultyStars svg");
    const labels = ["سهل", "متوسط", "صعب", "خبير", "متقدم"];

    stars.forEach((star, index) => {
      star.classList.toggle("text-yellow-400", index < difficulty);
      star.classList.toggle("text-white/30", index >= difficulty);
    });

    const labelElement = document.querySelector(
      "#difficultyStars + .text-blue-200"
    );
    if (labelElement) {
      labelElement.textContent = labels[difficulty - 1] || "متوسط";
    }
  }

  hideAllQuestionTypes() {
    ["smsQuestion", "dialogueQuestion", "imageQuestion"].forEach((id) => {
      this.hideElement(id);
    });
  }

  showElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.remove("hidden");
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.add("hidden");
  }

  showModal(modal) {
    if (!modal) return;
    modal.classList.remove("opacity-0", "pointer-events-none");
  }

  hideLoading() {
    this.hideElement("loadingOverlay");
  }

  showError(message) {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.innerHTML = `
        <div class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-red-500 to-orange-600 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-white mb-2">خطأ</h3>
          <p class="text-blue-200 mb-4">${message}</p>
          <button onclick="window.location.href='dashboard.html'" class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200">
            العودة للوحة التحكم
          </button>
        </div>
      `;
    }
  }

  showToast(message, type = "info") {
    // Dispatch toast event that will be handled by dashboard.js
    document.dispatchEvent(
      new CustomEvent("showToast", { detail: { message, type } })
    );
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

// Initialize the game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Check if user is authenticated
  if (!auth.currentUser) {
    window.location.href = "login.html";
    return;
  }

  new RoomGame();
});
