import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  formatBirthdayAnnouncement,
  getCelebrantFirstName,
  escapeHtml,
} from "../src/utils/formatting.js";
import { announcementService } from "../src/services/announcement.service.js";

describe("[INTEGRATION AUDIT & UNIT TEST] Scheduled Birthday Announcement Architecture", () => {
  const original = { ...announcementService };

  afterEach(() => {
    announcementService.stopScheduler();
    Object.assign(announcementService, original);
  });

  // --- 1. One birthday celebrant ---
  test("1. One birthday celebrant: exact format and preserved introductory sentence", () => {
    const celebrants = [
      {
        telegram_user_id: 11111,
        name: "Ephrem",
        username: "ephrem_tg",
      },
    ];

    const result = formatBirthdayAnnouncement(celebrants);

    const expected =
      "🎂 Today's Birthdays:\n\n" +
      "Let's wish our birthday stars a very Happy Birthday! 🎉\n\n" +
      '🎉 Happy Birthday, <a href="tg://user?id=11111">Ephrem</a>! 🎂';

    assert.equal(result, expected);

    // Requirement 7: The introductory sentence must remain unchanged even for a single celebrant
    assert.match(
      result,
      /Let's wish our birthday stars a very Happy Birthday! 🎉/,
      "Must not singularize or change introductory sentence"
    );

    // Requirement 5: No ages, birth years, or long descriptions
    assert.doesNotMatch(result, /years old|turning|\b\d{4}\b/);
  });

  // --- 2. Multiple birthday celebrants ---
  test("2. Multiple birthday celebrants: all in one message, one greeting line each", () => {
    const celebrants = [
      {
        telegram_user_id: 11111,
        name: "Ephrem",
        username: "ephrem_tg",
      },
      {
        telegram_user_id: 22222,
        name: "Abebe",
        username: "abebe_tg",
      },
      {
        telegram_user_id: 33333,
        name: "Chala",
        username: "chala_tg",
      },
    ];

    const result = formatBirthdayAnnouncement(celebrants);

    const expected =
      "🎂 Today's Birthdays:\n\n" +
      "Let's wish our birthday stars a very Happy Birthday! 🎉\n\n" +
      '🎉 Happy Birthday, <a href="tg://user?id=11111">Ephrem</a>! 🎂\n\n' +
      '🎉 Happy Birthday, <a href="tg://user?id=22222">Abebe</a>! 🎂\n\n' +
      '🎉 Happy Birthday, <a href="tg://user?id=33333">Chala</a>! 🎂';

    assert.equal(result, expected);

    // Count greeting lines
    const greetingMatches = result.match(/🎉 Happy Birthday,/g);
    assert.equal(greetingMatches.length, 3, "Must have exactly one greeting line per celebrant");
  });

  // --- 3. Members without Telegram usernames ---
  test("3. Members without Telegram usernames: mentions link by Telegram user ID", () => {
    const celebrants = [
      {
        telegram_user_id: 44444,
        name: "Bethlehem",
        username: null, // No username
      },
      {
        telegramUserId: 55555,
        name: "Dawit",
        username: undefined, // No username
      },
    ];

    const result = formatBirthdayAnnouncement(celebrants);

    assert.match(
      result,
      /<a href="tg:\/\/user\?id=44444">Bethlehem<\/a>/,
      "Bethlehem must have clickable mention by user ID without username"
    );
    assert.match(
      result,
      /<a href="tg:\/\/user\?id=55555">Dawit<\/a>/,
      "Dawit must have clickable mention by user ID without username"
    );

    // Must NOT contain '@' or 'undefined'
    assert.doesNotMatch(result, /@/);
    assert.doesNotMatch(result, /undefined/);
  });

  // --- 4. Names containing HTML special characters ---
  test("4. Names containing HTML special characters: safely escaped inside <a> mention", () => {
    const celebrants = [
      {
        telegram_user_id: 66666,
        firstName: "Alice & Bob", // contains &
      },
      {
        telegram_user_id: 77777,
        firstName: "<SuperStar>", // contains < and >
      },
      {
        telegram_user_id: 88888,
        firstName: 'Dany "The Rock"', // contains "
      },
    ];

    const result = formatBirthdayAnnouncement(celebrants);

    // Escaped entities in HTML mode
    assert.match(
      result,
      /<a href="tg:\/\/user\?id=66666">Alice &amp; Bob<\/a>/,
      "Ampersand must be escaped to &amp;"
    );
    assert.match(
      result,
      /<a href="tg:\/\/user\?id=77777">&lt;SuperStar&gt;<\/a>/,
      "Angle brackets must be escaped to &lt; and &gt;"
    );
    assert.match(
      result,
      /<a href="tg:\/\/user\?id=88888">Dany &quot;The Rock&quot;<\/a>/,
      "Quotes must be escaped to &quot;"
    );

    // Ensure raw unescaped HTML injection tags are not present
    assert.doesNotMatch(result, /<SuperStar>/);
  });

  // --- 5. No birthday on the current day & completed without stuck jobs ---
  test("5. No birthday on current day: returns null, sends NO message, and completes cleanly", async () => {
    // 5a. formatBirthdayAnnouncement returns null
    assert.equal(formatBirthdayAnnouncement([]), null);
    assert.equal(formatBirthdayAnnouncement(null), null);
    assert.equal(formatBirthdayAnnouncement(undefined), null);

    // 5b. announcementService.dispatchJob sends NO message to Telegram
    let messageSent = false;
    const mockBotApi = {
      sendMessage: async () => {
        messageSent = true;
        return { message_id: 999 };
      },
    };

    const mockJob = {
      id: "job-empty-today",
      group_id: -100111,
      announcement_date: "2026-10-31",
      claim_token: "token-abc-123",
      group_leap_year_policy: "feb28",
    };

    let completedStatus = null;
    let completedMsgId = null;

    announcementService.getCelebrantsForDate = async () => [];
    announcementService.completeJob = async ({ status, telegramMessageId }) => {
      completedStatus = status;
      completedMsgId = telegramMessageId;
      return { success: true };
    };

    const dispatchResult = await announcementService.dispatchJob(mockBotApi, mockJob);

    assert.equal(messageSent, false, "Must send NO message when nobody has a birthday");
    assert.equal(dispatchResult.sent, false);
    assert.equal(dispatchResult.celebrantCount, 0);
    assert.equal(completedStatus, "sent", "Job must be marked completed so it does not retry");
    assert.equal(completedMsgId, 0, "Sentinel 0 satisfies NOT NULL in bd_ping_complete_announcement_job");
  });

  // --- 6. Complete execution path trace to Telegram sendMessage API with parse_mode HTML ---
  test("6. Complete execution path: dispatchJob calls botApi.sendMessage with HTML parse_mode", async () => {
    let sentToGroupId = null;
    let sentText = null;
    let sentOptions = null;
    let recordedSnapshots = false;
    let jobCompleted = false;

    const mockBotApi = {
      sendMessage: async (chatId, text, options) => {
        sentToGroupId = chatId;
        sentText = text;
        sentOptions = options;
        return { message_id: 778899 };
      },
    };

    const mockJob = {
      id: "job-happy-path",
      group_id: -100999,
      announcement_date: "2026-10-31",
      claim_token: "claim-token-xyz",
      group_leap_year_policy: "feb28",
    };

    announcementService.getCelebrantsForDate = async () => [
      {
        id: "bday-1",
        telegram_user_id: 12345,
        name: "Ephrem",
        username: "ephrem",
        birth_month: 10,
        birth_day: 31,
      },
      {
        id: "bday-2",
        telegram_user_id: 67890,
        name: "Abebe",
        birth_month: 10,
        birth_day: 31,
      },
    ];

    announcementService.recordSnapshots = async () => {
      recordedSnapshots = true;
    };

    announcementService.completeJob = async ({ jobId, claimToken, status, telegramMessageId }) => {
      assert.equal(jobId, "job-happy-path");
      assert.equal(claimToken, "claim-token-xyz");
      assert.equal(status, "sent");
      assert.equal(telegramMessageId, 778899);
      jobCompleted = true;
      return { success: true };
    };

    const result = await announcementService.dispatchJob(mockBotApi, mockJob);

    assert.equal(result.sent, true);
    assert.equal(result.celebrantCount, 2);
    assert.equal(sentToGroupId, -100999);
    assert.equal(sentOptions?.parse_mode, "HTML", "Telegram sendMessage MUST specify HTML parse mode");
    assert.match(sentText, /🎉 Happy Birthday, <a href="tg:\/\/user\?id=12345">Ephrem<\/a>! 🎂/);
    assert.match(sentText, /🎉 Happy Birthday, <a href="tg:\/\/user\?id=67890">Abebe<\/a>! 🎂/);
    assert.equal(recordedSnapshots, true, "Must record snapshots in announcement_log_birthdays");
    assert.equal(jobCompleted, true, "Must complete job with fencing token");
  });

  // --- 7. Scheduler Lifecycle: startScheduler & stopScheduler ---
  test("7. Scheduler Lifecycle: startScheduler starts background sweep and stopScheduler clears timer", () => {
    let sweepCalled = false;
    const mockBotApi = {};

    announcementService.runAnnouncementSweep = async () => {
      sweepCalled = true;
      return { enqueued: 1, processed: 1, errors: 0 };
    };

    const timer = announcementService.startScheduler(mockBotApi, { intervalMs: 10000 });
    assert.ok(timer, "startScheduler must return active interval timer");
    assert.equal(sweepCalled, true, "startScheduler must trigger initial sweep immediately");
    assert.ok(announcementService._schedulerTimer, "Scheduler timer reference must be retained");

    announcementService.stopScheduler();
    assert.equal(announcementService._schedulerTimer, null, "stopScheduler must clear the timer");
  });

  // --- 8. Timezone & Leap Year Policy Preservation ---
  test("8. Timezone and Leap Year Policy preservation", () => {
    // Leap year calculation
    assert.equal(announcementService.isLeapYear(2024), true);
    assert.equal(announcementService.isLeapYear(2025), false);
    assert.equal(announcementService.isLeapYear(2026), false);
    assert.equal(announcementService.isLeapYear(2000), true);
    assert.equal(announcementService.isLeapYear(1900), false);

    // Group local time in Africa/Addis_Ababa (UTC+3)
    const fixedUtc = new Date("2026-10-31T22:30:00Z"); // 22:30 UTC -> 01:30 Next Day in Addis Ababa
    const addisTime = announcementService.getGroupLocalDateTime("Africa/Addis_Ababa", fixedUtc);
    assert.equal(addisTime.day, 1, "Should be Nov 1 in Addis Ababa (+3h)");
    assert.equal(addisTime.month, 11);
    assert.equal(addisTime.dateString, "2026-11-01");
  });

  // --- 9. First name extraction & multi-word handling ---
  test("9. First name extraction extracts first name properly", () => {
    assert.equal(getCelebrantFirstName({ firstName: "Ephrem" }), "Ephrem");
    assert.equal(getCelebrantFirstName({ first_name: "Abebe" }), "Abebe");
    assert.equal(getCelebrantFirstName({ name: "Chala Kebede" }), "Chala");
    assert.equal(getCelebrantFirstName({ name: "Solomon" }), "Solomon");
    assert.equal(getCelebrantFirstName({}), "Member");
  });

  // --- 10. Safe Announcement Test Runner Validation ---
  test("10. Safe Announcement Test Runner validates arguments properly", async () => {
    const { runTestAnnouncement } = await import("../scripts/test-announcement.js");

    // Missing group ID
    const noArgResult = await runTestAnnouncement(null);
    assert.equal(noArgResult.success, false);
    assert.equal(noArgResult.error, "MISSING_GROUP_ID");

    // Invalid group ID
    const invalidResult = await runTestAnnouncement("invalid_id");
    assert.equal(invalidResult.success, false);
    assert.equal(invalidResult.error, "INVALID_GROUP_ID");
  });
});
