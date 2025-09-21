import { db, auth } from "./firebase-init.js";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- FRIEND REQUESTS PANEL ---
export async function loadFriendRequests() {
  const user = auth.currentUser;
  if (!user) return;

  const requestsRef = collection(db, "friendRequests");
  const q = query(
    requestsRef,
    where("toUserId", "==", user.uid),
    where("status", "==", "pending")
  );

  const querySnapshot = await getDocs(q);
  const notification = document.getElementById("friend-request-notification");
  const requestsList = document.getElementById("friendRequestsList");
  
  if (!notification || !requestsList) return;

  if (querySnapshot.empty) {
    notification.classList.add("hidden");
    return;
  }

  requestsList.innerHTML = "";
  let requestCount = 0;
  
  for (const docSnapshot of querySnapshot.docs) {
    const request = docSnapshot.data();
    const fromUserRef = doc(db, "users", request.fromUserId);
    const fromUserDoc = await getDoc(fromUserRef);

    if (fromUserDoc.exists()) {
      const fromUserData = fromUserDoc.data();
      requestCount++;
      
      const requestElement = document.createElement("div");
      requestElement.className = "mb-3 p-3 bg-white/10 rounded-lg";
      requestElement.innerHTML = `
        <p class="text-white mb-2">طلب صداقة من: <strong>${
          fromUserData.displayName || "مستخدم غير معروف"
        }</strong></p>
        <div class="flex gap-2">
          <button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm" onclick="acceptFriendRequest('${
            docSnapshot.id
          }', '${request.fromUserId}')">قبول</button>
          <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm" onclick="denyFriendRequest('${
            docSnapshot.id
          }')">رفض</button>
        </div>
      `;
      requestsList.appendChild(requestElement);
    }
  }

  notification.classList.remove("hidden");
}

// --- FRIENDS LIST PANEL ---
export async function loadFriendsList() {
  const user = auth.currentUser;
  if (!user) return;

  const friendsRef = collection(db, "friends");
  const q = query(friendsRef, where("userId", "==", user.uid));
  const querySnapshot = await getDocs(q);
  const friendsList = document.getElementById("friends-list");
  if (!friendsList) return;

  friendsList.innerHTML =
    "<h4 class='text-white font-bold mb-4'>قائمة الأصدقاء:</h4>";
  if (querySnapshot.empty) {
    friendsList.innerHTML +=
      "<p class='text-blue-200'>لا يوجد أصدقاء بعد. أرسل بعض طلبات الصداقة!</p>";
    return;
  }
  for (const docSnapshot of querySnapshot.docs) {
    const friendData = docSnapshot.data();
    const friendUserRef = doc(db, "users", friendData.friendId);
    const friendUserDoc = await getDoc(friendUserRef);
    if (friendUserDoc.exists()) {
      const friendUserData = friendUserDoc.data();
      const friendElement = document.createElement("div");
      friendElement.className = "friend-item mb-3 p-3 bg-white/10 rounded-lg";
      friendElement.innerHTML = `<p class="text-white"><strong>${
        friendUserData.displayName || "مستخدم غير معروف"
      }</strong> - النقاط: ${
        friendUserData.stats?.totalPoints || 0
      } - السلسلة: ${friendUserData.streak || 0}🔥</p>`;
      friendsList.appendChild(friendElement);
    }
  }
  friendsList.classList.remove("hidden");
}

// --- HANDLE FRIEND REQUEST ACTIONS ---
window.acceptFriendRequest = async (requestId, fromUserId) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const fromUserRef = doc(db, "users", fromUserId);
    const fromUserDoc = await getDoc(fromUserRef);
    const fromUserData = fromUserDoc.data();
    const fromUserName = fromUserData.displayName || "مستخدم غير معروف";
    const requestRef = doc(db, "friendRequests", requestId);
    await updateDoc(requestRef, {
      status: "accepted",
      respondedAt: new Date(),
    });

    // Add to both users' friends
    const friendsRef1 = doc(db, "friends", `${user.uid}_${fromUserId}`);
    await setDoc(friendsRef1, {
      userId: user.uid,
      friendId: fromUserId,
      friendName: fromUserName,
      createdAt: new Date(),
    });
    const friendsRef2 = doc(db, "friends", `${fromUserId}_${user.uid}`);
    await setDoc(friendsRef2, {
      userId: fromUserId,
      friendId: user.uid,
      friendName: user.displayName || "مستخدم",
      createdAt: new Date(),
    });

    document
      .getElementById("friend-request-notification")
      ?.classList.add("hidden");
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: `أنت الآن صديق مع ${fromUserName}!`,
          type: "success",
        },
      })
    );
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "فشل في قبول طلب الصداقة.", type: "error" },
      })
    );
  }
};
window.denyFriendRequest = async (requestId) => {
  try {
    const requestRef = doc(db, "friendRequests", requestId);
    await deleteDoc(requestRef);
    document
      .getElementById("friend-request-notification")
      ?.classList.add("hidden");
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "تم رفض طلب الصداقة.", type: "info" },
      })
    );
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "فشل في رفض طلب الصداقة.", type: "error" },
      })
    );
  }
};

// --- SEND FRIEND REQUEST ---
export async function sendFriendRequest(friendId) {
  const user = auth.currentUser;
  if (!user) return;

  if (friendId.trim() === "") {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "يرجى إدخال معرف مستخدم صحيح.", type: "warning" },
      })
    );
    return;
  }
  if (friendId === user.uid) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "لا يمكنك إضافة نفسك كصديق.", type: "warning" },
      })
    );
    return;
  }
  const friendRef = doc(db, "users", friendId);
  const friendDoc = await getDoc(friendRef);
  if (!friendDoc.exists()) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: "لم يتم العثور على المستخدم. يرجى التحقق من معرف المستخدم.",
          type: "error",
        },
      })
    );
    return;
  }
  const friendData = friendDoc.data();
  const friendName = friendData.displayName || "مستخدم غير معروف";
  const friendsRef = doc(db, "friends", `${user.uid}_${friendId}`);
  const friendsDoc = await getDoc(friendsRef);
  if (friendsDoc.exists()) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: `أنت بالفعل صديق مع ${friendName}.`, type: "info" },
      })
    );
    return;
  }
  // Prevent duplicate requests (forward & reverse)
  const requestsRef = collection(db, "friendRequests");
  const q = query(
    requestsRef,
    where("fromUserId", "==", user.uid),
    where("toUserId", "==", friendId),
    where("status", "==", "pending")
  );
  const existingRequest = await getDocs(q);
  if (!existingRequest.empty) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: `تم إرسال طلب صداقة بالفعل إلى ${friendName}.`,
          type: "info",
        },
      })
    );
    return;
  }
  const reverseQ = query(
    requestsRef,
    where("fromUserId", "==", friendId),
    where("toUserId", "==", user.uid),
    where("status", "==", "pending")
  );
  const reverseRequest = await getDocs(reverseQ);
  if (!reverseRequest.empty) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: `${friendName} أرسل لك بالفعل طلب صداقة. يرجى التحقق من الإشعارات الخاصة بك.`,
          type: "info",
        },
      })
    );
    return;
  }
  try {
    const newRequestRef = doc(collection(db, "friendRequests"));
    await setDoc(newRequestRef, {
      fromUserId: user.uid,
      fromUserName: user.displayName || "مستخدم",
      toUserId: friendId,
      toUserName: friendName,
      status: "pending",
      createdAt: new Date(),
    });
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: {
          message: `تم إرسال طلب الصداقة إلى ${friendName} بنجاح!`,
          type: "success",
        },
      })
    );
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: "فشل في إرسال طلب الصداقة.", type: "error" },
      })
    );
  }
}
