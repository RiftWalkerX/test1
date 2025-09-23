// room-game.js - Modified version with simplified logic like old files
import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class RoomGame {
  constructor() {
    this.roomId = null;
    this.userId = null;
    this.roomData = null;
    this.currentQuestionIndex = 0;
    this.totalQuestions = 10;
    this.userScore = 0;
    this.currentStreak = 0;
    this.hasAnswered = false;
    this.questions = [];
    this.players = [];
    this.quizType = "mixed";
    this.isHost = false;

    this.init();
  }

  async init() {
    console.log("Initializing RoomGame...");

    // Get room ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.roomId = urlParams.get("roomId");
    this.userId = auth.currentUser?.uid;

    console.log("Room ID from URL:", this.roomId);
    console.log("User ID:", this.userId);

    if (!this.roomId) {
      this.showError("معرف الغرفة غير موجود في الرابط");
      return;
    }

    if (!this.userId) {
      this.showError("لم يتم العثور على مستخدم مسجل الدخول");
      return;
    }

    this.setupEventListeners();
    await this.loadRoomData();
  }

  setupEventListeners() {
    console.log("Setting up event listeners...");

    // Answer button listeners
    const safeBtn = document.getElementById("safeBtn");
    const phishingBtn = document.getElementById("phishingBtn");
    const submitDialogueBtn = document.getElementById("submitDialogueBtn");

    if (safeBtn) {
      safeBtn.addEventListener("click", () => this.handleAnswer("safe"));
    }

    if (phishingBtn) {
      phishingBtn.addEventListener("click", () =>
        this.handleAnswer("phishing")
      );
    }

    if (submitDialogueBtn) {
      submitDialogueBtn.addEventListener("click", () =>
        this.handleDialogueSubmission()
      );
    }

    // Game over modal buttons
    const playAgainBtn = document.getElementById("playAgainBtn");
    const closeModalBtn = document.getElementById("closeModalBtn");

    if (playAgainBtn) {
      playAgainBtn.addEventListener("click", () => {
        window.location.href = `room.html?roomId=${this.roomId}`;
      });
    }

    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", () => {
        window.location.href = "dashboard.html";
      });
    }
  }

  async loadRoomData() {
    try {
      console.log("Loading room data for room:", this.roomId);

      const roomRef = doc(db, "rooms", this.roomId);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        this.showError("لم يتم العثور على الغرفة في قاعدة البيانات");
        return;
      }

      this.roomData = roomDoc.data();
      console.log("Room data loaded:", this.roomData);

      this.quizType = this.roomData.quizType || "mixed";
      this.totalQuestions = this.roomData.questionCount || 10;
      this.isHost = this.roomData.hostId === this.userId;

      // Update UI with room info
      this.updateRoomInfo();

      // Setup real-time listeners
      this.setupRealtimeListeners();

      // Load questions from GitHub - EXACT COUNT from room settings
      await this.loadQuestionsFromGitHub();

      // Hide loading overlay
      this.hideLoading();

      // Start the game if it's already started
      if (this.roomData.status === "started") {
        this.startGame();
      } else {
        this.showWaitingMessage("بانتظار بدء اللعبة من قبل المضيف...");
      }
    } catch (error) {
      console.error("Error loading room data:", error);
      this.showError("فشل تحميل بيانات الغرفة: " + error.message);
    }
  }

  updateRoomInfo() {
    const roomTitle = document.getElementById("roomTitle");
    const roomCodeDisplay = document.getElementById("roomCodeDisplay");
    const userPoints = document.getElementById("userPoints");
    const currentStreak = document.getElementById("currentStreak");

    if (roomTitle && this.roomData?.roomName) {
      roomTitle.textContent = this.roomData.roomName;
    }

    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = `رمز: ${this.roomId}`;
    }

    if (userPoints) userPoints.textContent = this.userScore;
    if (currentStreak) currentStreak.textContent = this.currentStreak;
  }

  setupRealtimeListeners() {
    // Listen to room changes with error handling
    this.roomListener = onSnapshot(
      doc(db, "rooms", this.roomId),
      (doc) => {
        if (doc.exists()) {
          const newData = doc.data();
          console.log("Room updated:", newData);
          this.handleRoomUpdate(newData);
        }
      },
      (error) => {
        console.error("Error listening to room:", error);
      }
    );

    // Listen to players changes
    this.playersListener = onSnapshot(
      collection(db, `rooms/${this.roomId}/players`),
      (snapshot) => {
        this.players = snapshot.docs.map((doc) => doc.data());
        console.log("Players updated:", this.players);
        this.updatePlayersStatus();
      },
      (error) => {
        console.error("Error listening to players:", error);
      }
    );
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
    if (newData.currentQuestion !== this.currentQuestionIndex) {
      this.currentQuestionIndex = newData.currentQuestion;
      if (this.roomData.status === "started") {
        this.loadQuestion();
      }
    }

    this.updateRoomInfo();
  }

  async loadQuestionsFromGitHub() {
    try {
      console.log("Loading questions from GitHub...");
      const now = Date.now();

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

      const [smsData, dialogueData, imageData] = await Promise.all([
        smsRes.json(),
        dialogueRes.json(),
        imageRes.json(),
      ]);

      console.log("Fetched questions:", {
        sms: smsData.length,
        dialogue: dialogueData.length,
        image: imageData.length,
      });

      // Use the EXACT number of questions the host selected
      this.totalQuestions = this.roomData.questionCount || 10;
      console.log(
        `Loading ${this.totalQuestions} questions for quiz type: ${this.quizType}`
      );

      // Transform questions
      let allQuestions = [];

      // SMS questions
      const smsQuestions = smsData.map((sms, index) => ({
        id: `sms-${index}`,
        type: "sms",
        content: sms.text,
        sender: sms.sender || "جهة مجهولة",
        timestamp: "الآن",
        correctAnswer: sms.isPhish ? "phishing" : "safe",
        difficulty: sms.difficulty || 2,
        explanation: sms.explanation || "لا توجد تفاصيل إضافية",
      }));

      // Dialogue questions
      const dialogueQuestions = dialogueData.map((dialogue, index) => ({
        id: `dialogue-${index}`,
        type: "dialogue",
        messages: dialogue.messages || [],
        correctAnswer: dialogue.isPhish ? "phishing" : "safe",
        difficulty: dialogue.difficulty || 2,
        explanation: dialogue.explanation || "لا توجد تفاصيل إضافية",
      }));

      // Image questions
      const imageQuestions = imageData.map((image, index) => ({
        id: `image-${index}`,
        type: "image",
        imageUrl: image.url,
        description: image.description || "",
        correctAnswer: image.isPhish ? "phishing" : "safe",
        difficulty: image.difficulty || 2,
        explanation: image.explanation || "لا توجد تفاصيل إضافية",
      }));

      // Select questions based on quiz type and EXACT count
      switch (this.quizType) {
        case "sms":
          allQuestions = this.shuffleArray(smsQuestions).slice(
            0,
            this.totalQuestions
          );
          break;
        case "dialogue":
          allQuestions = this.shuffleArray(dialogueQuestions).slice(
            0,
            this.totalQuestions
          );
          break;
        case "image":
          allQuestions = this.shuffleArray(imageQuestions).slice(
            0,
            this.totalQuestions
          );
          break;
        case "mixed":
        default:
          // Mix questions proportionally based on EXACT count
          const smsCount = Math.ceil(this.totalQuestions * 0.4);
          const dialogueCount = Math.ceil(this.totalQuestions * 0.3);
          const imageCount = this.totalQuestions - smsCount - dialogueCount;

          allQuestions = [
            ...this.shuffleArray(smsQuestions).slice(0, smsCount),
            ...this.shuffleArray(dialogueQuestions).slice(0, dialogueCount),
            ...this.shuffleArray(imageQuestions).slice(0, imageCount),
          ];

          // Ensure EXACT count
          allQuestions = allQuestions.slice(0, this.totalQuestions);
          break;
      }

      this.questions = allQuestions;
      console.log(
        `Loaded ${this.questions.length} questions (exactly as requested)`
      );
    } catch (error) {
      console.error("Error loading questions from GitHub:", error);
      // Fallback with exact count
      this.questions = this.generateSampleQuestions().slice(
        0,
        this.totalQuestions
      );
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  startGame() {
    console.log("Starting game...");
    this.currentQuestionIndex = this.roomData.currentQuestion || 0;
    this.loadQuestion();
  }

  loadQuestion() {
    if (this.currentQuestionIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    const question = this.questions[this.currentQuestionIndex];
    this.hasAnswered = false;

    console.log("Loading question:", question);

    // Hide all states
    this.hideElement("loadingState");
    this.hideElement("waitingState");
    this.hideElement("resultsState");
    this.showElement("questionContent");

    // Hide all question types
    this.hideAllQuestionTypes();

    // Show appropriate question type
    switch (question.type) {
      case "sms":
        this.showSMSQuestion(question);
        break;
      case "dialogue":
        this.showDialogueQuestion(question);
        break;
      case "image":
        this.showImageQuestion(question);
        break;
      default:
        this.showSMSQuestion(question);
        break;
    }

    this.updateQuestionProgress();
    this.updateDifficultyIndicator(question.difficulty || 2);

    // REMOVED: Timer functionality
  }

  showSMSQuestion(question) {
    this.showElement("smsQuestion");
    const smsContent = document.getElementById("smsContent");
    const smsSender = document.getElementById("smsSender");
    const smsTimestamp = document.getElementById("smsTimestamp");

    if (smsContent) smsContent.textContent = question.content;
    if (smsSender) smsSender.textContent = question.sender || "جهة مجهولة";
    if (smsTimestamp) smsTimestamp.textContent = question.timestamp || "الآن";
  }

  showDialogueQuestion(question) {
    this.showElement("dialogueQuestion");
    const messagesContainer = document.getElementById("dialogueMessages");
    const submitBtn = document.getElementById("submitDialogueBtn");

    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="dialogue-container bg-white/5 rounded-lg p-4 max-h-80 overflow-y-auto">
          <div class="space-y-3" id="dialogueMessagesList">
            ${(question.messages || [])
              .map(
                (msg, index) => `
              <div class="flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }">
                <div class="max-w-xs rounded-2xl p-3 ${
                  msg.sender === "user"
                    ? "bg-blue-500 text-white rounded-br-none"
                    : "bg-gray-300 text-gray-800 rounded-bl-none"
                }">
                  <p class="text-sm">${msg.text}</p>
                  <p class="text-xs opacity-70 mt-1 text-right">${
                    msg.time || ""
                  }</p>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
        
        <div class="mt-4 bg-white/10 rounded-lg p-4">
          <p class="text-white font-medium mb-3">اختر الرسائل المشبوهة:</p>
          <div class="space-y-2" id="suspiciousOptions">
            ${(question.messages || [])
              .map(
                (msg, index) => `
              <label class="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                <input type="checkbox" name="suspiciousMessage" value="${index}" 
                      class="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                <div class="flex-1">
                  <p class="text-white text-sm">${msg.text}</p>
                  <p class="text-blue-200 text-xs">${
                    msg.sender === "user" ? "أنت" : "المرسل"
                  }</p>
                </div>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    if (submitBtn) this.showElement("submitDialogueBtn");
  }

  // SIMPLIFIED: Handle answer like old files
  async handleAnswer(answer) {
    if (this.hasAnswered) return;

    const question = this.questions[this.currentQuestionIndex];
    const isCorrect = answer === question.correctAnswer;

    this.hasAnswered = true;

    // Update player score (like old files)
    if (isCorrect) {
      this.userScore += 50;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    // Update Firestore with player's answer
    await this.updatePlayerAnswer(answer, isCorrect);

    // Show results for 1 second (like old files)
    this.showResults(isCorrect, question.explanation);

    // Auto-progress to next question after 1 second (like old files)
    setTimeout(() => {
      this.nextQuestion();
    }, 1000);
  }

  async updatePlayerAnswer(answer, isCorrect) {
    try {
      const playerRef = doc(db, `rooms/${this.roomId}/players`, this.userId);
      await updateDoc(playerRef, {
        score: this.userScore,
        lastAnswer: serverTimestamp(),
        [`answers.${this.currentQuestionIndex}`]: {
          answer: answer,
          correct: isCorrect,
          timestamp: serverTimestamp(),
        },
      });

      // Also update the main room document for real-time sync
      const roomRef = doc(db, "rooms", this.roomId);
      await updateDoc(roomRef, {
        [`scores.${this.userId}`]: this.userScore,
      });
    } catch (error) {
      console.error("Error updating player answer:", error);
    }
  }

  handleDialogueSubmission() {
    // For dialogue questions, use a simple approach like old files
    this.handleAnswer("phishing");
  }

  showResults(isCorrect, explanation) {
    this.hideElement("questionContent");
    this.showElement("resultsState");

    const resultIcon = document.getElementById("resultIcon");
    const resultTitle = document.getElementById("resultTitle");
    const resultMessage = document.getElementById("resultMessage");
    const resultExplanation = document.getElementById("resultExplanation");
    const pointsEarned = document.getElementById("pointsEarned");

    if (isCorrect) {
      resultIcon.textContent = "✓";
      resultTitle.textContent = "إجابة صحيحة!";
      resultMessage.textContent = "لقد تعرفت بنجاح على محاولة الاحتيال.";
      resultTitle.className = "text-xl font-bold text-green-400 mb-2";
    } else {
      resultIcon.textContent = "✗";
      resultTitle.textContent = "إجابة خاطئة";
      resultMessage.textContent = "كانت هذه محاولة احتيال.";
      resultTitle.className = "text-xl font-bold text-red-400 mb-2";
    }

    if (resultExplanation) resultExplanation.textContent = explanation;
    if (pointsEarned) pointsEarned.textContent = isCorrect ? "+50" : "+0";
  }

  async nextQuestion() {
    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.totalQuestions) {
      await this.endGame();
    } else {
      // Update room's current question in Firestore
      try {
        await updateDoc(doc(db, "rooms", this.roomId), {
          currentQuestion: this.currentQuestionIndex,
        });
      } catch (error) {
        console.error("Error updating current question:", error);
        // Continue anyway
        this.loadQuestion();
      }
    }
  }

  // REMOVED: All timer-related functions (startTimer, updateTimerDisplay, etc.)

  async endGame() {
    console.log("Game ended");

    try {
      // Update room status to ended
      const roomRef = doc(db, "rooms", this.roomId);
      await updateDoc(roomRef, {
        status: "ended",
        endedAt: serverTimestamp(),
      });

      this.showGameOverModal();
    } catch (error) {
      console.error("Error ending game:", error);
      this.showGameOverModal();
    }
  }

  showGameOverModal() {
    const modal = document.getElementById("gameOverModal");
    const finalScores = document.getElementById("finalScores");

    if (!modal || !finalScores) return;

    // Sort players by score
    const sortedPlayers = [...this.players].sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );

    finalScores.innerHTML = sortedPlayers
      .map(
        (player, index) => `
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg ${
          index === 0 ? "text-yellow-400" : "text-white"
        }">
          <div class="flex items-center gap-3">
            <span class="font-bold">${index + 1}.</span>
            <span>${player.displayName}</span>
            ${
              player.isHost
                ? '<span class="text-yellow-400 text-sm">👑 المضيف</span>'
                : ""
            }
          </div>
          <span class="font-bold">${player.score || 0} نقطة</span>
        </div>
      `
      )
      .join("");

    modal.classList.remove("hidden");

    // Remove room listener to prevent spam
    if (this.roomListener) {
      this.roomListener();
    }
  }

  // Helper methods (unchanged)
  showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.classList.remove("hidden");
  }

  hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.classList.add("hidden");
  }

  hideAllQuestionTypes() {
    this.hideElement("smsQuestion");
    this.hideElement("dialogueQuestion");
    this.hideElement("imageQuestion");
    this.hideElement("submitDialogueBtn");
  }

  updateQuestionProgress() {
    const currentQuestionEl = document.getElementById("currentQuestion");
    const totalQuestionsEl = document.getElementById("totalQuestions");

    if (currentQuestionEl) {
      currentQuestionEl.textContent = this.currentQuestionIndex + 1;
    }
    if (totalQuestionsEl) {
      totalQuestionsEl.textContent = this.totalQuestions;
    }
  }

  updateDifficultyIndicator(difficulty) {
    const stars = document.querySelectorAll(".difficulty-star");
    if (stars.length > 0) {
      stars.forEach((star, index) => {
        if (index < difficulty) {
          star.classList.add("text-yellow-400");
          star.classList.remove("text-gray-400");
        } else {
          star.classList.remove("text-yellow-400");
          star.classList.add("text-gray-400");
        }
      });
    }
  }

  updatePlayersStatus() {
    const playersList = document.getElementById("playersList");
    if (!playersList) return;

    playersList.innerHTML = this.players
      .map(
        (player) => `
        <div class="flex items-center justify-between p-2 bg-white/5 rounded-lg">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full ${
              player.isReady ? "bg-green-500" : "bg-yellow-500"
            }"></div>
            <span class="text-white text-sm">${player.displayName}</span>
            ${
              player.isHost
                ? '<span class="text-yellow-400 text-xs">👑</span>'
                : ""
            }
          </div>
          <span class="text-blue-200 text-sm">${player.score || 0}</span>
        </div>
      `
      )
      .join("");
  }

  showWaitingMessage(message) {
    this.hideElement("loadingState");
    this.hideElement("questionContent");
    this.hideElement("resultsState");

    const waitingState = document.getElementById("waitingState");
    const waitingText = document.getElementById("waitingText");

    if (waitingState && waitingText) {
      waitingText.textContent = message;
      this.showElement("waitingState");
    }
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
      loadingOverlay.style.display = "none";
    }
  }

  showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className =
      "fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded-lg z-50";
    errorDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <span>${message}</span>
        </div>
      `;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    }, 5000);
  }

  generateSampleQuestions() {
    return [
      {
        type: "sms",
        content:
          "عزيزي العميل، لديك رصيد مجاني 10 دينار. لاستلامه اضغط على الرابط: bit.ly/free-balance",
        sender: "اتصالات",
        timestamp: "الآن",
        correctAnswer: "phishing",
        difficulty: 2,
        explanation: "هذه رسالة تصيد تحتوي على رابط مختصر مشبوه",
      },
    ];
  }
}

// Initialize the game when the page loads
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "newlogin.html";
      return;
    }
    new RoomGame();
  });
});
