// room-invites.js - Fixed version with proper imports
import { db, auth } from "./firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  onSnapshot,
  getDoc,
  arrayUnion, // ADD THIS IMPORT
  serverTimestamp, // ADD THIS IMPORT
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SEND ROOM INVITE ---
export const sendRoomInvite = async function (roomId, quizType, friendId) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    // Prevent duplicate invites
    const existingInvitesRef = collection(db, "roomInvites");
    const q = query(
      existingInvitesRef,
      where("roomId", "==", roomId),
      where("toUserId", "==", friendId),
      where("status", "==", "pending")
    );
    const existingInvites = await getDocs(q);
    if (!existingInvites.empty) {
      document.dispatchEvent(
        new CustomEvent("showToast", {
          detail: {
            message: "لقد أرسلت بالفعل دعوة لهذه الغرفة إلى هذا الصديق.",
            type: "warning",
          },
        })
      );
      return;
    }
    // Create new invitation
    const inviteRef = doc(collection(db, "roomInvites"));
    await setDoc(inviteRef, {
      id: inviteRef.id,
      roomId: roomId,
      quizType: quizType,
      fromUserId: user.uid,
      fromUserName: user.displayName || "مستخدم",
      toUserId: friendId,
      status: "pending",
      createdAt: new Date(),
    });
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "تم إرسال دعوة الغرفة بنجاح!", type: "success" },
      })
    );
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "فشل في إرسال دعوة الغرفة: " + error.message,
          type: "error",
        },
      })
    );
  }
};

// --- LOAD ROOM INVITES ---
export const loadRoomInvites = async function () {
  const user = auth.currentUser;
  if (!user) return;

  const invitesRef = collection(db, "roomInvites");
  const q = query(
    invitesRef,
    where("toUserId", "==", user.uid),
    where("status", "==", "pending")
  );

  const querySnapshot = await getDocs(q);
  const notificationContainer = document.getElementById(
    "room-invite-notification"
  );
  const invitesList = document.getElementById("roomInvitesList");
  if (!notificationContainer) return;

  if (querySnapshot.empty) {
    notificationContainer.classList.add("hidden");
    document.getElementById("roomInviteCount")?.classList.add("hidden");
    return;
  }
  invitesList.innerHTML = "";

  for (const docSnapshot of querySnapshot.docs) {
    const invite = docSnapshot.data();
    const fromUserRef = doc(db, "users", invite.fromUserId);
    const fromUserDoc = await getDoc(fromUserRef);
    if (fromUserDoc.exists()) {
      const fromUserData = fromUserDoc.data();

      const inviteElement = document.createElement("div");
      inviteElement.className =
        "group relative overflow-hidden bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-sm border border-white/20 rounded-2xl p-5 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300";
      inviteElement.innerHTML = `
        <div class="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="relative">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <div>
                <h5 class="text-lg font-semibold text-white">${
                  invite.quizType || "تدريب جماعي"
                }</h5>
                <p class="text-purple-200 text-sm">دعوة من ${
                  fromUserData.displayName || "مستخدم" // FIXED: fromUserData.fromUserName should be fromUserData.displayName
                }</p>
              </div>
            </div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-200 border border-purple-500/30">
              ${new Date(
                invite.createdAt?.toDate?.() || invite.createdAt
              ).toLocaleDateString("ar-SA")}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="acceptRoomInvite('${docSnapshot.id}', '${
        invite.roomId
      }')" class="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95">
              <div class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                انضم الآن
              </div>
            </button>
            <button onclick="declineRoomInvite('${
              docSnapshot.id
            }')" class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all duration-200 border border-white/20 hover:border-white/30">
              <div class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                رفض
              </div>
            </button>
          </div>
        </div>
      `;
      invitesList.appendChild(inviteElement);
    }
  }

  notificationContainer.classList.remove("hidden");
};

// --- HANDLE ROOM INVITE ACTIONS ---
window.acceptRoomInvite = async function (inviteId, roomId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      showToast("يجب تسجيل الدخول أولاً", "error");
      return;
    }

    // Check if room exists and is waiting
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("الغرفة لم تعد موجودة", "error");
      // Mark invite as expired
      await updateDoc(doc(db, "roomInvites", inviteId), {
        status: "expired",
        respondedAt: serverTimestamp(),
      });
      await loadRoomInvites();
      return;
    }

    const roomData = roomDoc.data();

    if (roomData.status !== "waiting") {
      showToast("لا يمكن الانضمام إلى هذه الغرفة حالياً", "error");
      await updateDoc(doc(db, "roomInvites", inviteId), {
        status: "expired",
        respondedAt: serverTimestamp(),
      });
      await loadRoomInvites();
      return;
    }

    // Check if user is already in the room
    const existingPlayer = roomData.players.find((p) => p.uid === user.uid);
    if (existingPlayer) {
      showToast("أنت بالفعل في هذه الغرفة", "info");
      await updateDoc(doc(db, "roomInvites", inviteId), {
        status: "accepted",
        respondedAt: serverTimestamp(),
      });
      // Navigate to lobby instead of directly to room
      window.location.href = `dashboard.html?joinRoom=${roomId}`;
      return;
    }

    // Add user to room
    const playerData = {
      uid: user.uid,
      displayName: user.displayName || "لاعب",
      isHost: false,
      isReady: false,
      score: 0,
      joinedAt: new Date().toISOString(),
    };

    await updateDoc(roomRef, {
      players: arrayUnion(playerData),
    });

    // Add to players subcollection
    await setDoc(doc(db, `rooms/${roomId}/players`, user.uid), {
      ...playerData,
      joinedAt: serverTimestamp(),
    });

    // Update invite status
    await updateDoc(doc(db, "roomInvites", inviteId), {
      status: "accepted",
      respondedAt: serverTimestamp(),
    });

    showToast("تم الانضمام إلى الغرفة بنجاح!", "success");

    // Navigate to dashboard with room parameter to open lobby
    window.location.href = `dashboard.html?joinRoom=${roomId}`;
  } catch (error) {
    console.error("Error accepting room invite:", error);
    showToast("فشل في الانضمام إلى الغرفة: " + error.message, "error");
  }
};

window.declineRoomInvite = async function (inviteId) {
  try {
    const inviteRef = doc(db, "roomInvites", inviteId);
    await updateDoc(inviteRef, {
      status: "declined",
      respondedAt: serverTimestamp(), // Use serverTimestamp instead of new Date()
    });
    await loadRoomInvites();
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "تم رفض دعوة الغرفة.", type: "info" },
      })
    );
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "فشل في رفض دعوة الغرفة: " + error.message,
          type: "error",
        },
      })
    );
  }
};

// --- REALTIME ROOM INVITE LISTENER ---
export const setupRoomInviteListener = function () {
  const user = auth.currentUser;
  if (!user) return;
  const invitesRef = collection(db, "roomInvites");
  const q = query(
    invitesRef,
    where("toUserId", "==", user.uid),
    where("status", "==", "pending")
  );
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      loadRoomInvites();
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const invite = change.doc.data();
          document.dispatchEvent(
            new CustomEvent("showToast", {
              detail: {
                message: `لديك دعوة غرفة جديدة من ${invite.fromUserName}`,
                type: "info",
              },
            })
          );
        }
      });
    }
  });
};

// Helper function for toast notifications (if not available globally)
function showToast(message, type = "info") {
  document.dispatchEvent(
    new CustomEvent("showToast", { detail: { message, type } })
  );
}
