import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
  writeBatch,
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
  hasAnswered: false,
  gameStatus: "waiting", // waiting, instructions, playing, feedback, ended
};

// DOM elements
let questionContainer,
  loadingState,
  questionContent,
  waitingState,
  resultsState;
let safeBtn, phishingBtn, submitDialogueBtn;
let userPointsElement, currentStreakElement;
let playersListElement, currentQuestionElement, totalQuestionsElement;
let roomTitleElement, roomCodeDisplayElement;

// Game flow control
let roomUnsubscribe = null;
let answersUnsubscribe = null;
let gameTimer = null;

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
    document.getElementById("loadingOverlay").classList.remove("hidden");
    cacheDOMElements();
    await loadRoomData();
    setupRoomListeners();
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

  // Ensure we respect the room's question count setting
  gameState.totalQuestions = roomData.questionCount || 10;
  gameState.quizType = roomData.quizType || "mixed";
  gameState.players = roomData.players || [];

  // Update UI
  if (roomTitleElement)
    roomTitleElement.textContent = roomData.roomName || "غرفة التدريب";
  if (roomCodeDisplayElement)
    roomCodeDisplayElement.textContent = `رمز: ${currentRoomId}`;
  if (totalQuestionsElement)
    totalQuestionsElement.textContent = gameState.totalQuestions;

  await loadQuestions();
}

async function loadQuestions() {
  try {
    console.log(
      `Loading ${gameState.totalQuestions} questions for type: ${gameState.quizType}`
    );

    // Check for existing questions first
    const questionsRef = collection(db, `rooms/${currentRoomId}/questions`);
    const questionsQuery = query(questionsRef, orderBy("order", "asc"));
    const questionsSnapshot = await getDocs(questionsQuery);

    if (
      !questionsSnapshot.empty &&
      questionsSnapshot.size === gameState.totalQuestions
    ) {
      // Use existing questions
      gameState.questions = questionsSnapshot.docs.map((doc) => doc.data());
      console.log("Loaded existing questions:", gameState.questions.length);
    } else {
      // Generate new questions that match the room settings exactly
      await generateAndSaveQuestions();
    }

    // Show instructions before starting game
    showInstructionsModal();
  } catch (error) {
    console.error("Error loading questions:", error);
    // Use robust fallback that respects question count
    await generateRobustFallbackQuestions();
    showInstructionsModal();
  }
}

async function generateAndSaveQuestions() {
  try {
    gameState.questions = await generateQuestions(
      gameState.quizType,
      gameState.totalQuestions
    );

    // Save to Firestore
    const questionsRef = collection(db, `rooms/${currentRoomId}/questions`);
    const batch = writeBatch(db);

    // Clear existing questions
    const existingQuestions = await getDocs(questionsRef);
    existingQuestions.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Add new questions
    gameState.questions.forEach((question, index) => {
      const questionRef = doc(questionsRef, `question_${index}`);
      batch.set(questionRef, {
        ...question,
        order: index,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    console.log("Saved new questions to Firestore");
  } catch (error) {
    console.error("Error generating questions:", error);
    throw error;
  }
}

async function generateQuestions(quizType, count) {
  const timestamp = Date.now();
  let allQuestions = [];

  try {
    // Enhanced fetch with timeout and better error handling
    const fetchWithTimeout = async (url, timeout = 5000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    // Fetch based on quiz type
    const fetchPromises = [];

    if (quizType === "sms" || quizType === "mixed") {
      fetchPromises.push(
        fetchWithTimeout(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json?v=${timestamp}`
        )
          .then((data) =>
            data.map((sms, index) => ({
              id: `sms-${timestamp}-${index}`,
              type: "sms",
              content: sms.text || sms.content || "لا يوجد محتوى",
              sender: sms.sender || "جهة مجهولة",
              timestamp: sms.timestamp || "الآن",
              correctAnswer: sms.isPhish ? "phishing" : "safe",
              difficulty: sms.difficulty || 2,
              explanation: sms.explanation || "لا توجد تفاصيل إضافية",
            }))
          )
          .catch((error) => {
            console.warn("Failed to fetch SMS questions:", error);
            return [];
          })
      );
    }

    if (quizType === "image" || quizType === "mixed") {
      fetchPromises.push(
        fetchWithTimeout(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json?v=${timestamp}`
        )
          .then((data) =>
            data.map((image, index) => ({
              id: `image-${timestamp}-${index}`,
              type: "image",
              imageUrl: image.url || image.imageUrl,
              description: image.description || "",
              correctAnswer: image.isPhish ? "phishing" : "safe",
              difficulty: image.difficulty || 2,
              explanation: image.explanation || "لا توجد تفاصيل إضافية",
            }))
          )
          .catch((error) => {
            console.warn("Failed to fetch image questions:", error);
            return [];
          })
      );
    }

    if (quizType === "mixed") {
      fetchPromises.push(
        fetchWithTimeout(
          `https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json?v=${timestamp}`
        )
          .then((data) =>
            data.map((dialogue, index) => ({
              id: `dialogue-${timestamp}-${index}`,
              type: "dialogue",
              messages: dialogue.messages || [],
              correctAnswers: dialogue.correctAnswers || [],
              difficulty: dialogue.difficulty || 3,
              explanation: dialogue.explanation || "لا توجد تفاصيل إضافية",
            }))
          )
          .catch((error) => {
            console.warn("Failed to fetch dialogue questions:", error);
            return [];
          })
      );
    }

    const results = await Promise.allSettled(fetchPromises);

    // Combine successful results
    results.forEach((result) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        allQuestions = allQuestions.concat(result.value);
      }
    });

    console.log("Successfully fetched questions:", allQuestions.length);

    // Ensure we have exactly the required number
    if (allQuestions.length < count) {
      const needed = count - allQuestions.length;
      console.log(`Generating ${needed} fallback questions`);
      const fallbacks = generateFallbackQuestions(needed, quizType);
      allQuestions = allQuestions.concat(fallbacks);
    }

    // Shuffle and take exact count
    allQuestions = shuffleArray(allQuestions).slice(0, count);

    if (allQuestions.length !== count) {
      throw new Error(
        `Could not generate enough questions. Needed: ${count}, Got: ${allQuestions.length}`
      );
    }

    return allQuestions;
  } catch (error) {
    console.error("Error in generateQuestions:", error);
    // Return exact count of fallback questions
    return generateFallbackQuestions(count, quizType);
  }
}

async function generateRobustFallbackQuestions() {
  console.log("Using robust fallback questions");
  gameState.questions = generateFallbackQuestions(
    gameState.totalQuestions,
    gameState.quizType
  );
}

function generateFallbackQuestions(count, type = "mixed") {
  const questions = [];
  const questionTypes =
    type === "mixed" ? ["sms", "image", "dialogue"] : [type];

  for (let i = 0; i < count; i++) {
    const questionType = questionTypes[i % questionTypes.length];
    const isPhishing = Math.random() > 0.5;

    if (questionType === "sms") {
      questions.push({
        id: `fallback-sms-${i}-${Date.now()}`,
        type: "sms",
        content: isPhishing
          ? "مبروك! فزت بجائزة 10000 دينار. اضغط هنا لاستلام جائزتك: winprize.com"
          : "إشعار من البنك: تمت عملية سحب بمبلغ 500 دينار. إذا لم تكن أنت، اتصل بنا فوراً على 198",
        sender: isPhishing ? "مسابقة" : "البنك الأهلي",
        timestamp: "الآن",
        correctAnswer: isPhishing ? "phishing" : "safe",
        difficulty: Math.floor(Math.random() * 3) + 1,
        explanation: isPhishing
          ? "عروض الجوائز الفورية غالباً ما تكون محاولات احتيال تحتوي على روابط مشبوهة"
          : "هذه رسالة أمنة من البنك تحتوي على رقم خدمة عملاء معروف",
      });
    } else if (questionType === "image") {
      questions.push({
        id: `fallback-image-${i}-${Date.now()}`,
        type: "image",
        imageUrl:
          "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
        description: isPhishing
          ? "صورة إعلان عن فوز بجائزة كبيرة تطلب معلومات شخصية"
          : "صورة توعوية من البنك المركزي حول الأمان الإلكتروني",
        correctAnswer: isPhishing ? "phishing" : "safe",
        difficulty: Math.floor(Math.random() * 3) + 1,
        explanation: isPhishing
          ? "الصور التي تعلن عن جوائز وتطلب معلومات شخصية تكون عادة احتيالية"
          : "هذه صورة توعوية رسمية تحتوي على معلومات أمنة",
      });
    } else if (questionType === "dialogue") {
      questions.push({
        id: `fallback-dialogue-${i}-${Date.now()}`,
        type: "dialogue",
        messages: [
          { text: "مرحباً! كيف حالك اليوم؟", isUser: false, isPhishing: false },
          {
            text: "أهلاً! أنا بخير، شكراً لك.",
            isUser: true,
            isPhishing: false,
          },
          {
            text: "لدي عرض رائع لك! يمكنك الفوز بجائزة كبيرة إذا شاركت الآن.",
            isUser: false,
            isPhishing: isPhishing,
          },
        ],
        correctAnswers: isPhishing ? [2] : [],
        difficulty: Math.floor(Math.random() * 3) + 2,
        explanation: isPhishing
          ? "المحادثة تحتوي على عرض جائزة مشبوه يطلب مشاركة فورية"
          : "المحادثة طبيعية ولا تحتوي على عروض مشبوهة",
      });
    }
  }

  return questions.slice(0, count); // Ensure exact count
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function showInstructionsModal() {
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50";
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-8 max-w-2xl w-full">
      <div class="text-center">
        <div class="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-white text-3xl">🎮</span>
        </div>
        <h3 class="text-2xl font-bold text-gray-900 mb-4">تعليمات اللعبة</h3>
        <div class="text-right space-y-3 mb-6">
          <p class="text-gray-700">• جميع اللاعبين سيرون نفس الأسئلة في نفس الوقت</p>
          <p class="text-gray-700">• لكل سؤال وقت محدد للإجابة</p>
          <p class="text-gray-700">• بعد انتهاء الوقت، ستظهر الإجابة الصحيحة وتوضيحها</p>
          <p class="text-gray-700">• النقاط تُمنح للإجابات الصحيحة فقط</p>
          <p class="text-gray-700">• في نهاية الجولة، ستظهر النتائج النهائية</p>
        </div>
        <button id="startGameBtn" class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200">
          بدء اللعبة
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("startGameBtn").addEventListener("click", () => {
    modal.remove();
    startGame();
  });
}

function startGame() {
  gameState.gameStatus = "playing";
  loadCurrentQuestion();
}

function setupRoomListeners() {
  // Listen for room updates
  const roomRef = doc(db, "rooms", currentRoomId);
  roomUnsubscribe = onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      const roomData = doc.data();
      handleRoomUpdate(roomData);
    }
  });

  // Listen for answers
  const answersRef = collection(db, `rooms/${currentRoomId}/answers`);
  answersUnsubscribe = onSnapshot(answersRef, (snapshot) => {
    if (gameState.currentQuestion >= gameState.questions.length) {
      checkAllPlayersFinished();
    }
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

  // Single-player logic
  if (
    gameState.currentQuestion < gameState.questions.length &&
    gameState.gameStatus === "playing"
  ) {
    loadCurrentQuestion();
  } else if (roomData.status === "ended") {
    showGameOver();
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

  // Show question content
  loadingState.classList.add("hidden");
  questionContent.classList.remove("hidden");
  waitingState.classList.add("hidden");
  resultsState.classList.add("hidden");

  // Hide feedback and all question types first
  document.getElementById("answerFeedback").classList.add("hidden");
  document.getElementById("smsQuestion").classList.add("hidden");
  document.getElementById("imageQuestion").classList.add("hidden");
  document.getElementById("dialogueQuestion").classList.add("hidden");

  // Show appropriate question type
  if (question.type === "sms") {
    loadSMSQuestion(question);
  } else if (question.type === "image") {
    loadImageQuestion(question);
  } else if (question.type === "dialogue") {
    loadDialogueQuestion(question);
  }

  // Update difficulty indicator
  updateDifficultyIndicator(question.difficulty);

  // Set up answer buttons
  setupAnswerButtons(question);
}

function loadDialogueQuestion(question) {
  const dialogueQuestion = document.getElementById("dialogueQuestion");
  dialogueQuestion.classList.remove("hidden");

  const dialogueMessages = document.getElementById("dialogueMessages");
  dialogueMessages.innerHTML = "";

  if (question.messages && Array.isArray(question.messages)) {
    question.messages.forEach((message, index) => {
      const messageElement = document.createElement("div");
      messageElement.className = `flex items-start gap-3 ${
        message.isUser ? "justify-end" : "justify-start"
      }`;

      messageElement.innerHTML = `
        <div class="flex ${
          message.isUser ? "flex-row-reverse" : "flex-row"
        } items-start gap-3 max-w-[80%]">
          <div class="w-8 h-8 rounded-full flex items-center justify-center ${
            message.isUser ? "bg-blue-500" : "bg-gray-500"
          }">
            <span class="text-white text-sm">${
              message.isUser ? "أنت" : "هم"
            }</span>
          </div>
          <div class="bg-white/10 rounded-lg p-3 ${
            message.isUser ? "rounded-tr-none" : "rounded-tl-none"
          }">
            <p class="text-white">${message.text || "لا يوجد نص"}</p>
            <div class="flex items-center gap-2 mt-2">
              <input type="checkbox" id="msg-${index}" class="w-4 h-4 rounded border-white/30 bg-white/10">
              <label for="msg-${index}" class="text-white/70 text-sm">علامة احتيال</label>
            </div>
          </div>
        </div>
      `;

      dialogueMessages.appendChild(messageElement);
    });
  }

  // Show submit button for dialogue questions
  submitDialogueBtn.classList.remove("hidden");
}

function loadSMSQuestion(question) {
  const smsQuestion = document.getElementById("smsQuestion");
  smsQuestion.classList.remove("hidden");

  document.getElementById("smsContent").textContent = question.content;
  document.getElementById("smsSender").textContent = question.sender;
  document.getElementById("smsTimestamp").textContent = question.timestamp;
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
      this.onerror = null;
    };
  }

  if (descriptionElement) {
    descriptionElement.textContent = question.description;
  }
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

  const difficultyLabel = document.querySelector("#difficultyStars + span");
  if (difficultyLabel) {
    difficultyLabel.textContent = labels[difficulty - 1] || "متوسط";
  }
}

function setupAnswerButtons(question) {
  // Remove existing event listeners
  const newSafeBtn = safeBtn.cloneNode(true);
  const newPhishingBtn = phishingBtn.cloneNode(true);
  const newSubmitBtn = submitDialogueBtn.cloneNode(true);

  safeBtn.parentNode.replaceChild(newSafeBtn, safeBtn);
  phishingBtn.parentNode.replaceChild(newPhishingBtn, phishingBtn);
  submitDialogueBtn.parentNode.replaceChild(newSubmitBtn, submitDialogueBtn);

  safeBtn = newSafeBtn;
  phishingBtn = newPhishingBtn;
  submitDialogueBtn = newSubmitBtn;

  // Enable buttons
  safeBtn.disabled = false;
  phishingBtn.disabled = false;
  submitDialogueBtn.disabled = false;

  // Add new event listeners based on question type
  if (question.type === "dialogue") {
    safeBtn.classList.add("hidden");
    phishingBtn.classList.add("hidden");
    submitDialogueBtn.classList.remove("hidden");

    submitDialogueBtn.addEventListener("click", () =>
      handleDialogueAnswer(question)
    );
  } else {
    safeBtn.classList.remove("hidden");
    phishingBtn.classList.remove("hidden");
    submitDialogueBtn.classList.add("hidden");

    safeBtn.addEventListener("click", () => handleAnswer("safe", question));
    phishingBtn.addEventListener("click", () =>
      handleAnswer("phishing", question)
    );
  }
}

async function handleDialogueAnswer(question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  submitDialogueBtn.disabled = true;

  try {
    // Get selected messages
    const selectedMessages = [];
    const checkboxes = document.querySelectorAll(
      '#dialogueMessages input[type="checkbox"]'
    );

    checkboxes.forEach((checkbox, index) => {
      if (checkbox.checked) {
        selectedMessages.push(index);
      }
    });

    // Check if answer is correct
    const isCorrect =
      JSON.stringify(selectedMessages.sort()) ===
      JSON.stringify(question.correctAnswers.sort());

    // Update score
    if (isCorrect) {
      gameState.score += 50;
      const currentStreak = parseInt(currentStreakElement.textContent) || 0;
      currentStreakElement.textContent = currentStreak + 1;
      const currentPoints = parseInt(userPointsElement.textContent) || 0;
      userPointsElement.textContent = currentPoints + 50;
    }

    await saveAnswer(`dialogue:${selectedMessages.join(",")}`, isCorrect);
    showAnswerFeedback(isCorrect, question.explanation);

    setTimeout(() => {
      gameState.currentQuestion++;
      if (gameState.currentQuestion < gameState.questions.length) {
        loadCurrentQuestion();
      } else {
        showGameOver();
      }
    }, 2000);
  } catch (error) {
    console.error("Error handling dialogue answer:", error);
    gameState.currentQuestion++;
    if (gameState.currentQuestion < gameState.questions.length) {
      loadCurrentQuestion();
    } else {
      showGameOver();
    }
  }
}

async function handleAnswer(answer, question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  safeBtn.disabled = true;
  phishingBtn.disabled = true;

  const isCorrect = answer === question.correctAnswer;

  try {
    // Update score
    if (isCorrect) {
      gameState.score += 50;
      const currentStreak = parseInt(currentStreakElement.textContent) || 0;
      currentStreakElement.textContent = currentStreak + 1;
      const currentPoints = parseInt(userPointsElement.textContent) || 0;
      userPointsElement.textContent = currentPoints + 50;
    }

    await saveAnswer(answer, isCorrect);
    showAnswerFeedback(isCorrect, question.explanation);

    // Move to next question after delay
    setTimeout(() => {
      gameState.currentQuestion++;
      if (gameState.currentQuestion < gameState.questions.length) {
        loadCurrentQuestion();
      } else {
        showGameOver();
      }
    }, 2000);
  } catch (error) {
    console.error("Error handling answer:", error);
    // Continue to next question even if there's an error
    gameState.currentQuestion++;
    if (gameState.currentQuestion < gameState.questions.length) {
      loadCurrentQuestion();
    } else {
      showGameOver();
    }
  }
}

async function saveAnswer(answer, isCorrect) {
  try {
    const answerRef = doc(
      collection(db, `rooms/${currentRoomId}/answers`),
      currentUser.uid + "_" + gameState.currentQuestion
    );

    await setDoc(answerRef, {
      playerId: currentUser.uid,
      playerName: currentUser.displayName || "لاعب",
      questionIndex: gameState.currentQuestion,
      answer: answer,
      isCorrect: isCorrect,
      timestamp: serverTimestamp(),
    });

    // Update player score in room
    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, {
      players: gameState.players.map((player) =>
        player.uid === currentUser.uid
          ? { ...player, score: gameState.score }
          : player
      ),
    });
  } catch (error) {
    console.error("Error saving answer:", error);
    throw error;
  }
}

function showAnswerFeedback(isCorrect, explanation) {
  const feedbackElement = document.getElementById("answerFeedback");

  if (!feedbackElement) {
    console.warn("Feedback element not found");
    return;
  }

  let feedbackContent = "";

  if (isCorrect) {
    feedbackElement.className =
      "bg-gradient-to-r from-green-500/20 to-emerald-600/20 border-2 border-green-500/50 mb-6 p-6 rounded-lg text-center";
    feedbackContent = `
      <div class="text-lg font-semibold mb-2">إجابة صحيحة!</div>
      <div class="text-white/80 mb-3">${
        explanation || "لا توجد تفاصيل إضافية"
      }</div>
      <div class="text-blue-300 text-sm">الانتقال إلى السؤال التالي...</div>
    `;
  } else {
    feedbackElement.className =
      "bg-gradient-to-r from-red-500/20 to-pink-600/20 border-2 border-red-500/50 mb-6 p-6 rounded-lg text-center";
    feedbackContent = `
      <div class="text-lg font-semibold mb-2">إجابة خاطئة</div>
      <div class="text-white/80 mb-3">${
        explanation || "لا توجد تفاصيل إضافية"
      }</div>
      <div class="text-blue-300 text-sm">الانتقال إلى السؤال التالي...</div>
    `;
  }

  feedbackElement.innerHTML = feedbackContent;
  feedbackElement.classList.remove("hidden");
}

async function checkAllPlayersFinished() {
  try {
    const answersRef = collection(db, `rooms/${currentRoomId}/answers`);
    const answersSnapshot = await getDocs(answersRef);
    const expectedAnswers = gameState.players.length * gameState.totalQuestions;

    return answersSnapshot.size >= expectedAnswers;
  } catch (error) {
    console.error("Error checking players finished:", error);
    return true; // Assume finished if error
  }
}

async function showGameOver() {
  try {
    // Hide all other states
    questionContent.classList.add("hidden");
    waitingState.classList.add("hidden");
    loadingState.classList.add("hidden");

    // Show results state
    resultsState.classList.remove("hidden");

    // Check if all players have finished
    const allFinished = await checkAllPlayersFinished();

    if (!allFinished) {
      // Show waiting for other players
      resultsState.innerHTML = `
        <div class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-white mb-2">بانتظار اللاعبين الآخرين...</h3>
          <p class="text-blue-200">جاري انتظار إنهاء باقي اللاعبين للأسئلة</p>
        </div>
      `;

      // Listen for when all players finish
      const answersRef = collection(db, `rooms/${currentRoomId}/answers`);
      answersUnsubscribe = onSnapshot(answersRef, async (snapshot) => {
        if (await checkAllPlayersFinished()) {
          answersUnsubscribe(); // Stop listening
          displayFinalResults();
        }
      });

      // Timeout after 30 seconds
      gameTimer = setTimeout(() => {
        displayFinalResults();
      }, 30000);
    } else {
      displayFinalResults();
    }
  } catch (error) {
    console.error("Error in showGameOver:", error);
    displayFinalResults(); // Fallback to showing results
  }
}

async function displayFinalResults() {
  try {
    // Calculate accuracy
    const accuracy =
      gameState.questions.length > 0
        ? Math.round(
            (gameState.score / (gameState.questions.length * 50)) * 100
          )
        : 0;

    // Update results display
    resultsState.innerHTML = `
      <div class="text-center py-8">
        <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
          <span class="text-white text-2xl">🏆</span>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">انتهت الجولة!</h3>
        <p class="text-blue-200 mb-4">تهانينا! لقد أكملت جميع الأسئلة</p>
        <div class="bg-white/5 rounded-xl p-4 mb-4">
          <div class="grid grid-cols-2 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-blue-400">${gameState.score}</div>
              <div class="text-sm text-blue-200">النقاط</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-green-400">${accuracy}%</div>
              <div class="text-sm text-blue-200">الدقة</div>
            </div>
          </div>
        </div>
        <p class="text-white/80 text-sm">سيتم نقلك إلى لوحة التحكم تلقائياً...</p>
      </div>
    `;

    // Update room status in Firebase
    await updateRoomStatus();

    // Save game results to user's history
    await saveGameResults(accuracy);

    // Show game over modal after a delay
    setTimeout(() => {
      const gameOverModal = document.getElementById("gameOverModal");
      if (gameOverModal) {
        gameOverModal.classList.remove("hidden");

        // Remove play again button
        const playAgainBtn = document.getElementById("playAgainBtn");
        if (playAgainBtn) playAgainBtn.remove();

        // Update close button
        const closeModalBtn = document.getElementById("closeModalBtn");
        if (closeModalBtn) {
          closeModalBtn.textContent = "العودة إلى لوحة التحكم";
          closeModalBtn.onclick = function () {
            safeCleanup();
            window.location.href = "dashboard.html";
          };
        }

        // Auto-redirect after 5 seconds
        setTimeout(() => {
          safeCleanup();
          window.location.href = "dashboard.html";
        }, 5000);
      }
    }, 2000);
  } catch (error) {
    console.error("Error displaying final results:", error);
  }
}

async function saveGameResults(accuracy) {
  try {
    if (!currentUser) return;

    const gameResult = {
      roomId: currentRoomId,
      score: gameState.score,
      totalQuestions: gameState.questions.length,
      accuracy: accuracy,
      quizType: gameState.quizType,
      completedAt: serverTimestamp(),
      players: gameState.players.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        score: p.score,
      })),
    };

    // Save to user's game history
    const historyRef = doc(
      collection(db, `users/${currentUser.uid}/gameHistory`),
      currentRoomId
    );
    await setDoc(historyRef, gameResult);
  } catch (error) {
    console.error("Error saving game results:", error);
  }
}

async function updateRoomStatus() {
  try {
    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, {
      status: "ended",
      endedAt: serverTimestamp(),
      finalScores: gameState.players.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        score: p.score,
      })),
    });
  } catch (error) {
    console.error("Error updating room status:", error);
  }
}

// Enhanced cleanup to prevent Firestore overload
async function cleanupRoom() {
  try {
    // Unsubscribe all listeners
    if (roomUnsubscribe) roomUnsubscribe();
    if (answersUnsubscribe) answersUnsubscribe();
    if (gameTimer) clearTimeout(gameTimer);

    // Mark room for cleanup
    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, {
      status: "cleaned",
      cleanedAt: serverTimestamp(),
    });

    console.log("Room cleanup completed");
  } catch (error) {
    console.error("Error in cleanupRoom:", error);
  }
}

// Enhanced beforeunload handler
window.addEventListener("beforeunload", (e) => {
  safeCleanup();
});

// Prevent multiple simultaneous cleanups
let cleanupInProgress = false;
async function safeCleanup() {
  if (cleanupInProgress) return;
  cleanupInProgress = true;

  await cleanupRoom();
  cleanupInProgress = false;
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className =
    "fixed top-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50";
  errorDiv.innerHTML = `
    <div class="flex items-center justify-between">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="text-white">
        ✕
      </button>
    </div>
  `;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.remove();
    }
  }, 5000);
}
// Handle page unload
window.addEventListener("beforeunload", cleanupRoom);
