// room-system-combined.js - Complete room system with synchronized gameplay
import { auth, db } from "./firebase-init.js";
import { sendFriendRequest } from "./friends.js";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  getDocs,
  query,
  where,
  getDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  orderBy,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Room state management
let currentRoomId = null;
let roomListener = null;
let playersListener = null;
let currentQuizType = null;
let currentQuestionCount = 10;
let isHost = false;

// Game state management (for room.html)
let currentUser = null;
let gameState = {
  currentQuestionIndex: 0,
  totalQuestions: 10,
  score: 0,
  players: [],
  questions: [],
  quizType: "mixed",
  hasAnswered: false,
  gameStatus: "waiting",
  playerAnswers: new Map(),
};

// DOM elements and listeners (for room.html)
let roomUnsubscribe = null;
let questionsUnsubscribe = null;
let answersUnsubscribe = null;

// ==================== ROOM MANAGEMENT SYSTEM ====================

// --- Create Room Function ---
async function createRoom() {
  const user = auth.currentUser;
  if (!user) {
    showToast("الرجاء تسجيل الدخول أولاً", "warning");
    return;
  }

  try {
    const roomName =
      document.getElementById("roomNameInput")?.value.trim() ||
      "غرفة التدريب الجماعي";
    const quizType = document.getElementById("roomQuizType")?.value || "mixed";
    const questionCount =
      parseInt(document.getElementById("roomQuestionCount")?.value) || 10;
    const maxPlayers = 8;

    currentQuizType = quizType;
    currentQuestionCount = questionCount;
    isHost = true;

    // Create room document WITHOUT serverTimestamp in arrays
    const roomRef = await addDoc(collection(db, "rooms"), {
      hostId: user.uid,
      hostName: user.displayName || "مضيف",
      roomName: roomName,
      quizType: quizType,
      questionCount: questionCount,
      maxPlayers: maxPlayers,
      status: "waiting",
      settings: {
        questionTime: 10, // 10 seconds per question
        showLeaderboard: true,
      },
      players: [
        {
          uid: user.uid,
          displayName: user.displayName || "مضيف",
          isHost: true,
          isReady: true,
          score: 0,
          streak: 0,
          answers: [],
          lastAnswer: null,
          joinedAt: new Date().toISOString(),
        },
      ],
      currentQuestion: {
        index: 0,
        startTime: null,
        questionId: null,
        answers: [],
      },
      gameStats: {
        totalQuestions: 0,
        currentQuestionIndex: 0,
        startTime: null,
        endTime: null,
      },
      createdAt: serverTimestamp(),
    });
    currentRoomId = roomRef.id;

    // Add host as first player in subcollection (this can use serverTimestamp)
    await setDoc(doc(db, `rooms/${roomRef.id}/players`, user.uid), {
      uid: user.uid,
      displayName: user.displayName || "مضيف",
      isHost: true,
      isReady: true,
      score: 0,
      joinedAt: serverTimestamp(),
    });

    showToast("تم إنشاء الغرفة بنجاح!", "success");
    hideModal(document.getElementById("roomCreationModal"));

    // Show lobby modal
    setTimeout(() => {
      showLobbyModal(currentRoomId, true);
    }, 500);
  } catch (error) {
    console.error("Error creating room:", error);
    showToast("فشل في إنشاء الغرفة: " + error.message, "error");
  }
}

// --- Join Room Function - FIXED VERSION ---
async function joinRoom() {
  const user = auth.currentUser;
  if (!user) {
    showToast("الرجاء تسجيل الدخول أولاً", "warning");
    return;
  }

  try {
    const roomIdInput = document.getElementById("joinRoomIdInput");
    const roomId = roomIdInput?.value.trim();

    if (!roomId) {
      showToast("يرجى إدخال رمز الغرفة", "warning");
      return;
    }

    // Check if room exists and is waiting for players
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("لم يتم العثور على الغرفة، يرجى التحقق من الرمز", "error");
      return;
    }

    const roomData = roomDoc.data();

    if (roomData.status !== "waiting") {
      showToast("لا يمكن الانضمام إلى هذه الغرفة حالياً", "error");
      return;
    }

    if (roomData.players.length >= roomData.maxPlayers) {
      showToast("الغرفة ممتلئة، لا يمكن الانضمام الآن", "error");
      return;
    }

    // Enhanced duplicate check with deduplication
    const uniquePlayers = roomData.players.filter(
      (p, index, self) => index === self.findIndex((t) => t.uid === p.uid)
    );

    const existingPlayer = uniquePlayers.find((p) => p.uid === user.uid);
    if (existingPlayer) {
      showToast("أنت بالفعل في هذه الغرفة", "info");
      hideModal(document.getElementById("joinRoomModal"));
      showLobbyModal(roomId, false);
      return;
    }

    // Create player data
    const playerData = {
      uid: user.uid,
      displayName: user.displayName || "لاعب",
      isHost: false,
      isReady: false,
      score: 0,
      streak: 0,
      answers: [],
      lastAnswer: null,
      joinedAt: new Date().toISOString(),
    };

    // Add user to room players array (ensure uniqueness)
    const updatedPlayers = [...uniquePlayers, playerData];

    await updateDoc(roomRef, {
      players: updatedPlayers,
    });

    // Add user to players subcollection
    await setDoc(doc(db, `rooms/${roomId}/players`, user.uid), {
      uid: user.uid,
      displayName: user.displayName || "لاعب",
      isHost: false,
      isReady: false,
      score: 0,
      streak: 0,
      answers: [],
      lastAnswer: null,
      joinedAt: serverTimestamp(),
    });

    currentRoomId = roomId;
    currentQuizType = roomData.quizType;
    currentQuestionCount = roomData.questionCount;
    isHost = false;

    showToast("تم الانضمام إلى الغرفة بنجاح!", "success");
    hideModal(document.getElementById("joinRoomModal"));

    // Show lobby modal
    setTimeout(() => {
      showLobbyModal(roomId, false);
    }, 500);
  } catch (error) {
    console.error("Error joining room:", error);
    showToast("فشل في الانضمام إلى الغرفة: " + error.message, "error");
  }
}

// --- Room Creation Modal ---
export function setupRoomCreationModal() {
  const createRoomBtn = document.getElementById("createRoomBtn");
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const roomCreationModal = document.getElementById("roomCreationModal");
  const joinRoomModal = document.getElementById("joinRoomModal");
  const closeRoomCreationBtn = document.getElementById("closeRoomCreationBtn");
  const closeJoinRoomBtn = document.getElementById("closeJoinRoomBtn");
  const createRoomConfirmBtn = document.getElementById("createRoomConfirmBtn");
  const joinRoomConfirmBtn = document.getElementById("joinRoomConfirmBtn");

  // Create room button
  createRoomBtn?.addEventListener("click", () => {
    showModal(roomCreationModal);
  });

  // Join room button
  joinRoomBtn?.addEventListener("click", () => {
    showModal(joinRoomModal);
  });

  // Close buttons
  closeRoomCreationBtn?.addEventListener("click", () => {
    hideModal(roomCreationModal);
  });

  closeJoinRoomBtn?.addEventListener("click", () => {
    hideModal(joinRoomModal);
  });

  // Confirm buttons
  createRoomConfirmBtn?.addEventListener("click", createRoom);
  joinRoomConfirmBtn?.addEventListener("click", joinRoom);
}

// --- Lobby Modal ---
export function showLobbyModal(roomId, userIsHost) {
  const lobbyModal = document.getElementById("lobbyModal");
  const roomCodeElement = document.getElementById("roomCode");
  const roomNameElement = document.getElementById("lobbyRoomName");
  const roomInfoElement = document.getElementById("roomInfo");
  const playerListElement = document.getElementById("lobbyPlayerList");
  const startGameBtn = document.getElementById("startGameBtn");
  const inviteFriendsBtn = document.getElementById("inviteFriendsBtn");
  const shareRoomBtn = document.getElementById("shareRoomBtn");
  const closeLobbyBtn = document.getElementById("closeLobbyBtn");
  const readyBtn = document.getElementById("readyBtn");
  const hostControls = document.getElementById("hostControls");
  const playerControls = document.getElementById("playerControls");

  if (roomCodeElement) roomCodeElement.textContent = roomId;

  // Show/hide controls based on host status
  if (userIsHost) {
    hostControls.classList.remove("hidden");
    playerControls.classList.add("hidden");
  } else {
    hostControls.classList.add("hidden");
    playerControls.classList.remove("hidden");
  }

  // Set up real-time listeners
  setupRoomListeners(
    roomId,
    playerListElement,
    roomNameElement,
    roomInfoElement,
    startGameBtn,
    readyBtn,
    userIsHost
  );

  // Share room ID button
  shareRoomBtn?.addEventListener("click", () => shareRoomId(roomId));

  // Invite friends button (host only)
  inviteFriendsBtn?.addEventListener("click", () =>
    showInviteFriendsModal(roomId)
  );

  // Start game button (host only)
  startGameBtn?.addEventListener("click", () => startGame(roomId));

  // Ready button (players only)
  readyBtn?.addEventListener("click", () => toggleReadyStatus(roomId));

  // Close lobby
  closeLobbyBtn?.addEventListener("click", () =>
    closeLobby(roomId, userIsHost)
  );

  showModal(lobbyModal);
}

function setupRoomListeners(
  roomId,
  playerListElement,
  roomNameElement,
  roomInfoElement,
  startGameBtn,
  readyBtn,
  userIsHost
) {
  // Listen to room data
  roomListener = onSnapshot(doc(db, "rooms", roomId), (doc) => {
    if (doc.exists()) {
      const roomData = doc.data();

      if (roomNameElement && roomData.roomName) {
        roomNameElement.textContent = roomData.roomName;
      }

      if (roomInfoElement) {
        roomInfoElement.innerHTML = `
          نوع التحدي: ${getQuizTypeName(roomData.quizType)}<br>
          عدد الأسئلة: ${roomData.questionCount}<br>
          اللاعبون: ${roomData.players?.length || 0}/${roomData.maxPlayers}
        `;
      }
      // Update player count displays with debouncing
      const playersCount = document.getElementById("playersCount");
      const readyCount = document.getElementById("readyCount");

      if (playersCount) {
        const uniquePlayers =
          roomData.players?.filter(
            (p, index, self) => index === self.findIndex((t) => t.uid === p.uid)
          ) || [];
        playersCount.textContent = uniquePlayers.length;
      }

      if (readyCount) {
        const uniquePlayers =
          roomData.players?.filter(
            (p, index, self) => index === self.findIndex((t) => t.uid === p.uid)
          ) || [];
        const readyPlayers = uniquePlayers.filter((p) => p.isReady);
        readyCount.textContent = readyPlayers.length;
      }

      // Update start button based on player count and readiness
      if (startGameBtn && roomData.players) {
        const readyPlayers = roomData.players.filter((p) => p.isReady) || [];
        const canStart =
          readyPlayers.length >= 2 &&
          readyPlayers.length === roomData.players.length;

        startGameBtn.disabled = !canStart;
        startGameBtn.textContent = canStart
          ? "بدء اللعبة"
          : `بانتظار اللاعبين (${readyPlayers.length}/${roomData.players.length})`;
      }

      // Update ready button for players
      if (readyBtn && !userIsHost) {
        const user = auth.currentUser;
        const player = roomData.players?.find((p) => p.uid === user?.uid);
        if (player) {
          readyBtn.textContent = player.isReady
            ? "إلغاء الاستعداد"
            : "أنا مستعد";
          readyBtn.className = player.isReady
            ? "w-full bg-gradient-to-r from-yellow-500 to-orange-600 text-white py-3 px-6 rounded-lg font-medium hover:from-yellow-600 hover:to-orange-700 transition-all duration-200"
            : "w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200";
        }
      }

      // Handle room status changes - redirect players when game starts
      if (roomData.status === "started" || roomData.status === "in-progress") {
        if (userIsHost) {
          // Host gets redirected immediately
          setTimeout(() => {
            window.location.href = `room.html?roomId=${roomId}`;
          }, 1000);
        } else {
          // Players get redirected after a short delay
          setTimeout(() => {
            window.location.href = `room.html?roomId=${roomId}`;
          }, 1500);
        }
      } else if (roomData.status === "ended") {
        showResultsModal(roomId);
      }
    }
  });

  // Listen to players collection
  playersListener = onSnapshot(
    collection(db, `rooms/${roomId}/players`),
    (snapshot) => {
      if (playerListElement) {
        playerListElement.innerHTML = "";

        // Use Set to ensure unique players
        const uniquePlayers = new Map();
        snapshot.docs.forEach((playerDoc) => {
          const player = playerDoc.data();
          uniquePlayers.set(player.uid, player);
        });

        // Display only unique players
        Array.from(uniquePlayers.values()).forEach((player) => {
          const playerElement = document.createElement("div");
          playerElement.className =
            "flex items-center justify-between p-3 bg-white/5 rounded-lg mb-2";
          playerElement.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span class="text-white font-bold">${
                player.displayName?.charAt(0) || "?"
              }</span>
            </div>
            <div>
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
          </div>
          <div class="text-blue-200 text-sm">
            ${player.score || 0} نقطة
          </div>
        `;
          playerListElement.appendChild(playerElement);
        });
      }
    }
  );
}

// --- Start Game ---
async function startGame(roomId) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    // Get room data to ensure host is starting the game
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("الغرفة غير موجودة", "error");
      return;
    }

    const roomData = roomDoc.data();

    // Check if user is the host
    if (roomData.hostId !== user.uid) {
      showToast("فقط المضيف يمكنه بدء اللعبة", "error");
      return;
    }

    // Check if there are enough players (at least 2)
    if (roomData.players.length < 2) {
      showToast("يحتاج على الأقل لاعبين لبدء اللعبة", "warning");
      return;
    }

    // Check if all players are ready
    const readyPlayers = roomData.players.filter((p) => p.isReady);
    if (readyPlayers.length !== roomData.players.length) {
      showToast("يجب أن يكون جميع اللاعبين مستعدين", "warning");
      return;
    }

    // Generate questions for this room
    await generateRoomQuestions(
      roomId,
      roomData.quizType,
      roomData.questionCount
    );

    // Initialize game state - set status to "starting"
    await updateDoc(roomRef, {
      status: "starting",
      "gameStats.totalQuestions": roomData.questionCount,
      "gameStats.currentQuestionIndex": 0,
      "gameStats.startTime": serverTimestamp(),
      "gameStats.endTime": null,
      // Reset all player scores and states for new game
      players: roomData.players.map((player) => ({
        ...player,
        score: 0,
        streak: 0,
        answers: [],
        lastAnswer: null,
        isReady: true, // Keep ready state for game
      })),
    });

    showToast("تبدأ اللعبة خلال 3 ثواني!", "success");

    // After 3 seconds, start the first question AND redirect
    setTimeout(async () => {
      await startQuestion(roomId, 0);

      // Update status to "in-progress" to trigger redirect in listeners
      await updateDoc(roomRef, {
        status: "in-progress",
      });
    }, 3000);
  } catch (error) {
    console.error("Error starting game:", error);
    showToast("فشل في بدء اللعبة: " + error.message, "error");
  }
}

// --- Start Question ---
async function startQuestion(roomId, questionIndex) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const questionsRef = collection(db, `rooms/${roomId}/questions`);
    const questionsSnapshot = await getDocs(questionsRef);

    if (
      questionsSnapshot.empty ||
      questionIndex >= questionsSnapshot.docs.length
    ) {
      // No more questions, end game
      await endGame(roomId);
      return;
    }

    const questionDoc = questionsSnapshot.docs[questionIndex];
    const questionData = questionDoc.data();

    // Update room with current question
    await updateDoc(roomRef, {
      "currentQuestion.index": questionIndex,
      "currentQuestion.startTime": serverTimestamp(),
      "currentQuestion.questionId": questionDoc.id,
      "currentQuestion.answers": [],
      "gameStats.currentQuestionIndex": questionIndex,
    });

    // Set timeout for question end (10 seconds)
    setTimeout(async () => {
      await endQuestion(roomId, questionIndex);
    }, 10000); // 10 seconds per question
  } catch (error) {
    console.error("Error starting question:", error);
  }
}

// --- End Question ---
async function endQuestion(roomId, questionIndex) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) return;

    const roomData = roomDoc.data();
    const questionsRef = collection(db, `rooms/${roomId}/questions`);
    const questionDoc = await getDoc(
      doc(questionsRef, roomData.currentQuestion.questionId)
    );

    if (!questionDoc.exists()) return;

    const questionData = questionDoc.data();
    const correctAnswer = questionData.correctAnswer;

    // Process all answers and calculate scores
    const updatedPlayers = roomData.players.map((player) => {
      const playerAnswer = roomData.currentQuestion.answers.find(
        (answer) => answer.playerId === player.uid
      );

      if (playerAnswer) {
        const isCorrect = playerAnswer.answer === correctAnswer;
        const timeTaken = playerAnswer.timeTaken || 10000;

        const pointsEarned = calculatePoints(
          isCorrect,
          timeTaken,
          player.streak
        );
        const newScore = player.score + pointsEarned;
        const newStreak = isCorrect ? player.streak + 1 : 0;

        return {
          ...player,
          score: newScore,
          streak: newStreak,
          answers: [
            ...player.answers,
            {
              questionIndex,
              answer: playerAnswer.answer,
              isCorrect,
              timeTaken,
              pointsEarned,
            },
          ],
          lastAnswer: {
            questionIndex,
            answer: playerAnswer.answer,
            isCorrect,
            timeTaken,
            pointsEarned,
          },
        };
      }

      // Player didn't answer
      return {
        ...player,
        streak: 0,
        answers: [
          ...player.answers,
          {
            questionIndex,
            answer: null,
            isCorrect: false,
            timeTaken: 10000, // Max time
            pointsEarned: 0,
          },
        ],
      };
    });

    // Update room with processed scores and show results
    await updateDoc(roomRef, {
      players: updatedPlayers,
      status: "show-results", // Brief results display
    });

    // Show results for 3 seconds, then next question
    setTimeout(async () => {
      if (questionIndex + 1 < roomData.questionCount) {
        await startQuestion(roomId, questionIndex + 1);
      } else {
        await endGame(roomId);
      }
    }, 3000);
  } catch (error) {
    console.error("Error ending question:", error);
  }
}

// --- Calculate Points ---
function calculatePoints(isCorrect, timeTaken, currentStreak) {
  if (!isCorrect) return 0;

  const basePoints = 100;
  const timeBonus = Math.max(0, 10000 - timeTaken) / 100; // Up to 100 points for speed
  const streakBonus = currentStreak * 10; // 10 points per consecutive correct answer

  return Math.round(basePoints + timeBonus + streakBonus);
}

// --- Submit Answer ---
async function submitAnswer(roomId, answer) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists() || roomDoc.data().status !== "in-progress") {
      showToast("لا يمكن الإجابة الآن", "warning");
      return;
    }

    const roomData = roomDoc.data();

    // Check if player already answered
    const existingAnswer = roomData.currentQuestion.answers.find(
      (ans) => ans.playerId === user.uid
    );

    if (existingAnswer) {
      showToast("لقد أجبت على هذا السؤال بالفعل", "info");
      return;
    }

    // Calculate time taken
    const questionStartTime =
      roomData.currentQuestion.startTime?.toDate?.() ||
      new Date(roomData.currentQuestion.startTime);
    const timeTaken = Date.now() - questionStartTime.getTime();

    // Add answer to current question
    await updateDoc(roomRef, {
      "currentQuestion.answers": arrayUnion({
        playerId: user.uid,
        answer: answer,
        timestamp: serverTimestamp(),
        timeTaken: timeTaken,
      }),
    });

    showToast("تم تسجيل إجابتك!", "success");
  } catch (error) {
    console.error("Error submitting answer:", error);
    showToast("فشل في تسجيل الإجابة", "error");
  }
}

// --- End Game ---
async function endGame(roomId) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) return;

    const roomData = roomDoc.data();

    // Update room status and end time
    await updateDoc(roomRef, {
      status: "finished",
      "gameStats.endTime": serverTimestamp(),
    });

    // Update user stats with game results
    await updateUserStatsAfterGame(roomData.players);

    showToast("انتهت اللعبة! عرض النتائج...", "success");
  } catch (error) {
    console.error("Error ending game:", error);
  }
}

// --- Update User Stats ---
async function updateUserStatsAfterGame(players) {
  for (const player of players) {
    try {
      const userRef = doc(db, "users", player.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const newTotalPoints =
          (userData.stats?.totalPoints || 0) + player.score;
        const newQuizzesTaken = (userData.stats?.quizzesTaken || 0) + 1;

        await updateDoc(userRef, {
          "stats.totalPoints": newTotalPoints,
          "stats.quizzesTaken": newQuizzesTaken,
          "stats.lastMultiplayerGame": serverTimestamp(),
        });
      }
    } catch (error) {
      console.error(`Error updating stats for user ${player.uid}:`, error);
    }
  }
}

// --- Generate Room Questions ---
async function generateRoomQuestions(roomId, quizType, questionCount) {
  try {
    // Create a unique seed based on room ID and current date
    const seed = roomId + new Date().toISOString().split("T")[0];
    const questionsRef = collection(db, `rooms/${roomId}/questions`);

    // Clear existing questions
    const existingQuestions = await getDocs(questionsRef);
    const deletePromises = existingQuestions.docs.map((doc) =>
      deleteDoc(doc.ref)
    );
    await Promise.all(deletePromises);

    // Load questions based on quiz type
    let questions = [];
    const timestamp = Date.now();

    switch (quizType) {
      case "sms":
        questions = await loadSMSQuestions(timestamp);
        break;
      case "dialogue":
        questions = await loadDialogueQuestions(timestamp);
        break;
      case "image":
        questions = await loadImageQuestions(timestamp);
        break;
      case "mixed":
      default:
        const [sms, dialogue, image] = await Promise.all([
          loadSMSQuestions(timestamp).catch(() => []),
          loadDialogueQuestions(timestamp).catch(() => []),
          loadImageQuestions(timestamp).catch(() => []),
        ]);
        questions = [...sms, ...dialogue, ...image];
        break;
    }

    // Filter out invalid questions (those with undefined required fields)
    questions = questions.filter((question) => {
      if (question.type === "image") {
        return question.imageUrl && question.imageUrl !== undefined;
      }
      if (question.type === "sms") {
        return question.content && question.content !== undefined;
      }
      if (question.type === "dialogue") {
        return (
          question.messages &&
          Array.isArray(question.messages) &&
          question.messages.length > 0
        );
      }
      return true;
    });

    // Shuffle questions using room-specific seed for consistency
    questions = shuffleArrayWithSeed(questions, seed);

    // Take the required number of questions
    questions = questions.slice(0, questionCount);

    // If we don't have enough questions after filtering, use sample questions
    if (questions.length < questionCount) {
      console.warn(
        `Only ${questions.length} valid questions found, using sample questions as fallback`
      );
      const sampleQuestions = await generateSampleQuestionsArray(
        questionCount - questions.length
      );
      questions = [...questions, ...sampleQuestions];
    }

    // Add questions to Firestore
    for (let i = 0; i < questions.length; i++) {
      const questionData = {
        ...questions[i],
        order: i,
        createdAt: serverTimestamp(),
      };

      // Ensure all required fields have valid values
      if (questionData.type === "image" && !questionData.imageUrl) {
        questionData.imageUrl =
          "https://via.placeholder.com/300x200/4F46E5/FFFFFF?text=صورة+تدريبية";
      }
      if (!questionData.explanation) {
        questionData.explanation = "لا توجد تفاصيل إضافية";
      }
      if (!questionData.difficulty) {
        questionData.difficulty = 2;
      }

      await addDoc(questionsRef, questionData);
    }

    console.log(`Generated ${questions.length} questions for room ${roomId}`);
  } catch (error) {
    console.error("Error generating questions:", error);
    // Fallback to sample questions
    await generateSampleQuestions(roomId, questionCount);
  }
}

// --- Helper function to shuffle with seed ---
function shuffleArrayWithSeed(array, seed) {
  const random = seededRandom(seed);
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// --- Seeded random number generator ---
function seededRandom(seed) {
  // Simple seeded random generator
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return function () {
    hash = Math.sin(hash) * 10000;
    return hash - Math.floor(hash);
  };
}

// Add hashCode function to String prototype for seed generation
String.prototype.hashCode = function () {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

// --- Load questions from external sources ---
async function loadSMSQuestions(timestamp) {
  try {
    const response = await fetch(`./sms-quiz.json?v=${timestamp}`);
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
    console.error("Error loading SMS questions:", error);
    return [];
  }
}

async function loadDialogueQuestions(timestamp) {
  try {
    const response = await fetch(`./dialogues.json?v=${timestamp}`);
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
    console.error("Error loading dialogue questions:", error);
    return [];
  }
}

async function loadImageQuestions(timestamp) {
  try {
    const response = await fetch(`./image.json?v=${timestamp}`);
    if (!response.ok) throw new Error("Failed to fetch image questions");
    const data = await response.json();

    return data
      .map((image, index) => ({
        id: `image-${index}`,
        type: "image",
        imageUrl:
          image.url ||
          "https://via.placeholder.com/300x200/4F46E5/FFFFFF?text=صورة+تدريبية",
        description: image.description || "",
        correctAnswer: image.isPhish ? "phishing" : "safe",
        difficulty: image.difficulty || 2,
        explanation: image.explanation || "لا توجد تفاصيل إضافية",
      }))
      .filter((image) => image.imageUrl); // Filter out any remaining undefined URLs
  } catch (error) {
    console.error("Error loading image questions:", error);
    return [];
  }
}

// --- Generate sample questions as fallback ---
async function generateSampleQuestions(roomId, questionCount) {
  const questionsRef = collection(db, `rooms/${roomId}/questions`);
  const sampleQuestions = [
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
    {
      type: "sms",
      content:
        "إشعار من البنك: تمت عملية سحب بمبلغ 500 دينار. إذا لم تكن أنت، اتصل بنا فوراً على 198",
      sender: "البنك الأهلي",
      timestamp: "2 دقيقة",
      correctAnswer: "safe",
      difficulty: 1,
      explanation: "هذه رسالة أمنة من البنك تحتوي على رقم خدمة عملاء معروف",
    },
    {
      type: "sms",
      content:
        "مبروك! فزت بجائزة 10000 دينار. اضغط هنا لاستلام جائزتك: winprize.com",
      sender: "مسابقة",
      timestamp: "5 دقائق",
      correctAnswer: "phishing",
      difficulty: 1,
      explanation: "عروض الجوائز الفورية غالباً ما تكون محاولات احتيال",
    },
  ].slice(0, questionCount);

  for (let i = 0; i < sampleQuestions.length; i++) {
    await addDoc(questionsRef, {
      ...sampleQuestions[i],
      order: i,
      createdAt: serverTimestamp(),
    });
  }
}

// --- Helper function to generate sample questions array ---
async function generateSampleQuestionsArray(count) {
  const sampleQuestions = [
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
    {
      type: "sms",
      content:
        "إشعار من البنك: تمت عملية سحب بمبلغ 500 دينار. إذا لم تكن أنت، اتصل بنا فوراً على 198",
      sender: "البنك الأهلي",
      timestamp: "2 دقيقة",
      correctAnswer: "safe",
      difficulty: 1,
      explanation: "هذه رسالة أمنة من البنك تحتوي على رقم خدمة عملاء معروف",
    },
    {
      type: "sms",
      content:
        "مبروك! فزت بجائزة 10000 دينار. اضغط هنا لاستلام جائزتك: winprize.com",
      sender: "مسابقة",
      timestamp: "5 دقائق",
      correctAnswer: "phishing",
      difficulty: 1,
      explanation: "عروض الجوائز الفورية غالباً ما تكون محاولات احتيال",
    },
    {
      type: "image",
      imageUrl:
        "https://via.placeholder.com/300x200/EF4444/FFFFFF?text=رسالة+تصيد",
      description: "صورة لرسالة بريد إلكتروني تطلب معلومات شخصية",
      correctAnswer: "phishing",
      difficulty: 2,
      explanation: "هذه صورة لرسالة تصيد تحاول الحصول على معلوماتك الشخصية",
    },
    {
      type: "image",
      imageUrl:
        "https://via.placeholder.com/300x200/10B981/FFFFFF?text=رسالة+آمنة",
      description: "صورة لإشعار أمن من البنك",
      correctAnswer: "safe",
      difficulty: 1,
      explanation: "هذه صورة لإشعار أمن من مؤسسة موثوقة",
    },
  ];

  return sampleQuestions.slice(0, count);
}

// Toggle ready status for players - FIXED VERSION
async function toggleReadyStatus(roomId) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) return;

    const roomData = roomDoc.data();
    const playerIndex = roomData.players.findIndex((p) => p.uid === user.uid);

    if (playerIndex === -1) return;

    const updatedPlayers = [...roomData.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      isReady: !updatedPlayers[playerIndex].isReady,
    };

    await updateDoc(roomRef, {
      players: updatedPlayers,
    });

    // Also update the player document in subcollection
    const playerRef = doc(db, `rooms/${roomId}/players`, user.uid);
    await updateDoc(playerRef, {
      isReady: updatedPlayers[playerIndex].isReady,
    });
  } catch (error) {
    console.error("Error toggling ready status:", error);
    showToast("فشل في تغيير حالة الاستعداد", "error");
  }
}

// Get quiz type name in Arabic
function getQuizTypeName(quizType) {
  const types = {
    sms: "رسائل SMS",
    dialogue: "حوارات",
    image: "صور مشبوهة",
    mixed: "كوكتيل أسئلة",
  };
  return types[quizType] || quizType;
}

// --- Share Room ID ---
function shareRoomId(roomId) {
  if (navigator.share) {
    navigator
      .share({
        title: "انضم إلى غرفة التدريب الجماعي",
        text: `انضم إلى غرفتي في Zero Fake! رمز الغرفة: ${roomId}`,
        url: window.location.href,
      })
      .then(() => showToast("تم مشاركة رمز الغرفة بنجاح!", "success"))
      .catch((error) => {
        copyRoomIdToClipboard(roomId);
      });
  } else {
    copyRoomIdToClipboard(roomId);
  }
}

function copyRoomIdToClipboard(roomId) {
  navigator.clipboard
    .writeText(roomId)
    .then(() => showToast("تم نسخ رمز الغرفة إلى الحافظة!", "success"))
    .catch(() => showToast("فشل نسخ رمز الغرفة", "error"));
}

// --- Invite Friends Modal ---
function showInviteFriendsModal(roomId) {
  const inviteModal = document.getElementById("inviteFriendsModal");
  const friendListElement = document.getElementById("inviteFriendList");
  const closeInviteModalBtn = document.getElementById("closeInviteModalBtn");
  const sendInvitesBtn = document.getElementById("sendInvitesBtn");

  // Clear previous content and listeners
  friendListElement.innerHTML = "";
  sendInvitesBtn.replaceWith(sendInvitesBtn.cloneNode(true));
  closeInviteModalBtn.replaceWith(closeInviteModalBtn.cloneNode(true));

  // Load friends list with deduplication
  loadFriendsForInvitation(friendListElement, roomId);

  // Get fresh references after cloning
  const newCloseBtn = document.getElementById("closeInviteModalBtn");
  const newSendBtn = document.getElementById("sendInvitesBtn");

  newCloseBtn?.addEventListener("click", () => {
    hideModal(inviteModal);
  });

  newSendBtn?.addEventListener("click", () => {
    // This will be implemented later for bulk invites
    showToast("تم إرسال الدعوات للمحددين!", "success");
    hideModal(inviteModal);
  });

  showModal(inviteModal);
}

async function loadFriendsForInvitation(container, roomId) {
  const user = auth.currentUser;
  if (!user || !container) return;

  try {
    const friendsRef = collection(db, "friends");
    const q = query(friendsRef, where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);

    container.innerHTML = "";

    if (querySnapshot.empty) {
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-blue-200">لا يوجد أصدقاء لإرسال الدعوات لهم</p>
          <p class="text-white/60 text-sm mt-2">أضف أصدقاء أولاً من خلال قسم الأصدقاء</p>
        </div>
      `;
      return;
    }

    // Use Set to track unique friends
    const uniqueFriends = new Map();

    for (const docSnapshot of querySnapshot.docs) {
      const friendData = docSnapshot.data();
      const friendId = friendData.friendId;

      // Skip duplicates
      if (uniqueFriends.has(friendId)) continue;
      uniqueFriends.set(friendId, friendData);

      const friendUserRef = doc(db, "users", friendId);
      const friendUserDoc = await getDoc(friendUserRef);

      if (friendUserDoc.exists()) {
        const friendUserData = friendUserDoc.data();
        const friendElement = document.createElement("div");
        friendElement.className =
          "friend-invite-item flex items-center justify-between p-3 bg-white/5 rounded-lg mb-2";
        friendElement.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span class="text-white font-bold">${
                friendUserData.displayName?.charAt(0) || "?"
              }</span>
            </div>
            <div>
              <p class="text-white font-medium">${
                friendUserData.displayName || "صديق"
              }</p>
              <p class="text-blue-200 text-xs">${
                friendUserData.stats?.totalPoints || 0
              } نقطة</p>
            </div>
          </div>
          <button class="invite-friend-btn bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-lg text-sm hover:from-purple-600 hover:to-pink-700 transition-all duration-200" data-friend-id="${friendId}">
            دعوة
          </button>
        `;
        container.appendChild(friendElement);
      }
    }

    // Add event listeners with proper cleanup
    container.querySelectorAll(".invite-friend-btn").forEach((btn) => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener("click", function () {
        const friendId = this.getAttribute("data-friend-id");
        sendFriendInvitation(friendId, roomId);
        this.disabled = true;
        this.textContent = "تم الإرسال";
        this.classList.remove(
          "from-purple-500",
          "to-pink-600",
          "hover:from-purple-600",
          "hover:to-pink-700"
        );
        this.classList.add("from-gray-500", "to-gray-600");
      });
    });
  } catch (error) {
    console.error("Error loading friends:", error);
    container.innerHTML =
      '<p class="text-red-400">فشل تحميل قائمة الأصدقاء</p>';
  }
}

async function sendFriendInvitation(friendId, roomId) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    // Check for existing pending invites first
    const invitesRef = collection(db, "roomInvites");
    const existingInviteQuery = query(
      invitesRef,
      where("roomId", "==", roomId),
      where("toUserId", "==", friendId),
      where("status", "==", "pending")
    );

    const existingInvites = await getDocs(existingInviteQuery);
    if (!existingInvites.empty) {
      showToast("لقد أرسلت دعوة بالفعل لهذا الصديق", "warning");
      return;
    }

    // Create invitation with unique ID
    const inviteRef = doc(collection(db, "roomInvites"));
    await setDoc(inviteRef, {
      id: inviteRef.id,
      roomId: roomId,
      quizType: currentQuizType,
      questionCount: currentQuestionCount,
      fromUserId: user.uid,
      fromUserName: user.displayName || "مستخدم",
      toUserId: friendId,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    showToast("تم إرسال الدعوة بنجاح!", "success");
  } catch (error) {
    console.error("Error sending invitation:", error);
    showToast("فشل إرسال الدعوة", "error");
  }
}

async function sendInvitesToFriends(roomId) {
  showToast("سيتم إضافة هذه الميزة قريباً!", "info");
}

// ==================== GAME CLIENT SYSTEM (for room.html) ====================

// Initialize the game (for room.html)
export function initializeRoomGame() {
  document.addEventListener("DOMContentLoaded", async function () {
    await initializeGame();
  });
}

async function initializeGame() {
  const urlParams = new URLSearchParams(window.location.search);
  currentRoomId = urlParams.get("roomId");

  if (!currentRoomId) {
    showError("لم يتم العثور على معرف الغرفة");
    return;
  }

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
    document.getElementById("loadingOverlay")?.classList.remove("hidden");
    cacheDOMElements();
    await setupRoomGameListeners();
    document.getElementById("loadingOverlay")?.classList.add("hidden");
  } catch (error) {
    console.error("Error loading game:", error);
    showError("فشل في تحميل اللعبة: " + error.message);
  }
}

function cacheDOMElements() {
  // Cache all DOM elements needed for room.html
  if (document.getElementById("questionContainer")) {
    window.questionContainer = document.getElementById("questionContainer");
    window.loadingState = document.getElementById("loadingState");
    window.questionContent = document.getElementById("questionContent");
    window.waitingState = document.getElementById("waitingState");
    window.resultsState = document.getElementById("resultsState");

    window.safeBtn = document.getElementById("safeBtn");
    window.phishingBtn = document.getElementById("phishingBtn");
    window.submitDialogueBtn = document.getElementById("submitDialogueBtn");

    window.userPointsElement = document.getElementById("userPoints");
    window.currentStreakElement = document.getElementById("currentStreak");
    window.playersListElement = document.getElementById("playersList");
    window.currentQuestionElement = document.getElementById("currentQuestion");
    window.totalQuestionsElement = document.getElementById("totalQuestions");
  }
}

async function setupRoomGameListeners() {
  const roomRef = doc(db, "rooms", currentRoomId);

  // Listen to room changes
  roomUnsubscribe = onSnapshot(roomRef, async (doc) => {
    if (doc.exists()) {
      const roomData = doc.data();
      await handleRoomGameUpdate(roomData);
    }
  });
}

async function handleRoomGameUpdate(roomData) {
  // Update players list
  gameState.players = roomData.players || [];
  updatePlayersList();

  // Handle game status changes
  switch (roomData.status) {
    case "starting":
      showLoadingState("تبدأ اللعبة قريباً...");
      break;

    case "in-progress":
      await handleGameInProgress(roomData);
      break;

    case "show-results":
      await showQuestionResults(roomData);
      break;

    case "finished":
      await showFinalLeaderboard(roomData);
      break;

    default:
      showWaitingState("في انتظار بدء اللعبة...");
  }
}

async function handleGameInProgress(roomData) {
  const currentQIndex = roomData.currentQuestion?.index ?? 0;

  // Load questions if not loaded
  if (gameState.questions.length === 0) {
    await loadGameQuestions();
  }

  // Show current question
  if (currentQIndex < gameState.questions.length) {
    gameState.currentQuestionIndex = currentQIndex;
    await showCurrentQuestion();
  } else {
    // Game finished
    await updateDoc(doc(db, "rooms", currentRoomId), {
      status: "finished",
    });
  }
}

async function loadGameQuestions() {
  try {
    const questionsRef = collection(db, `rooms/${currentRoomId}/questions`);
    const questionsQuery = query(questionsRef, orderBy("order", "asc"));
    const questionsSnapshot = await getDocs(questionsQuery);

    if (!questionsSnapshot.empty) {
      gameState.questions = questionsSnapshot.docs.map((doc) => doc.data());
      console.log("Loaded questions:", gameState.questions.length);
    }
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

async function showCurrentQuestion() {
  const question = gameState.questions[gameState.currentQuestionIndex];
  if (!question) return;

  // Reset answer state
  gameState.hasAnswered = false;

  // Show question
  showQuestionContent();
  displayGameQuestion(question);

  // Setup answer listeners for this question
  setupAnswerListener();
}

function displayGameQuestion(question) {
  // Hide all question types first
  document.getElementById("smsQuestion")?.classList.add("hidden");
  document.getElementById("imageQuestion")?.classList.add("hidden");
  document.getElementById("dialogueQuestion")?.classList.add("hidden");

  // Show appropriate question type
  switch (question.type) {
    case "sms":
      displayGameSMSQuestion(question);
      break;
    case "image":
      displayGameImageQuestion(question);
      break;
    case "dialogue":
      displayGameDialogueQuestion(question);
      break;
  }

  // Update UI
  if (currentQuestionElement) {
    currentQuestionElement.textContent = gameState.currentQuestionIndex + 1;
  }
  if (totalQuestionsElement) {
    totalQuestionsElement.textContent = gameState.questions.length;
  }
}

function displayGameSMSQuestion(question) {
  const smsQuestion = document.getElementById("smsQuestion");
  smsQuestion.classList.remove("hidden");

  document.getElementById("smsContent").textContent = question.content;
  document.getElementById("smsSender").textContent = question.sender;
  document.getElementById("smsTimestamp").textContent = question.timestamp;

  // Show regular answer buttons
  safeBtn.classList.remove("hidden");
  phishingBtn.classList.remove("hidden");
  submitDialogueBtn.classList.add("hidden");

  setupGameAnswerButtons(question);
}

function displayGameImageQuestion(question) {
  const imageQuestion = document.getElementById("imageQuestion");
  imageQuestion.classList.remove("hidden");

  const imageElement = document.getElementById("questionImage");
  if (imageElement && question.imageUrl) {
    imageElement.src = question.imageUrl;
  }

  const descriptionElement = document.getElementById("imageDescription");
  if (descriptionElement) {
    descriptionElement.textContent = question.description;
  }

  // Show regular answer buttons
  safeBtn.classList.remove("hidden");
  phishingBtn.classList.remove("hidden");
  submitDialogueBtn.classList.add("hidden");

  setupGameAnswerButtons(question);
}

function displayGameDialogueQuestion(question) {
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

  // Show dialogue submit button
  safeBtn.classList.add("hidden");
  phishingBtn.classList.add("hidden");
  submitDialogueBtn.classList.remove("hidden");

  setupGameDialogueAnswerButton(question);
}

function setupGameAnswerButtons(question) {
  // Remove existing listeners
  const newSafeBtn = safeBtn.cloneNode(true);
  const newPhishingBtn = phishingBtn.cloneNode(true);

  safeBtn.parentNode.replaceChild(newSafeBtn, safeBtn);
  phishingBtn.parentNode.replaceChild(newPhishingBtn, phishingBtn);

  window.safeBtn = newSafeBtn;
  window.phishingBtn = newPhishingBtn;

  // Add new listeners
  safeBtn.onclick = () => handleGameAnswer("safe", question);
  phishingBtn.onclick = () => handleGameAnswer("phishing", question);

  safeBtn.disabled = false;
  phishingBtn.disabled = false;
}

function setupGameDialogueAnswerButton(question) {
  const newSubmitBtn = submitDialogueBtn.cloneNode(true);
  submitDialogueBtn.parentNode.replaceChild(newSubmitBtn, submitDialogueBtn);
  window.submitDialogueBtn = newSubmitBtn;

  submitDialogueBtn.onclick = () => handleGameDialogueAnswer(question);
  submitDialogueBtn.disabled = false;
}

async function handleGameAnswer(answer, question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  safeBtn.disabled = true;
  phishingBtn.disabled = true;

  const isCorrect = answer === question.correctAnswer;
  await submitGameAnswer(answer, isCorrect);
}

async function handleGameDialogueAnswer(question) {
  if (gameState.hasAnswered) return;

  gameState.hasAnswered = true;
  submitDialogueBtn.disabled = true;

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

  await submitGameAnswer(`dialogue:${selectedMessages.join(",")}`, isCorrect);
}

async function submitGameAnswer(answer, isCorrect) {
  try {
    const answerRef = doc(
      collection(db, `rooms/${currentRoomId}/answers`),
      `${currentUser.uid}_${gameState.currentQuestionIndex}`
    );

    await setDoc(answerRef, {
      playerId: currentUser.uid,
      playerName: currentUser.displayName || "لاعب",
      questionIndex: gameState.currentQuestionIndex,
      answer: answer,
      isCorrect: isCorrect,
      timestamp: serverTimestamp(),
    });

    showWaitingState("تم تسجيل إجابتك! بانتظار اللاعبين...");
  } catch (error) {
    console.error("Error submitting answer:", error);
    showToast("فشل في تسجيل الإجابة", "error");
  }
}

function setupAnswerListener() {
  if (answersUnsubscribe) answersUnsubscribe();

  const answersRef = collection(db, `rooms/${currentRoomId}/answers`);
  const currentQuestionQuery = query(
    answersRef,
    where("questionIndex", "==", gameState.currentQuestionIndex)
  );

  answersUnsubscribe = onSnapshot(currentQuestionQuery, (snapshot) => {
    updateGamePlayersAnswers(snapshot);
    checkAllPlayersAnswered();
  });
}

function updateGamePlayersAnswers(snapshot) {
  gameState.playerAnswers.clear();
  snapshot.docs.forEach((doc) => {
    const answer = doc.data();
    gameState.playerAnswers.set(answer.playerId, answer);
  });

  updatePlayersList();

  // Update waiting text
  const waitingText = document.getElementById("waitingText");
  if (waitingText) {
    waitingText.textContent = `بانتظار اللاعبين... (${gameState.playerAnswers.size}/${gameState.players.length})`;
  }
}

function checkAllPlayersAnswered() {
  if (gameState.playerAnswers.size >= gameState.players.length) {
    // All players answered - room host will handle moving to next question
    console.log(
      "All players answered question",
      gameState.currentQuestionIndex
    );
  }
}

async function showQuestionResults(roomData) {
  const question = gameState.questions[gameState.currentQuestionIndex];
  if (!question) return;

  // Calculate results
  const correctAnswers = Array.from(gameState.playerAnswers.values()).filter(
    (answer) => answer.isCorrect
  ).length;

  showResultsState();

  const resultsHTML = `
    <div class="text-center py-8">
      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
        <span class="text-white text-2xl">📊</span>
      </div>
      <h3 class="text-xl font-bold text-white mb-2">نتيجة السؤال</h3>
      <p class="text-blue-200 mb-4">${
        question.explanation || "لا توجد تفاصيل إضافية"
      }</p>
      
      <div class="bg-white/5 rounded-xl p-4 mb-4">
        <div class="grid grid-cols-2 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-green-400">${correctAnswers}</div>
            <div class="text-sm text-blue-200">أجابوا صح</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-red-400">${
              gameState.players.length - correctAnswers
            }</div>
            <div class="text-sm text-blue-200">أجابوا خطأ</div>
          </div>
        </div>
      </div>
      
      <div class="mt-4">
        <h4 class="text-white font-medium mb-2">الإجابة الصحيحة:</h4>
        <p class="text-blue-200">${getCorrectAnswerText(question)}</p>
      </div>
      
      <p class="text-white/80 text-sm mt-4">الانتقال إلى السؤال التالي خلال 5 ثواني...</p>
    </div>
  `;

  resultsState.innerHTML = resultsHTML;
}

function getCorrectAnswerText(question) {
  switch (question.type) {
    case "sms":
    case "image":
      return question.correctAnswer === "phishing"
        ? "رسالة احتيال ⚠️"
        : "رسالة آمنة ✅";
    case "dialogue":
      return (
        "الرسائل المشبوهة: " +
        (question.correctAnswers.map((idx) => idx + 1).join("، ") || "لا توجد")
      );
    default:
      return "غير معروف";
  }
}

async function showFinalLeaderboard(roomData) {
  const sortedPlayers = [...(roomData.players || [])].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  showResultsState();

  const leaderboardHTML = `
    <div class="text-center py-8">
      <div class="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center">
        <span class="text-white text-3xl">🏆</span>
      </div>
      <h2 class="text-2xl font-bold text-white mb-6">نتيجة اللعبة النهائية</h2>
      
      <div class="space-y-3 max-w-md mx-auto mb-6">
        ${sortedPlayers
          .map(
            (player, index) => `
          <div class="flex items-center justify-between p-4 bg-white/5 rounded-lg ${
            index === 0 ? "border-2 border-yellow-400" : ""
          }">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center ${
                index === 0
                  ? "bg-yellow-500"
                  : index === 1
                  ? "bg-gray-400"
                  : index === 2
                  ? "bg-orange-600"
                  : "bg-blue-500"
              } text-white font-bold">
                ${index + 1}
              </div>
              <div class="text-right">
                <p class="text-white font-medium">${player.displayName}</p>
                ${
                  player.isHost
                    ? '<p class="text-yellow-400 text-xs">👑 المضيف</p>'
                    : ""
                }
              </div>
            </div>
            <div class="text-left">
              <p class="text-white font-bold text-lg">${player.score || 0}</p>
              <p class="text-blue-200 text-xs">نقطة</p>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      
      <div class="flex gap-3 justify-center">
        <button onclick="exitToDashboard()" class="bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200">
          العودة للرئيسية
        </button>
      </div>
    </div>
  `;

  resultsState.innerHTML = leaderboardHTML;
}

// UI State Management (for room.html)
function showLoadingState(message = "جاري التحميل...") {
  if (!loadingState) return;
  loadingState.classList.remove("hidden");
  questionContent.classList.add("hidden");
  waitingState.classList.add("hidden");
  resultsState.classList.add("hidden");

  const loadingText = document.getElementById("loadingText");
  if (loadingText) loadingText.textContent = message;
}

function showQuestionContent() {
  if (!questionContent) return;
  loadingState.classList.add("hidden");
  questionContent.classList.remove("hidden");
  waitingState.classList.add("hidden");
  resultsState.classList.add("hidden");
}

function showWaitingState(message = "بانتظار اللاعبين...") {
  if (!waitingState) return;
  loadingState.classList.add("hidden");
  questionContent.classList.add("hidden");
  waitingState.classList.remove("hidden");
  resultsState.classList.add("hidden");

  const waitingText = document.getElementById("waitingText");
  if (waitingText) waitingText.textContent = message;
}

function showResultsState() {
  if (!resultsState) return;
  loadingState.classList.add("hidden");
  questionContent.classList.add("hidden");
  waitingState.classList.add("hidden");
  resultsState.classList.remove("hidden");
}

function updatePlayersList() {
  if (!playersListElement) return;

  playersListElement.innerHTML = "";

  gameState.players.forEach((player) => {
    const hasAnswered = gameState.playerAnswers.has(player.uid);

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
            hasAnswered ? "bg-green-500" : "bg-yellow-500"
          }"></span>
          <span class="text-blue-200 text-xs">${
            hasAnswered ? "أجاب" : "ينتظر"
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

// ==================== UTILITY FUNCTIONS ====================

// Utility functions
window.exitToDashboard = function () {
  safeCleanup();
  window.location.href = "dashboard.html";
};

function safeCleanup() {
  if (roomUnsubscribe) roomUnsubscribe();
  if (questionsUnsubscribe) questionsUnsubscribe();
  if (answersUnsubscribe) answersUnsubscribe();
  if (roomListener) roomListener();
  if (playersListener) playersListener();
}

async function closeLobby(roomId, userIsHost) {
  if (roomId) {
    const user = auth.currentUser;
    if (user) {
      try {
        // Remove player from room
        const roomRef = doc(db, "rooms", roomId);
        const roomDoc = await getDoc(roomRef);

        if (roomDoc.exists()) {
          const roomData = roomDoc.data();
          const updatedPlayers = roomData.players.filter(
            (p) => p.uid !== user.uid
          );

          // If host leaves or no players left, end the room
          if (userIsHost || updatedPlayers.length === 0) {
            await updateDoc(roomRef, {
              status: "ended",
              endedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(roomRef, {
              players: updatedPlayers,
            });
          }
        }

        // Remove player from subcollection
        const playerRef = doc(db, `rooms/${roomId}/players`, user.uid);
        await updateDoc(playerRef, {
          leftAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error leaving room:", error);
      }
    }

    // Remove listeners
    safeCleanup();
    currentRoomId = null;
  }

  hideModal(document.getElementById("lobbyModal"));
}

function closeAllModals() {
  const modals = [
    "roomCreationModal",
    "joinRoomModal",
    "lobbyModal",
    "inviteFriendsModal",
  ];

  modals.forEach((modalId) => {
    hideModal(document.getElementById(modalId));
  });
}

// Modal utilities
function showModal(modal) {
  if (!modal) return;
  modal.classList.remove("opacity-0", "pointer-events-none");
  const content = modal.querySelector(".bg-white\\/10");
  if (content) {
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  }
}

function hideModal(modal) {
  if (!modal) return;
  modal.classList.add("opacity-0", "pointer-events-none");
  const content = modal.querySelector(".bg-white\\/10");
  if (content) {
    content.classList.add("scale-95");
    content.classList.remove("scale-100");
  }
}

// Toast notification
function showToast(message, type = "info") {
  document.dispatchEvent(
    new CustomEvent("showToast", { detail: { message, type } })
  );
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className =
    "fixed top-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50";
  errorDiv.innerHTML = `
    <div class="flex items-center justify-between">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="text-white">✕</button>
    </div>
  `;
  document.body.appendChild(errorDiv);

  setTimeout(() => errorDiv.remove(), 5000);
}

// Show results modal (placeholder)
function showResultsModal(roomId) {
  // Implement results display logic here
  console.log("Game ended, showing results for room:", roomId);
}

// Initialize room system
document.addEventListener("DOMContentLoaded", function () {
  // Only setup room creation if we're on dashboard
  if (document.getElementById("createRoomBtn")) {
    setupRoomCreationModal();
  }

  // Only initialize game if we're on room page
  if (document.getElementById("questionContainer")) {
    initializeRoomGame();
  }

  // Close modals with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });
});

// Handle page unload
window.addEventListener("beforeunload", safeCleanup);

// Export the functions
export { submitAnswer, startGame, startQuestion };
