import { db, auth } from "./firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SEND ROOM INVITE ---
export const sendRoomInvite = async function (roomId, quizType, friendId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      showToast("الرجاء تسجيل الدخول أولاً", "warning");
      return;
    }

    // Check if invitation already exists
    const existingInvitesRef = collection(db, "roomInvites");
    const q = query(
      existingInvitesRef,
      where("roomId", "==", roomId),
      where("toUserId", "==", friendId),
      where("status", "==", "pending")
    );

    const existingInvites = await getDocs(q);
    if (!existingInvites.empty) {
      showToast("لقد أرسلت دعوة لهذه الغرفة لصديقك مسبقاً.", "info");
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

    showToast("تم إرسال دعوة الغرفة بنجاح!", "success");
  } catch (error) {
    console.error("Error sending room invite:", error);
    showToast("فشل في إرسال دعوة الغرفة: " + error.message, "error");
  }
};

// --- LOAD ROOM INVITES ---
export const loadRoomInvites = async function () {
  const user = auth.currentUser;
  if (!user) return;

  try {
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

    // Clear previous content
    notificationContainer.innerHTML = "";
    if (invitesList) invitesList.innerHTML = "";

    if (querySnapshot.empty) {
      notificationContainer.classList.add("hidden");
      document.getElementById("roomInviteCount")?.classList.add("hidden");
      return;
    }

    // Create notification header for notification container
    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-3";
    header.innerHTML = `
      <h3 class="text-lg font-bold text-white">دعوات الغرف</h3>
      <span class="bg-red-500 text-white text-xs rounded-full px-2 py-1">${querySnapshot.size}</span>
    `;
    notificationContainer.appendChild(header);

    // Add each invitation to both containers
    for (const docSnapshot of querySnapshot.docs) {
      const invite = docSnapshot.data();
      const fromUserRef = doc(db, "users", invite.fromUserId);
      const fromUserDoc = await getDoc(fromUserRef);

      if (fromUserDoc.exists()) {
        const fromUserData = fromUserDoc.data();

        // Create notification version
        const inviteElement = document.createElement("div");
        inviteElement.className = "bg-white/10 rounded-lg p-4 mb-3";
        inviteElement.innerHTML = `
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
              <span class="text-white font-bold">${
                fromUserData.displayName?.charAt(0) || "?"
              }</span>
            </div>
            <div>
              <p class="text-white font-medium">${
                fromUserData.displayName || "مستخدم"
              }</p>
              <p class="text-blue-200 text-sm">يدعوك للانضمام إلى غرفة</p>
            </div>
          </div>
          <p class="text-white text-sm mb-3">نوع التحدي: ${getQuizTypeName(
            invite.quizType
          )}</p>
          <div class="flex gap-2">
            <button class="accept-room-invite flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm transition-colors" data-invite-id="${
              docSnapshot.id
            }" data-room-id="${invite.roomId}">
              قبول الدعوة
            </button>
            <button class="deny-room-invite bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm transition-colors" data-invite-id="${
              docSnapshot.id
            }">
              رفض
            </button>
          </div>
        `;
        notificationContainer.appendChild(inviteElement);

        // Create detailed version for invites list
        if (invitesList) {
          const detailedInviteElement = document.createElement("div");
          detailedInviteElement.className =
            "group relative overflow-hidden bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-sm border border-white/20 rounded-2xl p-5 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300";
          detailedInviteElement.innerHTML = `
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
                      fromUserData.displayName || "مستخدم"
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
          invitesList.appendChild(detailedInviteElement);
        }
      }
    }

    // Add event listeners to the notification buttons
    notificationContainer
      .querySelectorAll(".accept-room-invite")
      .forEach((btn) => {
        btn.addEventListener("click", function () {
          const inviteId = this.getAttribute("data-invite-id");
          const roomId = this.getAttribute("data-room-id");
          acceptRoomInvite(inviteId, roomId);
        });
      });

    notificationContainer
      .querySelectorAll(".deny-room-invite")
      .forEach((btn) => {
        btn.addEventListener("click", function () {
          const inviteId = this.getAttribute("data-invite-id");
          denyRoomInvite(inviteId);
        });
      });

    notificationContainer.classList.remove("hidden");
    document.getElementById("roomInviteCount")?.classList.remove("hidden");
  } catch (error) {
    console.error("Error loading room invites:", error);
    showToast("فشل تحميل دعوات الغرف", "error");
  }
};

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

// Accept room invitation
window.acceptRoomInvite = async function (inviteId, roomId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      showToast("الرجاء تسجيل الدخول أولاً", "warning");
      return;
    }

    const inviteRef = doc(db, "roomInvites", inviteId);
    await updateDoc(inviteRef, {
      status: "accepted",
      respondedAt: new Date(),
    });

    // Check if room still exists and is joinable
    const roomRef = doc(db, "rooms", roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      showToast("لم تعد الغرفة موجودة", "error");
      return;
    }

    const roomData = roomDoc.data();
    if (roomData.status !== "waiting") {
      showToast("لا يمكن الانضمام إلى الغرفة حالياً", "error");
      return;
    }

    // Redirect to room page
    window.location.href = `room.html?roomId=${roomId}`;
  } catch (error) {
    console.error("Error accepting room invite:", error);
    showToast("فشل في قبول الدعوة: " + error.message, "error");
  }
};

// Deny/decline room invitation (keeping both function names for compatibility)
window.denyRoomInvite = async function (inviteId) {
  try {
    const inviteRef = doc(db, "roomInvites", inviteId);
    await updateDoc(inviteRef, {
      status: "denied",
      respondedAt: new Date(),
    });

    showToast("تم رفض الدعوة", "info");

    // Reload invitations to update UI
    loadRoomInvites();
  } catch (error) {
    console.error("Error denying room invite:", error);
    showToast("فشل في رفض الدعوة: " + error.message, "error");
  }
};

// Alias for declineRoomInvite for compatibility
window.declineRoomInvite = window.denyRoomInvite;

// Listen for real-time room invitation updates
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
          showToast(`لديك دعوة غرفة جديدة من ${invite.fromUserName}`, "info");
        }
      });
    }
  });
};

// Toast notification function
function showToast(message, type = "info") {
  document.dispatchEvent(
    new CustomEvent("showToast", { detail: { message, type } })
  );
}
