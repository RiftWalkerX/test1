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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Room state management
let currentRoomId = null;
let roomListener = null;
let playersListener = null;
let currentQuizType = null;
let currentQuestionCount = 10;

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

// Create a new room
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

    // Show loading state
    const createBtn = document.getElementById("createRoomConfirmBtn");
    const originalText = createBtn.textContent;
    createBtn.textContent = "جاري الإنشاء...";
    createBtn.disabled = true;

    // Create room document
    const roomRef = await addDoc(collection(db, "rooms"), {
      hostId: user.uid,
      hostName: user.displayName || "مضيف",
      roomName: roomName,
      quizType: quizType,
      questionCount: questionCount,
      maxPlayers: maxPlayers,
      status: "waiting",
      players: [
        {
          uid: user.uid,
          displayName: user.displayName || "مضيف",
          isHost: true,
          isReady: true,
          score: 0,
        },
      ],
      currentQuestion: 0,
      scores: {},
      createdAt: serverTimestamp(),
    });

    currentRoomId = roomRef.id;

    // Add host as first player in subcollection
    await setDoc(doc(db, `rooms/${roomRef.id}/players`, user.uid), {
      uid: user.uid,
      displayName: user.displayName || "مضيف",
      isHost: true,
      isReady: true,
      score: 0,
      joinedAt: serverTimestamp(),
    });

    showToast("تم إنشاء الغرفة بنجاح!", "success");
    createBtn.textContent = originalText;
    createBtn.disabled = false;
    hideModal(document.getElementById("roomCreationModal"));

    // Navigate directly to room page
    setTimeout(() => {
      window.location.href = `room.html?roomId=${currentRoomId}`;
    }, 1000);
  } catch (error) {
    console.error("Error creating room:", error);
    showToast("فشل في إنشاء الغرفة: " + error.message, "error");

    // Reset button state
    const createBtn = document.getElementById("createRoomConfirmBtn");
    createBtn.textContent = "إنشاء الغرفة";
    createBtn.disabled = false;
  }
}

// Join an existing room
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

    // Show loading state
    const joinBtn = document.getElementById("joinRoomConfirmBtn");
    const originalText = joinBtn.textContent;
    joinBtn.textContent = "جاري الانضمام...";
    joinBtn.disabled = true;

    // Check if room exists and is waiting for players
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("لم يتم العثور على الغرفة، يرجى التحقق من الرمز", "error");
      joinBtn.textContent = originalText;
      joinBtn.disabled = false;
      return;
    }

    const roomData = roomDoc.data();

    if (roomData.status !== "waiting") {
      showToast("لا يمكن الانضمام إلى هذه الغرفة حالياً", "error");
      joinBtn.textContent = originalText;
      joinBtn.disabled = false;
      return;
    }

    if (roomData.players.length >= roomData.maxPlayers) {
      showToast("الغرفة ممتلئة، لا يمكن الانضمام الآن", "error");
      joinBtn.textContent = originalText;
      joinBtn.disabled = false;
      return;
    }

    // Check if user is already in the room
    const existingPlayer = roomData.players.find((p) => p.uid === user.uid);
    if (existingPlayer) {
      showToast("أنت بالفعل في هذه الغرفة", "info");
      joinBtn.textContent = originalText;
      joinBtn.disabled = false;
      hideModal(document.getElementById("joinRoomModal"));
      // Navigate to room directly
      window.location.href = `room.html?roomId=${roomId}`;
      return;
    }

    // Add user to room players
    await updateDoc(roomRef, {
      players: arrayUnion({
        uid: user.uid,
        displayName: user.displayName || "لاعب",
        isHost: false,
        isReady: false,
        score: 0,
      }),
    });

    // Add user to players subcollection
    await setDoc(doc(db, `rooms/${roomId}/players`, user.uid), {
      uid: user.uid,
      displayName: user.displayName || "لاعب",
      isHost: false,
      isReady: false,
      score: 0,
      joinedAt: serverTimestamp(),
    });

    currentRoomId = roomId;
    currentQuizType = roomData.quizType;
    currentQuestionCount = roomData.questionCount;

    showToast("تم الانضمام إلى الغرفة بنجاح!", "success");
    joinBtn.textContent = originalText;
    joinBtn.disabled = false;
    hideModal(document.getElementById("joinRoomModal"));

    // Navigate directly to room page instead of showing lobby
    setTimeout(() => {
      window.location.href = `room.html?roomId=${roomId}`;
    }, 1000);
  } catch (error) {
    console.error("Error joining room:", error);
    showToast("فشل في الانضمام إلى الغرفة: " + error.message, "error");

    // Reset button state
    const joinBtn = document.getElementById("joinRoomConfirmBtn");
    joinBtn.textContent = "انضم الآن";
    joinBtn.disabled = false;
  }
}

// --- Lobby Modal (kept for reference but not used in direct navigation) ---
function showLobbyModal(roomId, isHost) {
  // This function is kept but won't be called since we navigate directly to room.html
  // You can remove it or keep it for future use
}

function setupRoomListeners(
  roomId,
  playerListElement,
  roomNameElement,
  roomInfoElement,
  startGameBtn,
  readyBtn,
  isHost
) {
  // This function is kept for reference but won't be used in direct navigation
}

// Toggle ready status for players
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
          "flex items-center justify-between p-3 bg-white/5 rounded-lg";
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
          <button class="invite-friend-btn room-action-btn invite-btn" data-friend-id="${
            friendData.friendId
          }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
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

// --- Start Game ---
async function startGame(roomId) {
  try {
    await updateDoc(doc(db, "rooms", roomId), {
      status: "started",
      startedAt: serverTimestamp(),
      currentQuestion: 0,
      scores: {},
    });
  } catch (error) {
    console.error("Error starting game:", error);
    showToast("فشل في بدء اللعبة", "error");
  }
}

// --- Navigate to Quiz Page ---
function navigateToQuizPage(quizType, roomId, questionCount) {
  closeAllModals();

  setTimeout(() => {
    window.location.href = `training-page.html?roomId=${roomId}&quizType=${quizType}&questionCount=${questionCount}&mode=multiplayer`;
  }, 500);
}

// --- Utility Functions ---
async function closeLobby(roomId, isHost) {
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
          if (isHost || updatedPlayers.length === 0) {
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
