// room-game.js
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
    // Placeholder: Implement actual mapping logic here
    // Note: Original code was truncated, so this is a placeholder
    const questions = [];
    // Example mapping (replace with actual logic from your original code)
    if (quizType === "sms" || quizType === "mixed") {
      questions.push(
        ...smsData.map((sms) => ({
          id: sms.id,
          type: "sms",
          content: sms.text,
          sender: sms.sender || "جهة مجهولة",
          timestamp: "الآن",
          correctAnswer: sms.isPhish ? "phishing" : "safe",
          difficulty: sms.difficulty || 2,
          explanation: sms.explanation || "لا توجد تفاصيل إضافية",
        }))
      );
    }
    // Add similar mappings for dialogueData and imageData based on quizType
    return questions;
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

  // Placeholder for missing methods (based on typical quiz game logic)
  startGame() {
    // Implement game start logic
    console.log("Game started");
  }

  endGame() {
    // Implement game end logic
    console.log("Game ended");
  }

  loadQuestion() {
    // Implement question loading logic
    console.log(`Loading question ${this.currentQuestion + 1}`);
  }

  handleAnswer(answer) {
    // Implement answer handling logic
    console.log(`Answer selected: ${answer}`);
  }

  handleDialogueAnswer() {
    // Implement dialogue answer handling logic
    console.log("Dialogue answer submitted");
  }
}

// Initialize the game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Wait for auth state to resolve before checking or initializing
  auth.onAuthStateChanged((user) => {
    console.log("Auth state resolved:", user ? user.uid : "No user");
    if (!user) {
      window.location.href = "newlogin.html";
      return;
    }
    // User is confirmed signed in—proceed with init
    new RoomGame();
  });
});
