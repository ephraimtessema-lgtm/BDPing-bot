import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generateRegistrationToken, hashRegistrationToken } from "../src/utils/crypto.js";

/**
 * State Machine & Logic Simulation for Registration Sessions
 * Simulates bd_ping_create_registration_session and bd_ping_complete_registration
 */
describe("[STATE MACHINE] Registration Session Lifecycle & Atomicity", () => {
  // In-memory simulation of database state
  function createDatabaseState() {
    return {
      groups: new Map([
        [-100111n, { id: -100111n, title: "Alpha Group" }],
        [-100222n, { id: -100222n, title: "Beta Group" }],
      ]),
      registration_sessions: new Map(),
      birthdays: new Map(),
    };
  }

  function simulateCreateSession(db, { telegramUserId, groupId, expirySeconds = 1800, currentTime = new Date() }) {
    if (!db.groups.has(groupId)) {
      return { success: false, error: "GROUP_NOT_FOUND" };
    }

    // 1. Atomically expire any existing pending sessions for this Telegram user
    for (const [id, session] of db.registration_sessions.entries()) {
      if (session.telegram_user_id === telegramUserId && session.status === "pending") {
        session.status = "expired";
        session.updated_at = new Date(currentTime);
      }
    }

    const rawToken = generateRegistrationToken();
    const tokenHash = hashRegistrationToken(rawToken);
    const expiresAt = new Date(currentTime.getTime() + expirySeconds * 1000);
    const sessionId = crypto.randomUUID();

    db.registration_sessions.set(sessionId, {
      id: sessionId,
      token_hash: tokenHash,
      telegram_user_id: telegramUserId,
      group_id: groupId,
      status: "pending",
      expires_at: expiresAt,
      created_at: new Date(currentTime),
      updated_at: new Date(currentTime),
    });

    return { success: true, rawToken, tokenHash, sessionId, expiresAt };
  }

  function simulateCompleteRegistration(db, { tokenHash, telegramUserId, name, username, birthMonth, birthDay, currentTime = new Date() }) {
    // Locate session by token_hash
    let session = null;
    for (const s of db.registration_sessions.values()) {
      if (s.token_hash === tokenHash) {
        session = s;
        break;
      }
    }

    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };
    if (session.status !== "pending") return { success: false, error: "SESSION_ALREADY_USED" };

    if (session.expires_at <= currentTime) {
      session.status = "expired";
      session.updated_at = new Date(currentTime);
      return { success: false, error: "SESSION_EXPIRED" };
    }

    if (session.telegram_user_id !== telegramUserId) {
      return { success: false, error: "UNAUTHORIZED_USER" };
    }

    // Check if user already has birthday registered in this group (DO NOT OVERWRITE)
    const compositeKey = `${session.group_id}_${telegramUserId}`;
    if (db.birthdays.has(compositeKey)) {
      session.status = "completed";
      session.used_at = new Date(currentTime);
      const existing = db.birthdays.get(compositeKey);
      return {
        success: false,
        error: "ALREADY_REGISTERED",
        existingMonth: existing.birth_month,
        existingDay: existing.birth_day,
      };
    }

    // Insert new birthday
    const birthdayId = crypto.randomUUID();
    db.birthdays.set(compositeKey, {
      id: birthdayId,
      group_id: session.group_id,
      telegram_user_id: telegramUserId,
      name,
      username: username || null,
      birth_month: birthMonth,
      birth_day: birthDay,
      created_at: new Date(currentTime),
    });

    // Mark session completed
    session.status = "completed";
    session.used_at = new Date(currentTime);
    session.updated_at = new Date(currentTime);

    const group = db.groups.get(session.group_id);

    return {
      success: true,
      birthdayId,
      groupId: session.group_id,
      groupTitle: group?.title,
    };
  }

  test("Creates pending session and hashes raw token with SHA-256", () => {
    const db = createDatabaseState();
    const res = simulateCreateSession(db, { telegramUserId: 12345n, groupId: -100111n });

    assert.equal(res.success, true);
    assert.ok(res.rawToken);
    assert.equal(res.tokenHash, hashRegistrationToken(res.rawToken));
    assert.equal(db.registration_sessions.get(res.sessionId).status, "pending");
  });

  test("One active session per user: expires prior pending session when new session is created", () => {
    const db = createDatabaseState();
    const userId = 12345n;

    // First session in Group Alpha
    const session1 = simulateCreateSession(db, { telegramUserId: userId, groupId: -100111n });
    assert.equal(db.registration_sessions.get(session1.sessionId).status, "pending");

    // Second session in Group Beta
    const session2 = simulateCreateSession(db, { telegramUserId: userId, groupId: -100222n });
    assert.equal(db.registration_sessions.get(session2.sessionId).status, "pending");

    // Session 1 must be transitioned to expired
    assert.equal(db.registration_sessions.get(session1.sessionId).status, "expired");

    // Count pending sessions for user: must be exactly 1
    const pendingCount = Array.from(db.registration_sessions.values())
      .filter((s) => s.telegram_user_id === userId && s.status === "pending").length;
    assert.equal(pendingCount, 1, "User must have at most 1 active pending session");
  });

  test("Completes registration and sets session to completed (single-use)", () => {
    const db = createDatabaseState();
    const userId = 12345n;
    const session = simulateCreateSession(db, { telegramUserId: userId, groupId: -100111n });

    const completeRes = simulateCompleteRegistration(db, {
      tokenHash: session.tokenHash,
      telegramUserId: userId,
      name: "Alice",
      birthMonth: 5,
      birthDay: 14,
    });

    assert.equal(completeRes.success, true);
    assert.ok(completeRes.birthdayId);
    assert.equal(db.registration_sessions.get(session.sessionId).status, "completed");

    // Attempting to reuse the same token
    const reuseRes = simulateCompleteRegistration(db, {
      tokenHash: session.tokenHash,
      telegramUserId: userId,
      name: "Alice",
      birthMonth: 5,
      birthDay: 14,
    });
    assert.equal(reuseRes.success, false);
    assert.equal(reuseRes.error, "SESSION_ALREADY_USED");
  });

  test("Rejects expired registration sessions (expires_at <= now)", () => {
    const db = createDatabaseState();
    const userId = 12345n;
    const startTime = new Date("2026-10-31T09:00:00Z");
    const session = simulateCreateSession(db, { telegramUserId: userId, groupId: -100111n, currentTime: startTime });

    // 35 minutes later (past 30 min window)
    const futureTime = new Date("2026-10-31T09:35:00Z");
    const res = simulateCompleteRegistration(db, {
      tokenHash: session.tokenHash,
      telegramUserId: userId,
      name: "Alice",
      birthMonth: 5,
      birthDay: 14,
      currentTime: futureTime,
    });

    assert.equal(res.success, false);
    assert.equal(res.error, "SESSION_EXPIRED");
    assert.equal(db.registration_sessions.get(session.sessionId).status, "expired");
  });

  test("Rejects unauthorized user attempting to consume another user's deep link", () => {
    const db = createDatabaseState();
    const aliceId = 12345n;
    const eveId = 99999n;

    const session = simulateCreateSession(db, { telegramUserId: aliceId, groupId: -100111n });

    // Eve clicks Alice's link
    const res = simulateCompleteRegistration(db, {
      tokenHash: session.tokenHash,
      telegramUserId: eveId,
      name: "Eve",
      birthMonth: 5,
      birthDay: 14,
    });

    assert.equal(res.success, false);
    assert.equal(res.error, "UNAUTHORIZED_USER");
    assert.equal(db.birthdays.size, 0, "No birthday should be saved for unauthorized attempt");
  });

  test("Strict no-overwrite rule: Returns ALREADY_REGISTERED and leaves existing date untouched", () => {
    const db = createDatabaseState();
    const userId = 12345n;

    // Existing registration on 15 Jan
    db.birthdays.set(`-100111_${userId}`, {
      id: "bday-1",
      group_id: -100111n,
      telegram_user_id: userId,
      name: "Alice",
      birth_month: 1,
      birth_day: 15,
    });

    // Alice attempts to register again with 20 Feb
    const session = simulateCreateSession(db, { telegramUserId: userId, groupId: -100111n });
    const res = simulateCompleteRegistration(db, {
      tokenHash: session.tokenHash,
      telegramUserId: userId,
      name: "Alice",
      birthMonth: 2,
      birthDay: 20,
    });

    assert.equal(res.success, false);
    assert.equal(res.error, "ALREADY_REGISTERED");
    assert.equal(res.existingMonth, 1);
    assert.equal(res.existingDay, 15);

    // Existing record in DB is preserved untouched
    const preserved = db.birthdays.get(`-100111_${userId}`);
    assert.equal(preserved.birth_month, 1, "Must NOT overwrite month");
    assert.equal(preserved.birth_day, 15, "Must NOT overwrite day");
  });
});
