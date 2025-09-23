// room-game.js - Multiplayer room game implementation
import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc, // Add this import
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Game state management
let currentRoomId = null;
let currentUser = null;
let gameState = {
  currentQuestion: 0,
  totalQuestions: 10,
  score: 0,
  players: [],
  questions: [],
  quizType: "mixed",
  timer: 30,
  timerInterval: null,
  hasAnswered: false,
};

// DOM elements
let questionContainer,
  loadingState,
  questionContent,
  waitingState,
  resultsState;
let safeBtn, phishingBtn, submitDialogueBtn;
let timerElement, userPointsElement, currentStreakElement;
let playersListElement, currentQuestionElement, totalQuestionsElement;
let roomTitleElement, roomCodeDisplayElement;

// Initialize the game
document.addEventListener("DOMContentLoaded", async function () {
  await initializeGame();
});

async function initializeGame() {
  // Get room ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  currentRoomId = urlParams.get("roomId");

  if (!currentRoomId) {
    console.error("No room ID provided");
    showError("لم يتم العثور على معرف الغرفة");
    return;
  }

  // Wait for auth to be ready
  currentUser = auth.currentUser;
  if (!currentUser) {
    // Listen for auth state change
    auth.onAuthStateChanged((user) => {
      if (user) {
        currentUser = user;
        loadGame();
      } else {
        window.location.href = "newlogin.html";
      }
    });
  } else {
    loadGame();
  }
}

async function loadGame() {
  try {
    // Show loading overlay
    document.getElementById("loadingOverlay").classList.remove("hidden");

    // Cache DOM elements
    cacheDOMElements();

    // Load room data
    await loadRoomData();

    // Set up real-time listeners
    setupRoomListeners();

    // Hide loading overlay
    document.getElementById("loadingOverlay").classList.add("hidden");
  } catch (error) {
    console.error("Error loading game:", error);
    showError("فشل في تحميل اللعبة: " + error.message);
  }
}

function cacheDOMElements() {
  questionContainer = document.getElementById("questionContainer");
  loadingState = document.getElementById("loadingState");
  questionContent = document.getElementById("questionContent");
  waitingState = document.getElementById("waitingState");
  resultsState = document.getElementById("resultsState");

  safeBtn = document.getElementById("safeBtn");
  phishingBtn = document.getElementById("phishingBtn");
  submitDialogueBtn = document.getElementById("submitDialogueBtn");

  timerElement = document.getElementById("timer");
  userPointsElement = document.getElementById("userPoints");
  currentStreakElement = document.getElementById("currentStreak");

  playersListElement = document.getElementById("playersList");
  currentQuestionElement = document.getElementById("currentQuestion");
  totalQuestionsElement = document.getElementById("totalQuestions");

  roomTitleElement = document.getElementById("roomTitle");
  roomCodeDisplayElement = document.getElementById("roomCodeDisplay");
}

async function loadRoomData() {
  const roomRef = doc(db, "rooms", currentRoomId);
  const roomDoc = await getDoc(roomRef);

  if (!roomDoc.exists()) {
    throw new Error("الغرفة غير موجودة");
  }

  const roomData = roomDoc.data();
  gameState.quizType = roomData.quizType || "mixed";
  gameState.totalQuestions = roomData.questionCount || 10;
  gameState.players = roomData.players || [];

  // Update UI with room info
  if (roomTitleElement)
    roomTitleElement.textContent = roomData.roomName || "غرفة التدريب";
  if (roomCodeDisplayElement)
    roomCodeDisplayElement.textContent = `رمز: ${currentRoomId}`;
  if (totalQuestionsElement)
    totalQuestionsElement.textContent = gameState.totalQuestions;

  // Load questions for this room
  await loadQuestions();
}

async function loadQuestions() {
  try {
    // Check if questions already exist in the room
    const questionsRef = collection(db, `rooms/${currentRoomId}/questions`);
    const questionsQuery = query(questionsRef, orderBy("order", "asc"));
    const questionsSnapshot = await getDocs(questionsQuery);

    if (!questionsSnapshot.empty) {
      // Questions already exist, use them
      gameState.questions = questionsSnapshot.docs.map((doc) => doc.data());
      console.log("Loaded existing questions:", gameState.questions.length);
    } else {
      // Generate new questions based on quiz type
      gameState.questions = await generateQuestions(
        gameState.quizType,
        gameState.totalQuestions
      );
      console.log("Generated new questions:", gameState.questions.length);
    }

    // Start the game if it's already in progress
    const roomRef = doc(db, "rooms", currentRoomId);
    const roomDoc = await getDoc(roomRef);
    const roomData = roomDoc.data();

    if (
      roomData.status === "started" &&
      roomData.currentQuestion !== undefined
    ) {
      gameState.currentQuestion = roomData.currentQuestion;
      loadCurrentQuestion();
    } else {
      // Wait for game to start
      showWaitingState("بانتظار بدء اللعبة من قبل المضيف...");
    }
  } catch (error) {
    console.error("Error loading questions:", error);
    throw new Error("فشل في تحميل الأسئلة");
  }
}

async function generateQuestions(quizType, count) {
  const timestamp = Date.now();
  let allQuestions = [];

  try {
    // Fetch questions based on quiz type
    if (quizType === "sms" || quizType === "mixed") {
      const smsQuestions = await fetchSMSQuestions(timestamp);
      allQuestions = allQuestions.concat(smsQuestions);
    }

    if (quizType === "dialogue" || quizType === "mixed") {
      const dialogueQuestions = await fetchDialogueQuestions(timestamp);
      allQuestions = allQuestions.concat(dialogueQuestions);
    }

    if (quizType === "image" || quizType === "mixed") {
      const imageQuestions = await fetchImageQuestions(timestamp);
      allQuestions = allQuestions.concat(imageQuestions);
    }

    // If we don't have enough questions, create fallback questions
    if (allQuestions.length < count) {
      const fallbackQuestions = generateFallbackQuestions(
        count - allQuestions.length
      );
      allQuestions = allQuestions.concat(fallbackQuestions);
    }

    // Shuffle and take the required number
    allQuestions = shuffleArray(allQuestions).slice(0, count);

    return allQuestions;
  } catch (error) {
    console.error("Error generating questions:", error);
    // Return fallback questions if fetching fails
    return generateFallbackQuestions(count);
  }
}

async function fetchSMSQuestions(timestamp) {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=${timestamp}`
    );

    if (!response.ok) throw new Error("Failed to fetch SMS questions");

    const data = await response.json();
    return data.map((sms, index) => ({
      id: `sms-${index}`,
      type: "sms",
      content: sms.text,
      sender: sms.sender || "جهة مجهولة",
      timestamp: "الآن",
      correctAnswer: sms.isPhish ? "phishing" : "safe",
      difficulty: sms.difficulty || 2,
      explanation: sms.explanation || "لا توجد تفاصيل إضافية",
    }));
  } catch (error) {
    console.error("Error fetching SMS questions:", error);
    return [];
  }
}

async function fetchDialogueQuestions(timestamp) {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=${timestamp}`
    );

    if (!response.ok) throw new Error("Failed to fetch dialogue questions");

    const data = await response.json();
    return data.map((dialogue, index) => ({
      id: `dialogue-${index}`,
      type: "dialogue",
      messages: dialogue.messages || [],
      correctAnswers: dialogue.correctAnswers || [],
      difficulty: dialogue.difficulty || 2,
      explanation: dialogue.explanation || "لا توجد تفاصيل إضافية",
    }));
  } catch (error) {
    console.error("Error fetching dialogue questions:", error);
    return [];
  }
}

async function fetchImageQuestions(timestamp) {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=${timestamp}`
    );

    if (!response.ok) throw new Error("Failed to fetch image questions");

    const data = await response.json();
    return data.map((image, index) => ({
      id: `image-${index}`,
      type: "image",
      imageUrl: image.url,
      description: image.description || "",
      correctAnswer: image.isPhish ? "phishing" : "safe",
      difficulty: image.difficulty || 2,
      explanation: image.explanation || "لا توجد تفاصيل إضافية",
    }));
  } catch (error) {
    console.error("Error fetching image questions:", error);
    return [];
  }
}

function generateFallbackQuestions(count) {
  const questions = [];

  for (let i = 0; i < count; i++) {
    const isPhishing = Math.random() > 0.5;

    questions.push({
      id: `fallback-${i}`,
      type: "sms",
      content: isPhishing
        ? "مبروك! فزت بجائزة 10000 دينار. اضغط هنا لاستلام جائزتك: winprize.com"
        : "إشعار من البنك: تمت عملية سحب بمبلغ 500 دينار. إذا لم تكن أنت، اتصل بنا فوراً على 198",
      sender: isPhishing ? "مسابقة" : "البنك الأهلي",
      timestamp: "الآن",
      correctAnswer: isPhishing ? "phishing" : "safe",
      difficulty: 1,
      explanation: isPhishing
        ? "عروض الجوائز الفورية غالباً ما تكون محاولات احتيال"
        : "هذه رسالة أمنة من البنك تحتوي على رقم خدمة عملاء معروف",
    });
  }

  return questions;
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function setupRoomListeners() {
  // Listen for room updates
  const roomRef = doc(db, "rooms", currentRoomId);
  onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      const roomData = doc.data();
      handleRoomUpdate(roomData);
    }
  });

  // Listen for player answers
  const answersRef = collection(db, `rooms/${currentRoomId}/answers`);
  onSnapshot(answersRef, (snapshot) => {
    updatePlayersList();
  });
}

function handleRoomUpdate(roomData) {
  // Update game state
  gameState.currentQuestion = roomData.currentQuestion || 0;
  gameState.players = roomData.players || [];

  // Update UI
  updatePlayersList();

  if (currentQuestionElement) {
    currentQuestionElement.textContent = gameState.currentQuestion + 1;
  }

  // Handle game status changes
  if (
    roomData.status === "started" &&
    gameState.currentQuestion < gameState.questions.length
  ) {
    loadCurrentQuestion();
  } else if (roomData.status === "ended") {
    showGameOver();
  } else if (roomData.status === "waiting") {
    showWaitingState("بانتظار بدء اللعبة من قبل المضيف...");
  }
}

function updatePlayersList() {
  if (!playersListElement) return;

  playersListElement.innerHTML = "";

  gameState.players.forEach((player) => {
    const playerElement = document.createElement("div");
    playerElement.className =
      "flex items-center gap-3 bg-white/5 rounded-lg p-3";

    playerElement.innerHTML = `
      <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
        <span class="text-white font-bold">${
          player.displayName?.charAt(0) || "?"
        }</span>
      </div>
      <div class="flex-1">
        <p class="text-white font-medium">${player.displayName}</p>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${
            player.isReady ? "bg-green-500" : "bg-yellow-500"
          }"></span>
          <span class="text-blue-200 text-xs">${
            player.isReady ? "مستعد" : "في انتظار"
          }</span>
          ${
            player.isHost
              ? '<span class="text-yellow-400 text-xs">👑 المضيف</span>'
              : ""
          }
        </div>
      </div>
      <div class="text-blue-200 text-sm">
        ${player.score || 0} نقطة
      </div>
    `;

    playersListElement.appendChild(playerElement);
  });
}

function loadCurrentQuestion() {
  if (gameState.currentQuestion >= gameState.questions.length) {
    showGameOver();
    return;
  }

  const question = gameState.questions[gameState.currentQuestion];
  if (!question) {
    console.error("Question not found:", gameState.currentQuestion);
    return;
  }

  // Reset game state for new question
  gameState.hasAnswered = false;
  gameState.timer = 30;

  // Update timer display
  if (timerElement) timerElement.textContent = gameState.timer;

  // Show question content
  loadingState.classList.add("hidden");
  questionContent.classList.remove("hidden");
  waitingState.classList.add("hidden");
  resultsState.classList.add("hidden");

  // Hide all question types first
  document.getElementById("smsQuestion").classList.add("hidden");
  document.getElementById("dialogueQuestion").classList.add("hidden");
  document.getElementById("imageQuestion").classList.add("hidden");

  // Show appropriate question type
  if (question.type === "sms") {
    loadSMSQuestion(question);
  } else if (question.type === "dialogue") {
    loadDialogueQuestion(question);
  } else if (question.type === "image") {
    loadImageQuestion(question);
  }

  // Update difficulty indicator
  updateDifficultyIndicator(question.difficulty);

  // Start timer
  startTimer();

  // Set up answer buttons
  setupAnswerButtons(question);
}

function loadSMSQuestion(question) {
  const smsQuestion = document.getElementById("smsQuestion");
  smsQuestion.classList.remove("hidden");

  document.getElementById("smsContent").textContent = question.content;
  document.getElementById("smsSender").textContent = question.sender;
  document.getElementById("smsTimestamp").textContent = question.timestamp;
}

function loadDialogueQuestion(question) {
  const dialogueQuestion = document.getElementById("dialogueQuestion");
  dialogueQuestion.classList.remove("hidden");

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
          <div class="bg-white/10 rounded-lg p-3">
            <p class="text-white text-sm">${escapeHtml(message.text)}</p>
          </div>
        </div>
      </div>
    `;

    messagesContainer.appendChild(messageElement);
  });

  // Show submit button for dialogue questions
  submitDialogueBtn.classList.remove("hidden");
}

function loadImageQuestion(question) {
  const imageQuestion = document.getElementById("imageQuestion");
  imageQuestion.classList.remove("hidden");

  const imageElement = document.getElementById("questionImage");
  const descriptionElement = document.getElementById("imageDescription");

  if (imageElement && question.imageUrl) {
    imageElement.src = question.imageUrl;
    imageElement.onerror = function () {
      this.src =
        "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
    };
  }

  if (descriptionElement) {
    descriptionElement.textContent = question.description;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateDifficultyIndicator(difficulty) {
  const stars = document.querySelectorAll(".difficulty-star");
  const labels = ["سهل", "متوسط", "صعب", "خبير", "متقدم"];

  stars.forEach((star, index) => {
    if (index < difficulty) {
      star.classList.add("text-yellow-400");
      star.classList.remove("text-gray-400");
    } else {
      star.classList.remove("text-yellow-400");
      star.classList.add("text-gray-400");
    }
  });

  const difficultyLabel =
    document.querySelector("#difficultyStars").nextElementSibling;
  if (difficultyLabel) {
    difficultyLabel.textContent = labels[difficulty - 1] || "متوسط";
  }
}

function setupAnswerButtons(question) {
  // Remove existing event listeners
  const newSafeBtn = safeBtn.cloneNode(true);
  const newPhishingBtn = phishingBtn.cloneNode(true);

  safeBtn.parentNode.replaceChild(newSafeBtn, safeBtn);
  phishingBtn.parentNode.replaceChild(newPhishingBtn, phishingBtn);

  safeBtn = newSafeBtn;
  phishingBtn = newPhishingBtn;

  // Add new event listeners
  safeBtn.addEventListener("click", () => handleAnswer("safe", question));
  phishingBtn.addEventListener("click", () =>
    handleAnswer("phishing", question)
  );

  // For dialogue questions, use the submit button
  if (question.type === "dialogue") {
    const newSubmitBtn = submitDialogueBtn.cloneNode(true);
    submitDialogueBtn.parentNode.replaceChild(newSubmitBtn, submitDialogueBtn);
    submitDialogueBtn = newSubmitBtn;

    submitDialogueBtn.addEventListener("click", () =>
      handleDialogueAnswer(question)
    );
  } else {
    submitDialogueBtn.classList.add("hidden");
  }
}

function startTimer() {
  // Clear existing timer
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
  }

  gameState.timerInterval = setInterval(() => {
    gameState.timer--;

    if (timerElement) {
      timerElement.textContent = gameState.timer;
    }

    if (gameState.timer <= 0) {
      clearInterval(gameState.timerInterval);

      // Auto-submit if player hasn't answered
      if (!gameState.hasAnswered) {
        handleAnswer("timeout", gameState.questions[gameState.currentQuestion]);
      }
    }
  }, 1000);
}

async function handleAnswer(answer, question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  clearInterval(gameState.timerInterval);

  // Disable answer buttons immediately
  safeBtn.disabled = true;
  phishingBtn.disabled = true;
  submitDialogueBtn.disabled = true;

  try {
    // Calculate if answer is correct
    const isCorrect = answer === question.correctAnswer;

    // Update player score
    if (isCorrect) {
      gameState.score += 50;

      // Update streak
      const currentStreak = parseInt(currentStreakElement.textContent) || 0;
      currentStreakElement.textContent = currentStreak + 1;

      // Update points
      const currentPoints = parseInt(userPointsElement.textContent) || 0;
      userPointsElement.textContent = currentPoints + 50;
    }

    // Save answer to Firestore
    await saveAnswer(answer, isCorrect);

    // Show waiting state for other players
    showWaitingState("بانتظار إجابات اللاعبين الآخرين...");
  } catch (error) {
    console.error("Error handling answer:", error);
    // Even if saving fails, continue to waiting state
    showWaitingState("بانتظار إجابات اللاعبين الآخرين...");
  }
}

async function handleDialogueAnswer(question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  clearInterval(gameState.timerInterval);

  try {
    // For dialogue questions, we need to check each message
    // This is a simplified version - you might want to implement a more complex checking mechanism
    const isCorrect = Math.random() > 0.5; // Placeholder logic

    // Update player score
    if (isCorrect) {
      gameState.score += 50;

      // Update streak
      const currentStreak = parseInt(currentStreakElement.textContent) || 0;
      currentStreakElement.textContent = currentStreak + 1;

      // Update points
      const currentPoints = parseInt(userPointsElement.textContent) || 0;
      userPointsElement.textContent = currentPoints + 50;
    }

    // Save answer to Firestore
    await saveAnswer("dialogue", isCorrect);

    // Show waiting state for other players
    showWaitingState("بانتظار إجابات اللاعبين الآخرين...");
  } catch (error) {
    console.error("Error handling dialogue answer:", error);
    showWaitingState("بانتظار إجابات اللاعبين الآخرين...");
  }
}

async function saveAnswer(answer, isCorrect) {
  try {
    const answersRef = collection(db, `rooms/${currentRoomId}/answers`);

    // Create a document for this question's answer
    const answerDoc = doc(
      answersRef,
      `${currentUser.uid}_${gameState.currentQuestion}`
    );

    // Use updateDoc with merge to create the document if it doesn't exist
    await updateDoc(answerDoc, {
      userId: currentUser.uid,
      userName: currentUser.displayName || "لاعب",
      questionIndex: gameState.currentQuestion,
      answer: answer,
      isCorrect: isCorrect,
      timestamp: serverTimestamp(),
    });
    // Also update the player's score in the room
    const roomRef = doc(db, "rooms", currentRoomId);
    const roomDoc = await getDoc(roomRef);

    if (roomDoc.exists()) {
      const roomData = roomDoc.data();
      const updatedPlayers = roomData.players.map((player) => {
        if (player.uid === currentUser.uid) {
          return {
            ...player,
            score: (player.score || 0) + (isCorrect ? 50 : 0),
          };
        }
        return player;
      });

      await updateDoc(roomRef, {
        players: updatedPlayers,
      });
    }
  } catch (error) {
    console.error("Error saving answer:", error);
  }
}

function showWaitingState(message) {
  loadingState.classList.add("hidden");
  questionContent.classList.add("hidden");
  waitingState.classList.remove("hidden");
  resultsState.classList.add("hidden");

  const waitingText = document.getElementById("waitingText");
  if (waitingText) waitingText.textContent = message;
}

function showResults() {
  // This would show results for the current question
  // Implementation depends on how you want to display results
  console.log("Showing results for question", gameState.currentQuestion);
}

function showGameOver() {
  // Show game over modal with final scores
  const gameOverModal = document.getElementById("gameOverModal");
  const finalScores = document.getElementById("finalScores");

  if (gameOverModal && finalScores) {
    // Populate final scores
    finalScores.innerHTML = "";

    gameState.players
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .forEach((player, index) => {
        const playerElement = document.createElement("div");
        playerElement.className = "flex items-center justify-between py-2";

        playerElement.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span class="text-white font-bold text-sm">${
                player.displayName?.charAt(0) || "?"
              }</span>
            </div>
            <div>
              <p class="text-gray-900 font-medium">${player.displayName}</p>
              ${
                player.isHost
                  ? '<span class="text-yellow-600 text-xs">المضيف</span>'
                  : ""
              }
            </div>
          </div>
          <div class="text-lg font-bold ${
            index === 0 ? "text-yellow-600" : "text-gray-700"
          }">
            ${player.score || 0} نقطة
          </div>
        `;

        finalScores.appendChild(playerElement);
      });

    // Set up modal buttons
    document.getElementById("playAgainBtn").addEventListener("click", () => {
      window.location.reload();
    });

    document.getElementById("closeModalBtn").addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });

    gameOverModal.classList.remove("hidden");
  }
}

function showError(message) {
  // Simple error display - you might want to implement a more sophisticated error UI
  alert(message);
}

// Export for potential use elsewhere
window.roomGame = {
  initializeGame,
  loadGame,
};
