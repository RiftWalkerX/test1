// room-game.js - Updated version
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
      this.quizType = this.roomData.quizType || "mixed";
      this.totalQuestions = this.roomData.questionCount || 10;

      // Update UI with room info
      this.updateRoomInfo();

      // Load questions based on quiz type
      await this.loadQuestions();

      // Hide loading overlay
      this.hideLoading();

      // Start the game if it's already started
      if (this.roomData.status === "started") {
        this.startGame();
      }
    } catch (error) {
      console.error("Error loading room data:", error);
      this.showError("فشل تحميل بيانات الغرفة");
    }
  }

  async loadQuestions() {
    try {
      const now = Date.now();
      let questions = [];

      // Load questions based on quiz type
      switch (this.quizType) {
        case "sms":
          questions = await this.loadSMSQuestions(now);
          break;
        case "dialogue":
          questions = await this.loadDialogueQuestions(now);
          break;
        case "image":
          questions = await this.loadImageQuestions(now);
          break;
        case "mixed":
        default:
          questions = await this.loadMixedQuestions(now);
          break;
      }

      this.questions = questions.slice(0, this.totalQuestions);

      if (this.questions.length === 0) {
        this.questions = this.generateSampleQuestions();
        this.showToast("تم استخدام أسئلة تجريبية", "warning");
      }
    } catch (error) {
      console.error("Error loading questions:", error);
      this.questions = this.generateSampleQuestions();
      this.showToast(
        "تم استخدام أسئلة تجريبية بسبب مشكلة في التحميل",
        "warning"
      );
    }
  }

  async loadSMSQuestions(timestamp) {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=${timestamp}`
    );
    if (!response.ok) throw new Error("Failed to fetch SMS questions");

    const data = await response.json();
    return data.map((sms, index) => ({
      id: index + 1,
      type: "sms",
      content: sms.text,
      sender: sms.sender || "جهة مجهولة",
      timestamp: "الآن",
      correctAnswer: sms.isPhish ? "phishing" : "safe",
      difficulty: sms.difficulty || 2,
      explanation: sms.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  async loadDialogueQuestions(timestamp) {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=${timestamp}`
    );
    if (!response.ok) throw new Error("Failed to fetch dialogue questions");

    const data = await response.json();
    return data.map((dialogue, index) => ({
      id: index + 1,
      type: "dialogue",
      messages: dialogue.messages || [],
      correctAnswers: dialogue.correctAnswers || [],
      difficulty: dialogue.difficulty || 2,
      explanation: dialogue.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  async loadImageQuestions(timestamp) {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=${timestamp}`
    );
    if (!response.ok) throw new Error("Failed to fetch image questions");

    const data = await response.json();
    return data.map((image, index) => ({
      id: index + 1,
      type: "image",
      imageUrl: image.url,
      description: image.description || "",
      correctAnswer: image.isPhish ? "phishing" : "safe",
      difficulty: image.difficulty || 2,
      explanation: image.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  async loadMixedQuestions(timestamp) {
    const [smsQuestions, dialogueQuestions, imageQuestions] = await Promise.all(
      [
        this.loadSMSQuestions(timestamp).catch(() => []),
        this.loadDialogueQuestions(timestamp).catch(() => []),
        this.loadImageQuestions(timestamp).catch(() => []),
      ]
    );

    // Combine and shuffle questions
    const allQuestions = [
      ...smsQuestions,
      ...dialogueQuestions,
      ...imageQuestions,
    ];
    return this.shuffleArray(allQuestions);
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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
    if (newData.currentQuestion !== this.currentQuestionIndex) {
      this.currentQuestionIndex = newData.currentQuestion;
      if (this.roomData.status === "started") {
        this.loadQuestion();
      }
    }

    this.updateRoomInfo();
  }

  startGame() {
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
    }

    this.updateQuestionProgress();
    this.updateDifficultyIndicator(question.difficulty);
  }

  showSMSQuestion(question) {
    this.showElement("smsQuestion");
    document.getElementById("smsContent").textContent = question.content;
    document.getElementById("smsSender").textContent = question.sender;
    document.getElementById("smsTimestamp").textContent = question.timestamp;
  }

  showDialogueQuestion(question) {
    this.showElement("dialogueQuestion");
    const messagesContainer = document.getElementById("dialogueMessages");
    messagesContainer.innerHTML = "";

    question.messages.forEach((msg, index) => {
      const messageElement = document.createElement("div");
      messageElement.className = `flex ${
        msg.isUser ? "justify-start" : "justify-end"
      }`;
      messageElement.innerHTML = `
        <div class="max-w-xs bg-white/10 rounded-lg p-3">
          <p class="text-white">${msg.text}</p>
          <p class="text-blue-200 text-xs mt-1">${msg.time}</p>
        </div>
      `;
      messagesContainer.appendChild(messageElement);
    });

    // Show submit button for dialogue questions
    this.showElement("submitDialogue");
  }

  showImageQuestion(question) {
    this.showElement("imageQuestion");
    const imgElement = document.getElementById("questionImage");
    imgElement.src = question.imageUrl;
    imgElement.alt = question.description;
    document.getElementById("imageDescription").textContent =
      question.description;
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

  updateRoomInfo() {
    document.getElementById("roomName").textContent =
      this.roomData?.roomName || "غرفة التدريب";
    document.getElementById("quizType").textContent = this.getQuizTypeName(
      this.quizType
    );
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
    document.getElementById("loadingOverlay")?.classList.add("hidden");
  }

  showError(message) {
    alert(message);
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
  new RoomGame();
});
