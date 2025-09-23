// room-game.js - Reliable version with comprehensive error handling
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
  runTransaction,
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
    this.isInitialized = false;
    this.isGameActive = false;

    // Error tracking
    this.errorCount = 0;
    this.maxErrorCount = 5;

    this.init();
  }

  async init() {
    try {
      console.log("🚀 Initializing RoomGame...");

      // Validate authentication first
      if (!auth.currentUser) {
        this.showError("يجب تسجيل الدخول أولاً", true);
        return;
      }

      this.userId = auth.currentUser.uid;

      // Get room ID from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      this.roomId = urlParams.get("roomId");

      console.log("📋 Room ID from URL:", this.roomId);
      console.log("👤 User ID:", this.userId);

      if (!this.roomId) {
        this.showError("معرف الغرفة غير موجود في الرابط", true);
        return;
      }

      // Validate room ID format (alphanumeric, 4-8 characters)
      if (!/^[a-zA-Z0-9]{4,8}$/.test(this.roomId)) {
        this.showError("معرف الغرفة غير صالح", true);
        return;
      }

      this.setupEventListeners();
      await this.loadRoomData();
      this.isInitialized = true;
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      this.showError("فشل تهيئة اللعبة: " + error.message, true);
    }
  }

  setupEventListeners() {
    console.log("🔗 Setting up event listeners...");

    // Remove any existing listeners first
    this.removeEventListeners();

    // Answer button listeners with debouncing
    this.setupButtonWithDebounce("safeBtn", () => this.handleAnswer("safe"));
    this.setupButtonWithDebounce("phishingBtn", () =>
      this.handleAnswer("phishing")
    );
    this.setupButtonWithDebounce("submitDialogueBtn", () =>
      this.handleDialogueSubmission()
    );

    // Game over modal buttons
    this.setupButtonWithDebounce("playAgainBtn", () => {
      window.location.href = `room.html?roomId=${this.roomId}`;
    });

    this.setupButtonWithDebounce("closeModalBtn", () => {
      window.location.href = "dashboard.html";
    });

    // Handle page visibility changes
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    // Handle beforeunload
    window.addEventListener("beforeunload", this.handleBeforeUnload.bind(this));
  }

  setupButtonWithDebounce(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (!button) {
      console.warn(`Button ${buttonId} not found`);
      return;
    }

    let isProcessing = false;

    button.addEventListener("click", async () => {
      if (isProcessing) return;

      isProcessing = true;
      button.disabled = true;

      try {
        await handler();
      } catch (error) {
        console.error(`Error in ${buttonId} handler:`, error);
        this.showError("حدث خطأ أثناء المعالجة");
      } finally {
        setTimeout(() => {
          isProcessing = false;
          button.disabled = false;
        }, 500);
      }
    });
  }

  removeEventListeners() {
    // Clean up any existing listeners if reinitializing
    const buttons = [
      "safeBtn",
      "phishingBtn",
      "submitDialogueBtn",
      "playAgainBtn",
      "closeModalBtn",
    ];
    buttons.forEach((btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.replaceWith(btn.cloneNode(true));
      }
    });
  }

  async loadRoomData() {
    try {
      console.log("📥 Loading room data for room:", this.roomId);
      this.showLoading("جاري تحميل بيانات الغرفة...");

      const roomRef = doc(db, "rooms", this.roomId);
      const roomDoc = await this.withRetry(() => getDoc(roomRef), 3);

      if (!roomDoc.exists()) {
        this.showError("لم يتم العثور على الغرفة في قاعدة البيانات", true);
        return;
      }

      this.roomData = roomDoc.data();
      console.log("✅ Room data loaded:", this.roomData);

      // Validate room data
      if (!this.validateRoomData(this.roomData)) {
        this.showError("بيانات الغرفة غير صالحة", true);
        return;
      }

      this.quizType = this.roomData.quizType || "mixed";
      this.totalQuestions = Math.max(
        1,
        Math.min(this.roomData.questionCount || 10, 20)
      ); // Limit 1-20 questions
      this.isHost = this.roomData.hostId === this.userId;

      // Check if user is in the room
      if (!(await this.isUserInRoom())) {
        this.showError("أنت لست عضوًا في هذه الغرفة", true);
        return;
      }

      // Update UI with room info
      this.updateRoomInfo();

      // Setup real-time listeners
      this.setupRealtimeListeners();

      // Load questions
      await this.loadQuestions();

      this.hideLoading();

      // Handle game state
      if (this.roomData.status === "started") {
        await this.startGame();
      } else {
        this.showWaitingMessage("بانتظار بدء اللعبة من قبل المضيف...");
      }
    } catch (error) {
      console.error("❌ Error loading room data:", error);
      this.showError("فشل تحميل بيانات الغرفة: " + error.message, true);
    }
  }

  validateRoomData(roomData) {
    const requiredFields = ["roomName", "hostId", "status", "createdAt"];
    for (const field of requiredFields) {
      if (!roomData[field]) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }

    if (!["waiting", "started", "ended"].includes(roomData.status)) {
      console.error("Invalid room status:", roomData.status);
      return false;
    }

    return true;
  }

  async isUserInRoom() {
    try {
      const playerRef = doc(db, `rooms/${this.roomId}/players`, this.userId);
      const playerDoc = await getDoc(playerRef);
      return playerDoc.exists();
    } catch (error) {
      console.error("Error checking user in room:", error);
      return false;
    }
  }

  setupRealtimeListeners() {
    // Clean up existing listeners
    if (this.roomListener) this.roomListener();
    if (this.playersListener) this.playersListener();

    // Listen to room changes
    this.roomListener = onSnapshot(
      doc(db, "rooms", this.roomId),
      (doc) => {
        if (doc.exists()) {
          const newData = doc.data();
          console.log("🔄 Room updated:", newData);
          this.handleRoomUpdate(newData);
        }
      },
      (error) => {
        console.error("❌ Error listening to room:", error);
        this.handleListenerError(error, "room");
      }
    );

    // Listen to players changes
    this.playersListener = onSnapshot(
      collection(db, `rooms/${this.roomId}/players`),
      (snapshot) => {
        this.players = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log("👥 Players updated:", this.players.length);
        this.updatePlayersStatus();
      },
      (error) => {
        console.error("❌ Error listening to players:", error);
        this.handleListenerError(error, "players");
      }
    );
  }

  handleListenerError(error, listenerType) {
    this.errorCount++;
    console.error(`Listener error (${listenerType}):`, error);

    if (this.errorCount >= this.maxErrorCount) {
      this.showError("فقدان الاتصال بالخادم. جاري إعادة المحاولة...");
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }

  async loadQuestions() {
    try {
      console.log("📚 Loading questions...");
      this.showLoading("جاري تحميل الأسئلة...");

      // Try GitHub first, then fallback
      await this.loadQuestionsFromGitHub();

      // Validate we have enough questions
      if (this.questions.length < this.totalQuestions) {
        console.warn(
          `Only got ${this.questions.length} questions, need ${this.totalQuestions}. Using fallback.`
        );
        await this.loadFallbackQuestions();
      }

      console.log(`✅ Loaded ${this.questions.length} questions`);
    } catch (error) {
      console.error("❌ Error loading questions:", error);
      await this.loadFallbackQuestions();
    }
  }

  async loadQuestionsFromGitHub() {
    const cacheBuster = Date.now();
    const endpoints = {
      sms: `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=${cacheBuster}`,
      dialogue: `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=${cacheBuster}`,
      image: `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=${cacheBuster}`,
    };

    try {
      const responses = await Promise.allSettled([
        fetch(endpoints.sms, { timeout: 10000 }),
        fetch(endpoints.dialogue, { timeout: 10000 }),
        fetch(endpoints.image, { timeout: 10000 }),
      ]);

      const [smsResult, dialogueResult, imageResult] = responses;
      const questions = [];

      // Process each response
      if (smsResult.status === "fulfilled" && smsResult.value.ok) {
        const smsData = await smsResult.value.json();
        questions.push(...this.transformSMSQuestions(smsData));
      }

      if (dialogueResult.status === "fulfilled" && dialogueResult.value.ok) {
        const dialogueData = await dialogueResult.value.json();
        questions.push(...this.transformDialogueQuestions(dialogueData));
      }

      if (imageResult.status === "fulfilled" && imageResult.value.ok) {
        const imageData = await imageResult.value.json();
        questions.push(...this.transformImageQuestions(imageData));
      }

      // Filter and shuffle questions based on quiz type
      this.questions = this.filterAndShuffleQuestions(questions);
    } catch (error) {
      throw new Error(`GitHub load failed: ${error.message}`);
    }
  }

  transformSMSQuestions(smsData) {
    return (smsData || []).map((sms, index) => ({
      id: `sms-${index}-${Date.now()}`,
      type: "sms",
      content: sms.text || "لا يوجد محتوى",
      sender: sms.sender || "جهة مجهولة",
      timestamp: "الآن",
      correctAnswer: sms.isPhish ? "phishing" : "safe",
      difficulty: Math.max(1, Math.min(sms.difficulty || 2, 5)),
      explanation: sms.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  transformDialogueQuestions(dialogueData) {
    return (dialogueData || []).map((dialogue, index) => ({
      id: `dialogue-${index}-${Date.now()}`,
      type: "dialogue",
      messages: dialogue.messages || [],
      correctAnswer: dialogue.isPhish ? "phishing" : "safe",
      difficulty: Math.max(1, Math.min(dialogue.difficulty || 2, 5)),
      explanation: dialogue.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  transformImageQuestions(imageData) {
    return (imageData || []).map((image, index) => ({
      id: `image-${index}-${Date.now()}`,
      type: "image",
      imageUrl: image.url || "",
      description: image.description || "",
      correctAnswer: image.isPhish ? "phishing" : "safe",
      difficulty: Math.max(1, Math.min(image.difficulty || 2, 5)),
      explanation: image.explanation || "لا توجد تفاصيل إضافية",
    }));
  }

  filterAndShuffleQuestions(allQuestions) {
    // Filter by quiz type
    let filteredQuestions = allQuestions;
    if (this.quizType !== "mixed") {
      filteredQuestions = allQuestions.filter((q) => q.type === this.quizType);
    }

    // Shuffle and take exact count needed
    const shuffled = this.shuffleArray([...filteredQuestions]);
    return shuffled.slice(0, this.totalQuestions);
  }

  async loadFallbackQuestions() {
    console.log("🔄 Using fallback questions");
    this.questions = this.generateSampleQuestions().slice(
      0,
      this.totalQuestions
    );
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  handleRoomUpdate(newData) {
    try {
      this.roomData = newData;

      // Validate new data
      if (!this.validateRoomData(newData)) {
        console.error("Invalid room data received");
        return;
      }

      // Handle game state changes
      if (newData.status === "started" && !this.isGameActive) {
        this.startGame();
      } else if (newData.status === "ended" && this.isGameActive) {
        this.endGame();
      }

      // Handle question progression
      const newQuestionIndex = newData.currentQuestion || 0;
      if (newQuestionIndex !== this.currentQuestionIndex && this.isGameActive) {
        this.currentQuestionIndex = newQuestionIndex;
        this.loadQuestion();
      }

      this.updateRoomInfo();
    } catch (error) {
      console.error("Error handling room update:", error);
    }
  }

  async startGame() {
    try {
      console.log("🎮 Starting game...");
      this.isGameActive = true;
      this.currentQuestionIndex = this.roomData.currentQuestion || 0;

      // Validate we have questions
      if (this.questions.length === 0) {
        await this.loadQuestions();
      }

      await this.loadQuestion();
    } catch (error) {
      console.error("Error starting game:", error);
      this.showError("فشل بدء اللعبة");
    }
  }

  async loadQuestion() {
    if (!this.isGameActive) return;

    // Validate question index
    if (this.currentQuestionIndex >= this.questions.length) {
      await this.endGame();
      return;
    }

    const question = this.questions[this.currentQuestionIndex];
    if (!question) {
      console.error("Invalid question at index:", this.currentQuestionIndex);
      await this.nextQuestion();
      return;
    }

    this.hasAnswered = false;

    console.log(
      "📖 Loading question:",
      question.type,
      this.currentQuestionIndex
    );

    try {
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
          console.warn("Unknown question type:", question.type);
          this.showSMSQuestion(question);
          break;
      }

      this.updateQuestionProgress();
      this.updateDifficultyIndicator(question.difficulty);
    } catch (error) {
      console.error("Error loading question:", error);
      this.showError("فشل تحميل السؤال");
    }
  }

  showSMSQuestion(question) {
    this.showElement("smsQuestion");

    const elements = {
      smsContent: question.content,
      smsSender: question.sender,
      smsTimestamp: question.timestamp,
    };

    Object.entries(elements).forEach(([id, content]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = content;
    });
  }

  showDialogueQuestion(question) {
    this.showElement("dialogueQuestion");
    const messagesContainer = document.getElementById("dialogueMessages");

    if (messagesContainer) {
      messagesContainer.innerHTML = this.generateDialogueHTML(question);
    }

    this.showElement("submitDialogueBtn");
  }

  generateDialogueHTML(question) {
    const messages = question.messages || [];

    return `
      <div class="dialogue-container bg-white/5 rounded-lg p-4 max-h-80 overflow-y-auto">
        <div class="space-y-3">
          ${messages
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
                <p class="text-sm">${msg.text || "لا يوجد نص"}</p>
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
        <div class="space-y-2">
          ${messages
            .map(
              (msg, index) => `
            <label class="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
              <input type="checkbox" name="suspiciousMessage" value="${index}" 
                    class="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
              <div class="flex-1">
                <p class="text-white text-sm">${msg.text || "لا يوجد نص"}</p>
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

  async handleAnswer(answer) {
    if (this.hasAnswered || !this.isGameActive) {
      console.warn("Answer already submitted or game not active");
      return;
    }

    try {
      this.hasAnswered = true;
      const question = this.questions[this.currentQuestionIndex];

      if (!question) {
        throw new Error("Question not found");
      }

      const isCorrect = answer === question.correctAnswer;

      // Update score
      if (isCorrect) {
        this.userScore += 50;
        this.currentStreak++;
      } else {
        this.currentStreak = 0;
      }

      // Update Firestore
      await this.updatePlayerAnswer(answer, isCorrect);

      // Show results
      this.showResults(isCorrect, question.explanation);

      // Progress to next question after delay
      setTimeout(() => {
        this.nextQuestion();
      }, 1500);
    } catch (error) {
      console.error("Error handling answer:", error);
      this.hasAnswered = false; // Allow retry
      this.showError("فشل حفظ الإجابة");
    }
  }

  async updatePlayerAnswer(answer, isCorrect) {
    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, `rooms/${this.roomId}/players`, this.userId);
        const roomRef = doc(db, "rooms", this.roomId);

        // Update player document
        transaction.update(playerRef, {
          score: this.userScore,
          lastAnswer: serverTimestamp(),
          [`answers.${this.currentQuestionIndex}`]: {
            answer: answer,
            correct: isCorrect,
            timestamp: serverTimestamp(),
          },
        });

        // Update room scores
        transaction.update(roomRef, {
          [`scores.${this.userId}`]: this.userScore,
        });
      });
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  }

  handleDialogueSubmission() {
    // Simplified dialogue handling - you might want to enhance this
    const checkboxes = document.querySelectorAll(
      'input[name="suspiciousMessage"]:checked'
    );
    const hasSelection = checkboxes.length > 0;

    this.handleAnswer(hasSelection ? "phishing" : "safe");
  }

  showResults(isCorrect, explanation) {
    this.hideElement("questionContent");
    this.showElement("resultsState");

    const elements = {
      resultIcon: isCorrect ? "✓" : "✗",
      resultTitle: isCorrect ? "إجابة صحيحة!" : "إجابة خاطئة",
      resultMessage: isCorrect
        ? "لقد تعرفت بنجاح على محاولة الاحتيال."
        : "كانت هذه محاولة احتيال.",
      resultExplanation: explanation || "لا توجد تفاصيل إضافية",
      pointsEarned: isCorrect ? "+50" : "+0",
    };

    Object.entries(elements).forEach(([id, content]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = content;
    });

    // Update styling
    const resultTitle = document.getElementById("resultTitle");
    if (resultTitle) {
      resultTitle.className = `text-xl font-bold mb-2 ${
        isCorrect ? "text-green-400" : "text-red-400"
      }`;
    }
  }

  async nextQuestion() {
    if (!this.isGameActive) return;

    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.totalQuestions) {
      await this.endGame();
      return;
    }

    try {
      // Update room's current question
      await updateDoc(doc(db, "rooms", this.roomId), {
        currentQuestion: this.currentQuestionIndex,
      });

      // Note: loadQuestion will be triggered by the real-time listener
    } catch (error) {
      console.error("Error updating question:", error);
      // Try to continue anyway
      this.loadQuestion();
    }
  }

  async endGame() {
    if (!this.isGameActive) return;

    console.log("🏁 Game ended");
    this.isGameActive = false;

    try {
      // Update room status to ended
      await updateDoc(doc(db, "rooms", this.roomId), {
        status: "ended",
        endedAt: serverTimestamp(),
      });

      this.showGameOverModal();
    } catch (error) {
      console.error("Error ending game:", error);
      this.showGameOverModal(); // Show modal anyway
    }
  }

  showGameOverModal() {
    const modal = document.getElementById("gameOverModal");
    const finalScores = document.getElementById("finalScores");

    if (!modal || !finalScores) {
      console.error("Game over modal elements not found");
      return;
    }

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
          <span>${player.displayName || "مستخدم مجهول"}</span>
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

    // Clean up listeners
    this.cleanup();
  }

  // Utility methods
  showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.classList.remove("hidden");
  }

  hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.classList.add("hidden");
  }

  hideAllQuestionTypes() {
    [
      "smsQuestion",
      "dialogueQuestion",
      "imageQuestion",
      "submitDialogueBtn",
    ].forEach((id) => this.hideElement(id));
  }

  updateQuestionProgress() {
    const elements = {
      currentQuestion: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestions,
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  updateDifficultyIndicator(difficulty) {
    const stars = document.querySelectorAll(".difficulty-star");
    if (stars.length > 0) {
      stars.forEach((star, index) => {
        star.classList.toggle("text-yellow-400", index < difficulty);
        star.classList.toggle("text-gray-400", index >= difficulty);
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
          <span class="text-white text-sm">${
            player.displayName || "مجهول"
          }</span>
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

  updateRoomInfo() {
    const elements = {
      roomTitle: this.roomData?.roomName,
      roomCodeDisplay: `رمز: ${this.roomId}`,
      userPoints: this.userScore,
      currentStreak: this.currentStreak,
    };

    Object.entries(elements).forEach(([id, content]) => {
      const element = document.getElementById(id);
      if (element && content !== undefined) element.textContent = content;
    });
  }

  showLoading(message = "جاري التحميل...") {
    const loadingText = document.getElementById("loadingText");
    if (loadingText) loadingText.textContent = message;
    this.showElement("loadingState");
  }

  showWaitingMessage(message) {
    const waitingText = document.getElementById("waitingText");
    if (waitingText) waitingText.textContent = message;

    this.hideElement("loadingState");
    this.hideElement("questionContent");
    this.hideElement("resultsState");
    this.showElement("waitingState");
  }

  hideLoading() {
    this.hideElement("loadingState");
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) loadingOverlay.style.display = "none";
  }

  showError(message, isFatal = false) {
    console.error("Error:", message);

    const errorDiv = document.createElement("div");
    errorDiv.className =
      "fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded-lg z-50 max-w-md";
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
      if (isFatal) {
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 2000);
      }
    }, 5000);
  }

  // Retry utility
  async withRetry(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        console.warn(`Attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }

  // Event handlers for page lifecycle
  handleVisibilityChange() {
    if (document.hidden) {
      console.log("Page hidden");
    } else {
      console.log("Page visible");
      // Could add reconnection logic here
    }
  }

  handleBeforeUnload() {
    this.cleanup();
  }

  cleanup() {
    if (this.roomListener) {
      this.roomListener();
      this.roomListener = null;
    }
    if (this.playersListener) {
      this.playersListener();
      this.playersListener = null;
    }
  }

  generateSampleQuestions() {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `sample-${i}`,
      type: "sms",
      content: `عينة سؤال ${i + 1}: لديك رصيد مجاني. لاستلامه اضغط على الرابط`,
      sender: "اتصالات",
      timestamp: "الآن",
      correctAnswer: i % 2 === 0 ? "phishing" : "safe",
      difficulty: (i % 3) + 2,
      explanation: "هذا سؤال عينة لأغراض الاختبار",
    }));
  }
}

// Initialize the game when the page loads
document.addEventListener("DOMContentLoaded", () => {
  let gameInstance = null;

  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "newlogin.html";
      return;
    }

    // Only create one instance
    if (!gameInstance) {
      gameInstance = new RoomGame();
    }
  });
});
