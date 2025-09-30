// achievement-service.js
import { db, auth } from "./firebase-init.js";
import {
  doc,
  updateDoc,
  getDoc,
  increment,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

class AchievementService {
  constructor() {
    this.achievements = this.getDefaultAchievements();
    this.isLoaded = true;
  }

  getDefaultAchievements() {
    return [
      {
        id: "first_1000_points",
        name: "ألف نقطة",
        description: "اجمع أول 1000 نقطة",
        emoji: "⭐",
        points_reward: 100,
        condition: {
          type: "comparison",
          field: "stats.totalPoints",
          operator: ">=",
          value: 1000,
        },
      },
      {
        id: "streak_master",
        name: "سلسلة النجاح",
        description: "حافظ على سلسلة متتالية لمدة 7 أيام",
        emoji: "🔥",
        points_reward: 150,
        condition: {
          type: "comparison",
          field: "stats.streak",
          operator: ">=",
          value: 7,
        },
      },
      {
        id: "social_butterfly",
        name: "فراشة اجتماعية",
        description: "أضف 5 أصدقاء أو أكثر",
        emoji: "👥",
        points_reward: 120,
        condition: {
          type: "comparison",
          field: "friendsCount",
          operator: ">=",
          value: 5,
        },
      },
      {
        id: "level_explorer",
        name: "مستكشف المستويات",
        description: "أكمل 10 مستويات تدريبية",
        emoji: "🎯",
        points_reward: 200,
        condition: {
          type: "comparison",
          field: "completedLevelsCount",
          operator: ">=",
          value: 10,
        },
      },
      {
        id: "training_champion",
        name: "بطل التدريب",
        description: "أكمل جميع المستويات (20 مستوى)",
        emoji: "🏆",
        points_reward: 500,
        condition: {
          type: "comparison",
          field: "completedLevelsCount",
          operator: ">=",
          value: 20,
        },
      },
    ];
  }

  evaluateCondition(condition, userData) {
    if (!condition) return false;

    const value = this.getNestedValue(userData, condition.field);
    let actualValue = value || 0;

    switch (condition.operator) {
      case ">=":
        return actualValue >= condition.value;
      case "<=":
        return actualValue <= condition.value;
      case "==":
        return actualValue == condition.value;
      case "!=":
        return actualValue != condition.value;
      case ">":
        return actualValue > condition.value;
      case "<":
        return actualValue < condition.value;
      default:
        return false;
    }
  }

  getNestedValue(obj, path) {
    if (!path) return 0;

    return path.split(".").reduce((acc, part) => {
      if (acc && acc[part] !== undefined && acc[part] !== null) {
        return acc[part];
      }
      return 0;
    }, obj);
  }

  async checkAchievements(userData, userRef) {
    if (!this.achievements || this.achievements.length === 0) {
      console.warn("No achievements available to check");
      return [];
    }

    // Calculate derived fields for achievements
    const enhancedUserData = {
      ...userData,
      friendsCount: userData.friends ? userData.friends.length : 0,
      completedLevelsCount: userData.completedLevels
        ? userData.completedLevels.length
        : 0,
    };

    const userAchievements = userData.achievements?.unlocked || [];
    const newlyUnlocked = [];

    for (const achievement of this.achievements) {
      // Skip if already unlocked
      if (userAchievements.includes(achievement.id)) {
        continue;
      }

      const isUnlocked = this.evaluateCondition(
        achievement.condition,
        enhancedUserData
      );

      if (isUnlocked) {
        console.log(`Unlocked achievement: ${achievement.name}`);
        newlyUnlocked.push(achievement);

        // Prepare update data
        const updateData = {
          "achievements.unlocked": arrayUnion(achievement.id),
          "achievements.lastUpdated": new Date().toISOString(),
        };

        // Add points reward
        if (achievement.points_reward) {
          updateData["stats.totalPoints"] = increment(
            achievement.points_reward
          );
        }

        // Update user document
        try {
          await updateDoc(userRef, updateData);
          console.log(`Awarded achievement: ${achievement.name}`);
        } catch (error) {
          console.error(
            `Failed to award achievement ${achievement.name}:`,
            error
          );
        }
      }
    }

    return newlyUnlocked;
  }

  async checkAndUpdateAchievements(userId) {
    if (!auth.currentUser || auth.currentUser.uid !== userId) {
      console.warn("User not authenticated or user ID mismatch");
      return [];
    }

    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        console.warn("User document not found");
        return [];
      }

      const userData = userDoc.data();
      const newlyUnlocked = await this.checkAchievements(userData, userRef);

      return newlyUnlocked;
    } catch (error) {
      console.error("Error checking achievements:", error);
      return [];
    }
  }

  // Get achievement by ID
  getAchievementById(id) {
    return this.achievements.find((ach) => ach.id === id);
  }

  // Get all achievements with user's unlock status
  async getUserAchievementsWithStatus(userId) {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return this.achievements.map((ach) => ({ ...ach, unlocked: false }));
      }

      const userData = userDoc.data();
      const unlockedAchievements = userData.achievements?.unlocked || [];

      return this.achievements.map((ach) => ({
        ...ach,
        unlocked: unlockedAchievements.includes(ach.id),
      }));
    } catch (error) {
      console.error("Error getting user achievements:", error);
      return this.achievements.map((ach) => ({ ...ach, unlocked: false }));
    }
  }

  // Get user's progress for each achievement
  async getUserAchievementsProgress(userId) {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return this.achievements.map((ach) => ({
          ...ach,
          unlocked: false,
          progress: 0,
          target: ach.condition.value,
        }));
      }

      const userData = userDoc.data();
      const unlockedAchievements = userData.achievements?.unlocked || [];

      // Calculate derived fields
      const enhancedUserData = {
        ...userData,
        friendsCount: userData.friends ? userData.friends.length : 0,
        completedLevelsCount: userData.completedLevels
          ? userData.completedLevels.length
          : 0,
      };

      return this.achievements.map((ach) => {
        const unlocked = unlockedAchievements.includes(ach.id);
        const currentValue = this.getNestedValue(
          enhancedUserData,
          ach.condition.field
        );
        const targetValue = ach.condition.value;
        const progress = Math.min(Math.max(currentValue / targetValue, 0), 1);

        return {
          ...ach,
          unlocked,
          progress,
          currentValue,
          targetValue,
        };
      });
    } catch (error) {
      console.error("Error getting user achievements progress:", error);
      return this.achievements.map((ach) => ({
        ...ach,
        unlocked: false,
        progress: 0,
        targetValue: ach.condition.value,
      }));
    }
  }
}

// Create and export singleton instance
const achievementService = new AchievementService();
export default achievementService;
