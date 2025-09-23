// room-game.js - Modified to work like older quiz system
import { auth, db } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  increment,
  collection,
  onSnapshot,
  getDoc,
  addDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import achievementService from "./achievement-service.js";
import { updateStreakWithPoints } from "./streak.js";

let questionStartTime = 0;
let currentQuizScore = 0;
let currentQuizTotal = 0;
let scenarios = [];
let index = 0;
let score = 0;
let answered = false;
let currentMessageIndex = 0;
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

let msgCard, qIndex, qTotal, bar, feedback, nextBtn, finishBtn, leaderboard;
let currentQuizType = "mixed";

document.addEventListener("DOMContentLoaded", function () {
  msgCard = document.querySelector("#msgCard");
  qIndex = document.querySelector("#qIndex");
  qTotal = document.querySelector("#qTotal");
  bar = document.querySelector("#bar");
  feedback = document.querySelector("#feedback");
  nextBtn = document.querySelector("#nextBtn");
  finishBtn = document.querySelector("#finishBtn");
  leaderboard = document.querySelector("#leaderboard");

  if (
    !msgCard ||
    !qIndex ||
    !qTotal ||
    !bar ||
    !feedback ||
    !nextBtn ||
    !finishBtn ||
    !leaderboard
  ) {
    console.error("Some DOM elements are missing. Check your HTML structure.");
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    initializeRoomGame();
  });
});

async function initializeRoomGame() {
  try {
    if (!roomId) {
      msgCard.innerHTML = "<p>No room ID provided.</p>";
      return;
    }

    // Get room data to determine quiz type
    const roomDoc = await getDoc(doc(db, "rooms", roomId));
    if (!roomDoc.exists()) {
      msgCard.innerHTML = "<p>Room not found.</p>";
      return;
    }

    const roomData = roomDoc.data();
    currentQuizType = roomData.quizType || "mixed";

    // Join the room as player if not already joined
    await setDoc(doc(db, `rooms/${roomId}/players`, auth.currentUser.uid), {
      displayName: auth.currentUser.displayName || "Player",
      score: 0,
      isHost: false,
    });

    // Listen for room status changes
    onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === "started") {
          loadScenarios();
        } else if (data.status === "finished") {
          showLeaderboard();
        }
      }
    });

    // Show waiting message
    msgCard.innerHTML = "<p>Waiting for host to start the game...</p>";
  } catch (error) {
    console.error("Error initializing room game:", error);
    msgCard.innerHTML = "<p>Error joining room: " + error.message + "</p>";
  }
}

async function loadScenarios() {
  try {
    // Load questions based on quiz type
    let quizUrl = "";
    switch (currentQuizType) {
      case "sms":
        quizUrl =
          "https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json";
        break;
      case "dialogue":
        quizUrl =
          "https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/dialogues.json";
        break;
      case "image":
        quizUrl =
          "https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/image.json";
        break;
      case "mixed":
      default:
        // For mixed, we'll use SMS questions as default
        quizUrl =
          "https://raw.githubusercontent.com/ShadowKnightX/assets-for-zerofake/main/sms-quiz.json";
        break;
    }

    const response = await fetch(quizUrl + "?v=" + Date.now());
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const text = await response.text();
    scenarios = JSON.parse(text);

    if (scenarios.length === 0) {
      msgCard.innerHTML = "<p>No scenarios available.</p>";
      return;
    }

    qTotal.textContent = scenarios.length;
    shuffle(scenarios);
    load();
  } catch (error) {
    msgCard.innerHTML = "<p>Error loading scenarios: " + error.message + "</p>";
    console.error("Fetch error:", error);
  }
}

function load() {
  questionStartTime = Date.now();

  if (currentQuizType === "dialogue") {
    loadDialogueScenario();
  } else {
    loadStandardScenario();
  }

  qIndex.textContent = index + 1;
  bar.style.width = `${(index / scenarios.length) * 100}%`;
  feedback.classList.add("hidden");
  feedback.classList.remove("bad");
  nextBtn.classList.add("hidden");
  finishBtn.classList.add("hidden");
  leaderboard.classList.add("hidden");
  answered = false;
}

function loadDialogueScenario() {
  const scenario = scenarios[index];
  currentMessageIndex = 0;
  msgCard.innerHTML = scenario.messages
    .map(
      (msg, i) => `
    <div class="bubble ${msg.sender === "you" ? "you" : "them"}">
      <p class="msg-text">${msg.text}</p>
      <div class="choice-buttons ${i === 0 ? "" : "hidden"}" data-index="${i}">
        <button class="btn-primary" onclick="choose(${i}, true)">Phishing</button>
        <button class="btn-accent" onclick="choose(${i}, false)">Safe</button>
      </div>
    </div>
  `
    )
    .join("");
}

function loadStandardScenario() {
  const scenario = scenarios[index];

  if (currentQuizType === "image") {
    msgCard.innerHTML = `
      <div class="scenario-content">
        <h3>${scenario.title || "Identify the content"}</h3>
        <img src="${scenario.text || scenario.url || ""}" alt="Scenario image" 
             onerror="this.style.display='none'" 
             style="max-width: 100%; max-height: 300px; border-radius: 8px;">
        <div class="choice-buttons" style="margin-top: 20px;">
          <button class="btn-primary" onclick="choose(0, true)">Phishing</button>
          <button class="btn-accent" onclick="choose(0, false)">Safe</button>
        </div>
      </div>
    `;
  } else {
    // SMS or mixed
    msgCard.innerHTML = `
      <div class="scenario-content">
        <div class="sms-bubble">
          <p class="msg-text">${scenario.text}</p>
          <div class="choice-buttons" style="margin-top: 20px;">
            <button class="btn-primary" onclick="choose(0, true)">Phishing</button>
            <button class="btn-accent" onclick="choose(0, false)">Safe</button>
          </div>
        </div>
      </div>
    `;
  }
}

window.choose = async function (msgIndex, isPhish) {
  if (answered) return;
  answered = true;

  const answerTime = Date.now() - questionStartTime;
  const scenario = scenarios[index];

  let correct;
  if (currentQuizType === "dialogue") {
    const msg = scenario.messages[msgIndex];
    correct = isPhish === msg.isPhish;
  } else {
    correct = isPhish === scenario.isPhish;
  }

  const pointsEarned = 10;

  if (correct) {
    score++;
    currentQuizScore++;

    if (answerTime < 500) {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        "stats.ultra_fast_answers": increment(1),
      });
    }

    if (
      currentQuizType === "dialogue"
        ? scenario.messages[msgIndex].isPhish
        : scenario.isPhish
    ) {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        "stats.total_phishing_caught": increment(1),
      });
    }

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      "stats.total_correct": increment(1),
    });

    // Update score in room
    await updateDoc(doc(db, `rooms/${roomId}/players`, auth.currentUser.uid), {
      score: increment(pointsEarned),
    });

    // Update streak when points are earned
    await updateStreakWithPoints(auth.currentUser.uid);

    // Check for achievements
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userDoc = await getDoc(userRef);
    let userData = userDoc.data();

    if (!userData.achievements) {
      await updateDoc(userRef, {
        achievements: {
          unlocked: [],
          version: "0",
        },
      });
      const updatedDoc = await getDoc(userRef);
      userData = updatedDoc.data();
    }

    const unlocked = await achievementService.checkAchievements(
      userData,
      userRef
    );

    if (unlocked.length > 0) {
      showAchievementNotification(unlocked);
    }
  } else {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      [`stats.${currentQuizType}_wrong`]: increment(1),
    });
  }

  currentQuizTotal++;

  // Handle dialogue multi-message flow
  if (currentQuizType === "dialogue") {
    const scenario = scenarios[index];
    const lastMessage = currentMessageIndex === scenario.messages.length - 1;

    if (!lastMessage) {
      currentMessageIndex++;
      const allButtons = document.querySelectorAll(".choice-buttons");
      allButtons.forEach((button) => button.classList.add("hidden"));
      const nextButton = document.querySelector(
        `.choice-buttons[data-index="${currentMessageIndex}"]`
      );
      if (nextButton) {
        nextButton.classList.remove("hidden");
      }
      answered = false;
      return;
    }
  }

  const isPhishing =
    currentQuizType === "dialogue"
      ? scenario.messages[msgIndex].isPhish
      : scenario.isPhish;

  feedback.textContent = `${correct ? "Correct" : "Not quite"} — This is ${
    isPhishing ? "phishing" : "safe"
  }.`;
  feedback.classList.toggle("bad", !correct);
  feedback.classList.remove("hidden");

  const lastScenario = index === scenarios.length - 1;
  (lastScenario ? finishBtn : nextBtn).classList.remove("hidden");
};

window.next = function () {
  index++;
  if (index < scenarios.length) load();
};

window.finish = async function () {
  if (currentQuizScore === scenarios.length) {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      "stats.perfect_quizzes": increment(1),
    });
  }

  bar.style.width = "100%";

  // Mark room as finished and show leaderboard
  await updateDoc(doc(db, "rooms", roomId), { status: "finished" });

  const playerDoc = await getDoc(
    doc(db, `rooms/${roomId}/players`, auth.currentUser.uid)
  );

  if (playerDoc.exists()) {
    const playerScore = playerDoc.data().score || 0;
    await updateScore(auth.currentUser.uid, playerScore);
  }

  showLeaderboard();
};

async function showLeaderboard() {
  onSnapshot(collection(db, `rooms/${roomId}/players`), (snapshot) => {
    const players = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.score - a.score);

    leaderboard.innerHTML = `
      <h3>Leaderboard</h3>
      ${players.map((p) => `<p>${p.displayName}: ${p.score}</p>`).join("")}
      <button class="btn-primary" onclick="window.location.href='dashboard.html'">Back to Dashboard</button>
    `;
    leaderboard.classList.remove("hidden");
    finishBtn.classList.add("hidden");
  });
}

async function updateScore(uid, points) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      "stats.totalPoints": increment(points),
      "stats.quizPoints": increment(points),
    });
    await addDoc(collection(db, `users/${uid}/points_log`), {
      pointsAdded: points,
      date: new Date(),
    });

    await updateStreakWithPoints(uid);
  } catch (error) {
    console.error("Error updating score:", error);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function showAchievementNotification(achievementNames) {
  if (achievementNames.length > 0) {
    achievementNames.forEach((name, index) => {
      const achievement = achievementService.achievements.find(
        (a) => a.name === name
      );
      if (achievement) {
        setTimeout(() => {
          createAchievementPopup(achievement, index);
        }, index * 300);
      }
    });
  }
}

function createAchievementPopup(achievement, index) {
  const notification = document.createElement("div");
  notification.className = "achievement-notification";
  notification.style.top = `${20 + index * 100}px`;

  notification.innerHTML = `
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-content">
            <div class="achievement-title">Achievement Unlocked!</div>
            <div class="achievement-description">${achievement.name}: ${achievement.description}</div>
            <div class="achievement-progress-bar">
                <div class="achievement-progress-fill"></div>
            </div>
        </div>
        <div class="achievement-points">+${achievement.points_reward}</div>
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
    const progressFill = notification.querySelector(
      ".achievement-progress-fill"
    );
    let width = 100;
    const duration = 5000;
    const interval = setInterval(() => {
      width -= 100 / (duration / 50);
      progressFill.style.width = width + "%";
      if (width <= 0) {
        clearInterval(interval);
        notification.classList.remove("show");
        notification.classList.add("hide");
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 500);
      }
    }, 50);
  }, 100);
}
