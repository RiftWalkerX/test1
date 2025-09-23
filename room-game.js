// room-game.js - Fixed version
import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  serverTimestamp,
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
    this.timer = 30;
    this.timerInterval = null;
    this.hasAnswered = false;
    this.questions = [];
    this.players = [];
    this.quizType = "mixed";

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
    console.log("Full URL:", window.location.href);

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

      // Update UI with room info
      this.updateRoomInfo();

      // Setup real-time listeners
      this.setupRealtimeListeners();

      // Load questions
      await this.loadQuestions();

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
    // Update room title and code
    const roomTitle = document.getElementById("roomTitle");
    const roomCodeDisplay = document.getElementById("roomCodeDisplay");

    if (roomTitle) {
      roomTitle.textContent = this.roomData?.roomName || "غرفة التدريب";
    }

    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = `رمز: ${this.roomId}`;
    }

    // Update user points and streak
    const userPoints = document.getElementById("userPoints");
    const currentStreak = document.getElementById("currentStreak");

    if (userPoints) userPoints.textContent = this.userScore;
    if (currentStreak) currentStreak.textContent = this.currentStreak;
  }

  setupRealtimeListeners() {
    // Listen to room changes
    onSnapshot(doc(db, "rooms", this.roomId), (doc) => {
      if (doc.exists()) {
        const newData = doc.data();
        console.log("Room updated:", newData);
        this.handleRoomUpdate(newData);
      }
    });

    // Listen to players changes
    onSnapshot(collection(db, `rooms/${this.roomId}/players`), (snapshot) => {
      this.players = snapshot.docs.map((doc) => doc.data());
      console.log("Players updated:", this.players);
      this.updatePlayersStatus();
    });
  }

  handleRoomUpdate(newData) {
    this.roomData = newData;

    // Handle game state changes
    if (
      newData.status === "started" &&
      (!this.roomData.status || this.roomData.status !== "started")
    ) {
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

  async loadQuestions() {
    try {
      console.log("Loading questions for room:", this.roomId);

      // Try to load questions from the room's questions collection
      const questionsRef = collection(db, `rooms/${this.roomId}/questions`);
      const questionsSnapshot = await getDocs(questionsRef);

      if (!questionsSnapshot.empty) {
        // Load questions from the room's specific collection
        this.questions = questionsSnapshot.docs
          .map((doc) => doc.data())
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        console.log(`Loaded ${this.questions.length} room-specific questions`);
        return;
      }

      console.log("No room-specific questions found, using fallback questions");
      // Use fallback questions
      this.questions = this.generateSampleQuestions().slice(
        0,
        this.totalQuestions
      );
    } catch (error) {
      console.error("Error loading questions:", error);
      this.questions = this.generateSampleQuestions().slice(
        0,
        this.totalQuestions
      );
      this.showToast(
        "تم استخدام أسئلة تجريبية بسبب مشكلة في التحميل",
        "warning"
      );
    }
  }

  startGame() {
    console.log("Starting game...");
    this.currentQuestionIndex = this.roomData.currentQuestion || 0;
    this.loadQuestion();
    this.startTimer();
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
        this.showSMSQuestion(question); // Default to SMS
        break;
    }

    this.updateQuestionProgress();
    this.updateDifficultyIndicator(question.difficulty || 2);
  }

  showSMSQuestion(question) {
    this.showElement("smsQuestion");
    if (document.getElementById("smsContent")) {
      document.getElementById("smsContent").textContent = question.content;
    }
    if (document.getElementById("smsSender")) {
      document.getElementById("smsSender").textContent =
        question.sender || "جهة مجهولة";
    }
    if (document.getElementById("smsTimestamp")) {
      document.getElementById("smsTimestamp").textContent =
        question.timestamp || "الآن";
    }
  }

  showDialogueQuestion(question) {
    this.showElement("dialogueQuestion");
    const messagesContainer = document.getElementById("dialogueMessages");
    if (messagesContainer) {
      messagesContainer.innerHTML = "";

      (question.messages || []).forEach((msg, index) => {
        const messageElement = document.createElement("div");
        messageElement.className = `flex ${
          msg.isUser ? "justify-start" : "justify-end"
        }`;
        messageElement.innerHTML = `
          <div class="max-w-xs bg-white/10 rounded-lg p-3">
            <p class="text-white">${msg.text || "رسالة"}</p>
            <p class="text-blue-200 text-xs mt-1">${msg.time || "الآن"}</p>
          </div>
        `;
        messagesContainer.appendChild(messageElement);
      });
    }

    // Show submit button for dialogue questions
    this.showElement("submitDialogue");
  }

  showImageQuestion(question) {
    this.showElement("imageQuestion");
    const imgElement = document.getElementById("questionImage");
    if (imgElement) {
      imgElement.src =
        question.imageUrl ||
        "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
      imgElement.alt = question.description || "صورة السؤال";
    }
    if (document.getElementById("imageDescription")) {
      document.getElementById("imageDescription").textContent =
        question.description || "";
    }
  }

  async handleAnswer(answer) {
    if (this.hasAnswered) return;

    const question = this.questions[this.currentQuestionIndex];
    const isCorrect = this.checkAnswer(answer, question);

    this.hasAnswered = true;

    // Update player score
    if (isCorrect) {
      this.userScore += 50;
      this.currentStreak++;
    } else {
      this.currentStreak = 0;
    }

    // Update Firestore
    await this.updatePlayerScore();

    // Show results
    this.showResults(isCorrect, question.explanation);
  }

  checkAnswer(answer, question) {
    if (question.type === "dialogue") {
      // For dialogue questions, we need to check multiple answers
      // This is a simplified version - you'll need to implement the actual logic
      return answer === "safe"; // Placeholder
    }
    return answer === question.correctAnswer;
  }

  async updatePlayerScore() {
    try {
      const playerRef = doc(db, `rooms/${this.roomId}/players`, this.userId);
      await updateDoc(playerRef, {
        score: this.userScore,
        lastAnswer: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating player score:", error);
    }
  }

  showResults(isCorrect, explanation) {
    this.hideElement("questionContent");
    this.showElement("resultsState");

    const resultIcon = document.getElementById("resultIcon");
    const resultTitle = document.getElementById("resultTitle");
    const resultMessage = document.getElementById("resultMessage");
    const resultExplanation = document.getElementById("resultExplanation");
    const pointsEarned = document.getElementById("pointsEarned");
    const playersCorrect = document.getElementById("playersCorrect");

    if (isCorrect) {
      resultIcon.textContent = "✓";
      resultTitle.textContent = "إجابة صحيحة!";
      resultMessage.textContent = "لقد تعرفت بنجاح على محاولة الاحتيال.";
      resultTitle.className = "text-xl font-bold text-white mb-2";
    } else {
      resultIcon.textContent = "✗";
      resultTitle.textContent = "إجابة خاطئة";
      resultMessage.textContent = "كانت هذه محاولة احتيال.";
      resultTitle.className = "text-xl font-bold text-red-400 mb-2";
    }

    resultExplanation.textContent = explanation;
    pointsEarned.textContent = isCorrect ? "+50" : "+0";

    // Calculate how many players answered correctly (simplified)
    const correctPlayers = this.players.filter((p) => p.lastAnswer).length;
    playersCorrect.textContent = `${correctPlayers}/${this.players.length}`;

    // Move to next question after delay
    setTimeout(() => {
      this.nextQuestion();
    }, 3000);
  }

  async nextQuestion() {
    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.totalQuestions) {
      this.endGame();
    } else {
      // Update room's current question
      await updateDoc(doc(db, "rooms", this.roomId), {
        currentQuestion: this.currentQuestionIndex,
      });
    }
  }

  startTimer() {
    this.timer = 30;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      this.timer--;
      this.updateTimerDisplay();

      if (this.timer <= 0) {
        clearInterval(this.timerInterval);
        this.handleTimeUp();
      }
    }, 1000);
  }

  handleTimeUp() {
    if (!this.hasAnswered) {
      this.handleAnswer(""); // Force answer as wrong
    }
  }

  endGame() {
    clearInterval(this.timerInterval);

    // Update room status
    updateDoc(doc(db, "rooms", this.roomId), {
      status: "ended",
      endedAt: serverTimestamp(),
    });

    this.showGameOverModal();
  }

  showGameOverModal() {
    const modal = document.getElementById("gameOverModal");
    const finalScores = document.getElementById("finalScores");

    // Sort players by score
    const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);

    finalScores.innerHTML = sortedPlayers
      .map(
        (player, index) => `
      <div class="flex items-center justify-between ${
        index === 0 ? "text-yellow-400" : "text-white"
      }">
        <div class="flex items-center gap-3">
          <span class="font-bold">${index + 1}.</span>
          <span>${player.displayName}</span>
          ${player.isHost ? '<span class="text-yellow-400">👑</span>' : ""}
        </div>
        <span class="font-bold">${player.score} نقطة</span>
      </div>
    `
      )
      .join("");

    modal.classList.remove("hidden");
  }

  // Helper methods for UI management
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
    this.hideElement("submitDialogue");
  }

  updateQuestionProgress() {
    document.getElementById("currentQuestion").textContent =
      this.currentQuestionIndex + 1;
    document.getElementById("totalQuestions").textContent = this.totalQuestions;
  }

  updateDifficultyIndicator(difficulty) {
    const stars = document.querySelectorAll(".difficulty-star");
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

  updateTimerDisplay() {
    const timerElement = document.getElementById("timer");
    if (timerElement) {
      timerElement.textContent = this.timer;
      timerElement.className = `text-2xl font-bold ${
        this.timer <= 10 ? "text-red-400 animate-pulse" : "text-white"
      }`;
    }
  }

  updatePlayersStatus() {
    const playersList = document.getElementById("playersList");
    if (!playersList) return;

    playersList.innerHTML = this.players
      .map(
        (player) => `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full ${
            player.isReady ? "bg-green-500" : "bg-yellow-500"
          }"></div>
          <span class="text-white">${player.displayName}</span>
          ${player.isHost ? '<span class="text-yellow-400">👑</span>' : ""}
        </div>
        <span class="text-blue-200">${player.score || 0}</span>
      </div>
    `
      )
      .join("");
  }

  getQuizTypeName(quizType) {
    const types = {
      sms: "رسائل SMS",
      dialogue: "حوارات",
      image: "صور مشبوهة",
      mixed: "كوكتيل أسئلة",
    };
    return types[quizType] || quizType;
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
      loadingOverlay.style.display = "none";
    }
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

  showError(message) {
    // Replace alert with a better error display
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
      // Redirect to dashboard after error
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    }, 5000);
  }

  showToast(message, type = "info") {
    // Implement toast notification
    console.log(`${type}: ${message}`);
  }

  generateSampleQuestions() {
    // Generate sample questions if API fails
    return [
      {
        id: 1,
        type: "sms",
        content:
          "عزيزي العميل، لديك رصيد مجاني 10 دينار. لاستلامه اضغط على الرابط: bit.ly/free-balance",
        sender: "اتصالات",
        timestamp: "الآن",
        correctAnswer: "phishing",
        difficulty: 2,
        explanation: "هذه رسالة تصيد تحتوي على رابط مختصر مشبوه",
      },
      {
        id: 2,
        type: "dialogue",
        messages: [
          {
            text: "مرحباً، أنا من شركة Microsoft ولدينا مشكلة في حسابك",
            isUser: false,
            time: "10:30 ص",
          },
          {
            text: "ما هي المشكلة؟",
            isUser: true,
            time: "10:31 ص",
          },
        ],
        correctAnswers: ["phishing"],
        difficulty: 3,
        explanation: "شركة Microsoft لا تتصل بالعملاء بهذه الطريقة",
      },
    ];
  }
}

// Initialize the game when the page loads
document.addEventListener("DOMContentLoaded", () => {
  // Check if user is authenticated
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "newlogin.html";
      return;
    }

    new RoomGame();
  });
});
