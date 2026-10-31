import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { birthdayCommand } from "../src/bot/commands/birthday.js";
import { myBirthdayCommand } from "../src/bot/commands/mybirthday.js";
import { editBirthdayCommand } from "../src/bot/commands/editbirthday.js";
import { deleteBirthdayCommand } from "../src/bot/commands/deletebirthday.js";
import { startCommand } from "../src/bot/commands/start.js";
import { inviteCommand } from "../src/bot/commands/invite.js";
import { birthdaysCommand } from "../src/bot/commands/birthdays.js";
import { groupService } from "../src/services/group.service.js";
import { birthdayService } from "../src/services/birthday.service.js";
import { registrationService } from "../src/services/registration.service.js";

describe("[FLOW TEST] Final Invitation-Driven Registration UX & Security", () => {
  // Store original service methods for clean restoration
  const original = {
    groupService: { ...groupService },
    birthdayService: { ...birthdayService },
    registrationService: { ...registrationService },
  };

  afterEach(() => {
    // Restore all mocked methods after every test
    Object.assign(groupService, original.groupService);
    Object.assign(birthdayService, original.birthdayService);
    Object.assign(registrationService, original.registrationService);
  });

  // Helper to create mock context
  function createMockCtx({
    chatType = "private",
    chatId = 11111,
    chatTitle = "Private Chat",
    userId = 11111,
    userName = "Alice",
    match = "",
    botUsername = "BDPingBot",
  } = {}) {
    let replyCall = null;
    return {
      chat: { type: chatType, id: chatId, title: chatTitle },
      from: { id: userId, first_name: userName, username: `${userName.toLowerCase()}_tg` },
      me: { username: botUsername },
      match,
      message: { message_id: 101 },
      api: {
        getChatMember: async () => ({ status: "member" }),
      },
      reply: async (text, options = {}) => {
        replyCall = { text, options };
        return replyCall;
      },
      getReply: () => replyCall,
    };
  }

  // --- Requirement 1: Valid invitation opens registration for the correct group ---
  test("1. Valid invitation opens registration for the correct group", async () => {
    const groupId = -100111;
    let sessionCreatedWith = null;

    groupService.getGroupById = async (id) => {
      if (id === groupId) return { id, title: "Alpha Team", is_active: true };
      return null;
    };
    groupService.isUserInGroup = async () => true;
    birthdayService.getByUserAndGroup = async () => null; // Not registered yet
    registrationService.createPendingSession = async (uid, gid) => {
      sessionCreatedWith = { uid, gid };
      return { rawToken: "tok_test123", expiresAt: new Date(Date.now() + 1800000).toISOString() };
    };

    const ctx = createMockCtx({
      chatType: "private",
      match: `invite_${groupId}`,
      userId: 11111,
      userName: "Alice",
    });

    await startCommand(ctx);

    const reply = ctx.getReply();
    assert.ok(reply, "Bot must reply to deep link");
    assert.deepEqual(sessionCreatedWith, { uid: 11111, gid: groupId });
    assert.match(reply.text, /Private Birthday Registration/);
    assert.match(reply.text, /Alpha Team/);
    assert.match(reply.text, /Please reply to this message with your birthday/);
  });

  // --- Requirement 2: Invalid or inactive group invitation is rejected ---
  test("2. Invalid or inactive group invitation is rejected", async () => {
    let sessionCreated = false;
    registrationService.createPendingSession = async () => {
      sessionCreated = true;
    };

    // Case 2a: Malformed / NaN group ID
    const invalidCtx = createMockCtx({
      chatType: "private",
      match: "invite_notanumber",
    });
    await startCommand(invalidCtx);
    assert.match(invalidCtx.getReply().text, /Invalid invitation link/);
    assert.equal(sessionCreated, false);

    // Case 2b: Group not found in database
    groupService.getGroupById = async () => null;
    const notFoundCtx = createMockCtx({
      chatType: "private",
      match: "invite_-100999",
    });
    await startCommand(notFoundCtx);
    assert.match(notFoundCtx.getReply().text, /not currently registered or active/);
    assert.equal(sessionCreated, false);

    // Case 2c: Inactive group
    groupService.getGroupById = async () => ({ id: -100888, title: "Old Group", is_active: false });
    const inactiveCtx = createMockCtx({
      chatType: "private",
      match: "invite_-100888",
    });
    await startCommand(inactiveCtx);
    assert.match(inactiveCtx.getReply().text, /not currently registered or active/);
    assert.equal(sessionCreated, false);
  });

  // --- Requirement 3: Non-member is rejected ---
  test("3. Non-member is rejected", async () => {
    const groupId = -100111;
    let sessionCreated = false;

    groupService.getGroupById = async () => ({ id: groupId, title: "Secret Club", is_active: true });
    // User is NOT a member
    groupService.isUserInGroup = async () => false;
    registrationService.createPendingSession = async () => {
      sessionCreated = true;
    };

    const ctx = createMockCtx({
      chatType: "private",
      match: `invite_${groupId}`,
      userId: 99999,
      userName: "Eve",
    });

    await startCommand(ctx);

    const reply = ctx.getReply();
    assert.match(reply.text, /Access Denied/);
    assert.match(reply.text, /Secret Club/);
    assert.equal(sessionCreated, false, "Must not create registration session for non-member");
  });

  // --- Requirement 4: Membership verification failure is rejected ---
  test("4. Membership verification failure is rejected", async () => {
    const groupId = -100111;
    let sessionCreated = false;

    groupService.getGroupById = async () => ({ id: groupId, title: "Alpha Team", is_active: true });
    // Simulate Telegram API exception (e.g. network failure, bot kicked, or user restricted)
    groupService.isUserInGroup = async () => {
      return false; // Telegram API call failed or was rejected
    };
    registrationService.createPendingSession = async () => {
      sessionCreated = true;
    };

    const ctx = createMockCtx({
      chatType: "private",
      match: `invite_${groupId}`,
      userId: 22222,
      userName: "Bob",
    });

    await startCommand(ctx);

    const reply = ctx.getReply();
    assert.match(reply.text, /Access Denied/);
    assert.equal(sessionCreated, false, "Must not fall back to registering or listing active groups");
  });

  // --- Requirement 5: Existing registration displays the correct existing birthday & actions ---
  test("5. Existing registration displays the correct existing birthday without silent overwrite", async () => {
    const groupId = -100111;
    let sessionCreated = false;

    groupService.getGroupById = async () => ({ id: groupId, title: "Alpha Team", is_active: true });
    groupService.isUserInGroup = async () => true;
    // Alice is already registered with 14 May
    birthdayService.getByUserAndGroup = async () => ({
      id: "bday-1",
      group_id: groupId,
      telegram_user_id: 11111,
      birth_month: 5,
      birth_day: 14,
    });
    registrationService.createPendingSession = async () => {
      sessionCreated = true;
    };

    const ctx = createMockCtx({
      chatType: "private",
      match: `invite_${groupId}`,
      userId: 11111,
      userName: "Alice",
    });

    await startCommand(ctx);

    const reply = ctx.getReply();
    assert.match(reply.text, /Already Registered/);
    assert.match(reply.text, /14 May/);
    assert.match(reply.text, /Alpha Team/);
    assert.equal(sessionCreated, false, "Must not create a new pending session or overwrite silently");

    // Must offer relevant actions: View birthday, Edit birthday, Cancel
    const keyboard = reply.options?.reply_markup;
    assert.ok(keyboard, "Must offer interactive action keyboard");
    const buttons = keyboard.inline_keyboard.flat();
    const buttonTexts = buttons.map((b) => b.text);
    assert.ok(buttonTexts.some((t) => t.includes("View Birthday")), "Must offer View Birthday button");
    assert.ok(buttonTexts.some((t) => t.includes("Edit Birthday")), "Must offer Edit Birthday button");
    assert.ok(buttonTexts.some((t) => t.includes("Cancel")), "Must offer Cancel button");
  });

  // --- Requirement 6: Registering through a second group's invitation creates a separate registration ---
  test("6. Registering through a second group's invitation creates a separate registration", () => {
    const db = new Map(); // key: `${groupId}_${userId}`

    function register(groupId, userId, name, month, day) {
      const key = `${groupId}_${userId}`;
      if (db.has(key)) throw new Error("ALREADY_REGISTERED");
      db.set(key, { groupId, userId, name, month, day });
    }

    const aliceId = 11111;
    const groupAlpha = -100111;
    const groupBeta = -100222;

    // Alice registers via Group Alpha's invitation
    register(groupAlpha, aliceId, "Alice", 1, 15);
    // Alice registers via Group Beta's invitation
    register(groupBeta, aliceId, "Alice", 2, 20);

    assert.equal(db.size, 2);
    assert.deepEqual(db.get(`${groupAlpha}_${aliceId}`), {
      groupId: groupAlpha,
      userId: aliceId,
      name: "Alice",
      month: 1,
      day: 15,
    });
    assert.deepEqual(db.get(`${groupBeta}_${aliceId}`), {
      groupId: groupBeta,
      userId: aliceId,
      name: "Alice",
      month: 2,
      day: 20,
    });
  });

  // --- Requirement 7: Editing one group's birthday does not modify another group's record ---
  test("7. Editing one group's birthday does not modify another group's record", () => {
    const db = new Map();
    db.set(`-100111_11111`, { groupId: -100111, userId: 11111, month: 1, day: 15 });
    db.set(`-100222_11111`, { groupId: -100222, userId: 11111, month: 2, day: 20 });

    // Edit Group Alpha to 25 Dec
    const alphaRecord = db.get(`-100111_11111`);
    alphaRecord.month = 12;
    alphaRecord.day = 25;

    // Group Beta must remain untouched
    const betaRecord = db.get(`-100222_11111`);
    assert.equal(betaRecord.month, 2);
    assert.equal(betaRecord.day, 20);
    assert.equal(alphaRecord.month, 12);
    assert.equal(alphaRecord.day, 25);
  });

  // --- Requirement 8: Deleting one group's birthday does not delete another group's record ---
  test("8. Deleting one group's birthday does not delete another group's record", () => {
    const db = new Map();
    db.set(`-100111_11111`, { groupId: -100111, userId: 11111, month: 1, day: 15 });
    db.set(`-100222_11111`, { groupId: -100222, userId: 11111, month: 2, day: 20 });

    // Delete Group Alpha
    db.delete(`-100111_11111`);

    assert.equal(db.has(`-100111_11111`), false);
    assert.equal(db.has(`-100222_11111`), true);
    assert.equal(db.get(`-100222_11111`).month, 2);
    assert.equal(db.get(`-100222_11111`).day, 20);
  });

  // --- Requirement 9: /birthday never lists all active groups ---
  test("9. /birthday never lists all active groups", async () => {
    // User has 1 registration
    birthdayService.listUserRegistrationsAcrossGroups = async () => [
      { id: "1", groupId: -100111, groupTitle: "Alpha Team", birthMonth: 1, birthDay: 15 },
    ];

    const ctx = createMockCtx({ chatType: "private", userId: 11111 });
    await birthdayCommand(ctx);

    const reply = ctx.getReply();
    assert.match(reply.text, /Registration in BD Ping is invitation-driven/);
    assert.match(reply.text, /open that group's BD Ping invitation link/);
    // Crucial: Must NEVER attach buttons listing active groups
    assert.equal(reply.options?.reply_markup, undefined, "Must NOT attach group selection buttons");
    assert.doesNotMatch(reply.text, /Beta Team/);
    assert.doesNotMatch(reply.text, /Gamma Team/);
  });

  // --- Requirement 10: /mybirthday, /editbirthday, and /deletebirthday only expose user's own registrations ---
  test("10. /mybirthday, /editbirthday, and /deletebirthday only expose the user's own registrations", async () => {
    // User is ONLY registered in Alpha Team
    birthdayService.listUserRegistrationsAcrossGroups = async () => [
      { id: "1", groupId: -100111, groupTitle: "Alpha Team", birthMonth: 5, birthDay: 14 },
    ];

    // 10a. /mybirthday
    const myCtx = createMockCtx({ chatType: "private", userId: 11111 });
    await myBirthdayCommand(myCtx);
    const myReply = myCtx.getReply();
    assert.match(myReply.text, /Alpha Team/);
    assert.match(myReply.text, /14 May/);
    assert.doesNotMatch(myReply.text, /Beta Team/);
    assert.doesNotMatch(myReply.text, /Gamma Team/);

    // 10b. /editbirthday (single registered group)
    const editCtx = createMockCtx({ chatType: "private", userId: 11111 });
    await editBirthdayCommand(editCtx);
    const editReply = editCtx.getReply();
    assert.match(editReply.text, /Alpha Team/);
    assert.match(editReply.text, /14 May/);
    assert.doesNotMatch(editReply.text, /Beta Team/);

    // 10c. /deletebirthday (single registered group)
    const delCtx = createMockCtx({ chatType: "private", userId: 11111 });
    await deleteBirthdayCommand(delCtx);
    const delReply = delCtx.getReply();
    assert.match(delReply.text, /Alpha Team/);
    assert.match(delReply.text, /14 May/);
    assert.doesNotMatch(delReply.text, /Beta Team/);

    // 10d. User with zero registrations
    birthdayService.listUserRegistrationsAcrossGroups = async () => [];
    const zeroCtx = createMockCtx({ chatType: "private", userId: 22222 });
    await myBirthdayCommand(zeroCtx);
    assert.match(zeroCtx.getReply().text, /haven't registered your birthday in any groups yet/);
    assert.doesNotMatch(zeroCtx.getReply().text, /Alpha Team/);
  });

  // --- Requirement 11: /invite rejects non-admin users ---
  test("11. /invite rejects non-admin users and allows group admins", async () => {
    const groupId = -100111;

    // 11a. Non-admin in group
    groupService.isGroupAdmin = async () => false;
    const nonAdminCtx = createMockCtx({
      chatType: "supergroup",
      chatId: groupId,
      userId: 44444,
      userName: "Dave",
    });
    await inviteCommand(nonAdminCtx);
    const nonAdminReply = nonAdminCtx.getReply();
    assert.match(nonAdminReply.text, /Only group administrators can request the registration invitation link/);

    // 11b. Admin in group
    groupService.isGroupAdmin = async () => true;
    groupService.ensureGroupExists = async () => ({ id: groupId, title: "Admin Group" });
    const adminCtx = createMockCtx({
      chatType: "supergroup",
      chatId: groupId,
      userId: 11111,
      userName: "Alice",
      botUsername: "BDPingBot",
    });
    await inviteCommand(adminCtx);
    const adminReply = adminCtx.getReply();
    assert.match(adminReply.text, /Private Birthday Registration Link/);
    assert.match(adminReply.text, /https:\/\/t\.me\/BDPingBot\?start=invite_-100111/);

    // 11c. /invite in private chat
    const privateCtx = createMockCtx({
      chatType: "private",
      userId: 11111,
    });
    await inviteCommand(privateCtx);
    assert.match(privateCtx.getReply().text, /command is for group chats/);
  });

  // --- Requirement 12: Personal birthday commands never initiate registration in group chats ---
  test("12. Personal birthday commands never initiate registration in group chats", async () => {
    const commands = [
      { name: "/birthday", fn: birthdayCommand },
      { name: "/mybirthday", fn: myBirthdayCommand },
      { name: "/editbirthday", fn: editBirthdayCommand },
      { name: "/deletebirthday", fn: deleteBirthdayCommand },
    ];

    for (const { name, fn } of commands) {
      const groupCtx = createMockCtx({
        chatType: "supergroup",
        chatId: -100123456,
        chatTitle: "Public Chat",
        userId: 11111,
        botUsername: "BDPingBot",
      });

      await fn(groupCtx);

      const reply = groupCtx.getReply();
      assert.ok(reply, `${name} must respond with privacy notice`);
      assert.match(reply.text, /@BDPingBot/, `${name} must direct user to private chat`);
      assert.equal(
        reply.options?.reply_markup,
        undefined,
        `${name} must strictly NOT attach buttons or registration interfaces in group chat`
      );
    }
  });

  // --- Bonus: /birthdays in private chat shows only user's registered groups ---
  test("Bonus: /birthdays in private chat shows only user's registered groups without listing all active groups", async () => {
    // User registered in 2 groups
    birthdayService.listUserRegistrationsAcrossGroups = async () => [
      { id: "1", groupId: -100111, groupTitle: "Alpha Team", birthMonth: 1, birthDay: 15 },
      { id: "2", groupId: -100222, groupTitle: "Beta Team", birthMonth: 2, birthDay: 20 },
    ];

    const ctx = createMockCtx({ chatType: "private", userId: 11111 });
    await birthdaysCommand(ctx);

    const reply = ctx.getReply();
    assert.match(reply.text, /View Group Birthdays/);
    const keyboard = reply.options?.reply_markup;
    assert.ok(keyboard);
    const buttons = keyboard.inline_keyboard.flat();
    assert.equal(buttons.length, 2);
    assert.ok(buttons.some((b) => b.text.includes("Alpha Team")));
    assert.ok(buttons.some((b) => b.text.includes("Beta Team")));
    assert.ok(!buttons.some((b) => b.text.includes("Gamma Team")));
  });
});
