// room-system.js - Fixed version with proper exports and function order
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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Room state management
let currentRoomId = null;
let roomListener = null;
let playersListener = null;
let currentQuizType = null;
let currentQuestionCount = 10;
let isHost = false;

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
    const uniquePlayers = roomData.players.filter((p, index, self) => 
      index === self.findIndex((t) => t.uid === p.uid)
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

// ... rest of the room-system.js code remains the same ...
// ... rest of the room-system.js code remains the same ...

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
      if (roomData.status === "started") {
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

    // Initialize game state
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

    // After 3 seconds, start the first question
    setTimeout(async () => {
      await startQuestion(roomId, 0);
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
      status: "in-progress",
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

    // Update room with processed scores
    await updateDoc(roomRef, {
      players: updatedPlayers,
      status: "show-results", // Brief results display
    });

    // Show results for 3 seconds, then next question
    setTimeout(async () => {
      await startQuestion(roomId, questionIndex + 1);
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

    // Shuffle questions using room-specific seed for consistency
    questions = shuffleArrayWithSeed(questions, seed);

    // Take the required number of questions
    questions = questions.slice(0, questionCount);

    // Add questions to Firestore
    for (let i = 0; i < questions.length; i++) {
      await addDoc(questionsRef, {
        ...questions[i],
        order: i,
        createdAt: serverTimestamp(),
      });
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
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- Seeded random number generator ---
function seededRandom(seed) {
  let x = Math.sin(seed.hashCode()) * 10000;
  return x - Math.floor(x);
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
    console.error("Error loading SMS questions:", error);
    return [];
  }
}

async function loadDialogueQuestions(timestamp) {
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
    console.error("Error loading dialogue questions:", error);
    return [];
  }
}

async function loadImageQuestions(timestamp) {
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

  // Load friends list
  loadFriendsForInvitation(friendListElement, roomId);

  closeInviteModalBtn?.addEventListener("click", () => {
    hideModal(inviteModal);
  });

  sendInvitesBtn?.addEventListener("click", () => {
    sendInvitesToFriends(roomId);
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

    for (const docSnapshot of querySnapshot.docs) {
      const friendData = docSnapshot.data();
      const friendUserRef = doc(db, "users", friendData.friendId);
      const friendUserDoc = await getDoc(friendUserRef);

      if (friendUserDoc.exists()) {
        const friendUserData = friendUserDoc.data();
        const friendElement = document.createElement("div");
        friendElement.className =
          "flex items-center justify-between p-3 bg-white/5 rounded-lg mb-2";
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
          <button class="invite-friend-btn bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-lg text-sm hover:from-purple-600 hover:to-pink-700 transition-all duration-200" data-friend-id="${
            friendData.friendId
          }">
            دعوة
          </button>
        `;
        container.appendChild(friendElement);
      }
    }

    // Add event listeners to invite buttons
    container.querySelectorAll(".invite-friend-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const friendId = this.getAttribute("data-friend-id");
        sendFriendInvitation(friendId, roomId);
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

    // Create invitation
    const inviteRef = doc(collection(db, "roomInvites"));
    await setDoc(inviteRef, {
      id: inviteRef.id,
      roomId: roomId,
      quizType: currentQuizType,
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

// --- Utility Functions ---
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
    if (roomListener) roomListener();
    if (playersListener) playersListener();

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

// Show results modal (placeholder)
function showResultsModal(roomId) {
  // Implement results display logic here
  console.log("Game ended, showing results for room:", roomId);
}

// Initialize room system
document.addEventListener("DOMContentLoaded", function () {
  setupRoomCreationModal();

  // Close modals with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });
});
// Export the new functions
export { submitAnswer, startGame, startQuestion };
