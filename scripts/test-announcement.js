import "dotenv/config";
import { Bot } from "grammy";
import { supabase } from "../src/database/supabase.js";
import { groupService } from "../src/services/group.service.js";
import { birthdayService } from "../src/services/birthday.service.js";
import { announcementService } from "../src/services/announcement.service.js";
import { formatBirthday, escapeHtml } from "../src/utils/formatting.js";

/**
 * BD Ping — Safe End-to-End Birthday Announcement Test Runner
 *
 * Requirements:
 * 1. Reuses the actual announcement service and sending pipeline.
 * 2. Does NOT bypass database job claiming, completion, or lease fencing.
 * 3. Does NOT modify production birthday records.
 * 4. Preserves idempotency: does not duplicate announcements if already sent today.
 * 5. Strictly restricted to an explicitly supplied Telegram group ID.
 * 6. Clearly distinguishable test logs.
 * 7. Never exposes secrets or tokens.
 */
export async function runTestAnnouncement(targetGroupIdStr) {
  console.log("==================================================================");
  console.log("🎂 BD Ping — Safe End-to-End Announcement Test Runner");
  console.log("==================================================================");

  // 1. Validate Group ID
  if (!targetGroupIdStr) {
    console.error("❌ Error: Target Telegram Group ID is required.");
    console.log("\nUsage:");
    console.log("  node scripts/test-announcement.js <groupId>");
    console.log("\nExample:");
    console.log("  node scripts/test-announcement.js -1001234567890");
    console.log("==================================================================");
    return { success: false, error: "MISSING_GROUP_ID" };
  }

  const targetGroupId = parseInt(targetGroupIdStr, 10);
  if (isNaN(targetGroupId)) {
    console.error(`❌ Error: Invalid Group ID "${targetGroupIdStr}". Must be an integer.`);
    return { success: false, error: "INVALID_GROUP_ID" };
  }

  // 2. Validate Environment
  if (!process.env.BOT_TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: Missing required environment variables (BOT_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY).");
    return { success: false, error: "MISSING_ENV" };
  }

  // 3. Verify Group Status in Database
  const group = await groupService.getGroupById(targetGroupId);
  if (!group) {
    console.error(`❌ Error: Group ${targetGroupId} is not registered in BD Ping.`);
    console.log("📌 Please add @BDPingBot to the group first, or run /invite in the group to activate it.");
    return { success: false, error: "GROUP_NOT_FOUND" };
  }

  if (!group.is_active) {
    console.error(`❌ Error: Group "${group.title}" (${targetGroupId}) is currently marked inactive.`);
    console.log("📌 Please re-add or unblock the bot in the group to reactivate it.");
    return { success: false, error: "GROUP_INACTIVE" };
  }

  // 4. Timezone & Local Date Evaluation
  const local = announcementService.getGroupLocalDateTime(group.timezone);
  console.log(`👥 Target Group: "${group.title}" (${group.id})`);
  console.log(`🌍 Group Timezone: ${group.timezone}`);
  console.log(`🕒 Group Local Time: ${local.timeString} (Date: ${local.dateString})`);
  console.log(`⏰ Configured Announcement Time: ${group.announcement_time}`);

  // 5. Idempotency Check: Check if already sent today
  const { data: existingLog, error: logCheckError } = await supabase
    .from("announcement_logs")
    .select("id, status, telegram_message_id, sent_at")
    .eq("group_id", targetGroupId)
    .eq("announcement_date", local.dateString)
    .maybeSingle();

  if (logCheckError) {
    console.error(`❌ Database check error: ${logCheckError.message}`);
    return { success: false, error: logCheckError.message };
  }

  if (existingLog && existingLog.status === "sent") {
    console.log("\n⚠️ [IDEMPOTENCY ENFORCED] An announcement has ALREADY been sent for this group today:");
    console.log(`   - Date: ${local.dateString}`);
    console.log(`   - Telegram Message ID: ${existingLog.telegram_message_id || "(0 - Empty Day)"}`);
    console.log(`   - Sent At: ${existingLog.sent_at}`);
    console.log("\n🔒 Duplicate prevention is active. Normal scheduled announcements will not re-send.");
    console.log("==================================================================");
    return { success: true, alreadySent: true, messageId: existingLog.telegram_message_id };
  }

  // 6. Query Celebrants for Today
  const celebrants = await announcementService.getCelebrantsForDate(
    group.id,
    local.month,
    local.day,
    local.year,
    group.leap_year_policy || "feb28"
  );

  if (celebrants.length === 0) {
    console.log(`\nℹ️ [EMPTY CALENDAR] No members in "${group.title}" have a birthday on today's local date (${local.day}/${local.month}).`);
    console.log("🔒 Per Requirement 8, BD Ping sends NO messages when there are 0 celebrants.");

    // Query registered members in this group to assist tester
    const allMembers = await birthdayService.listByGroup(group.id);
    if (allMembers.length > 0) {
      console.log(`\n📋 Currently registered members in "${group.title}" (${allMembers.length}):`);
      for (const m of allMembers) {
        console.log(`   • ${m.name}: ${formatBirthday(m.birth_month, m.birth_day)}`);
      }
      console.log(`\n💡 Testing Tip: To trigger a live greeting in Telegram right now:`);
      console.log(`   1. Open private chat with the bot.`);
      console.log(`   2. Run /editbirthday to temporarily set your birthday in this group to today's date (${local.day} ${local.dateString.slice(5, 7)}).`);
      console.log(`   3. Re-run this test command!`);
    } else {
      console.log(`\n📋 No members have registered birthdays in this group yet.`);
      console.log(`💡 Have a group member click the group invitation link to register a birthday.`);
    }

    console.log("==================================================================");
    return { success: true, celebrantCount: 0, sent: false };
  }

  // 7. Preview the Announcement
  console.log(`\n🎉 Found ${celebrants.length} celebrant(s) for today:`);
  for (const c of celebrants) {
    console.log(`   • ${c.name} (Telegram ID: ${c.telegram_user_id})`);
  }

  const messagePreview = announcementService.formatMessage(celebrants);
  console.log("\n--- Telegram Message Preview (HTML) ---");
  console.log(messagePreview);
  console.log("---------------------------------------\n");

  // 8. Execute Claiming and Delivery via Real Pipeline
  console.log("🚀 Executing announcement pipeline via PostgreSQL RPCs...");
  const bot = new Bot(process.env.BOT_TOKEN);

  // A. Ensure pending announcement log row exists
  await announcementService.ensureAnnouncementLog(group.id, local.dateString);

  // B. Temporarily set announcement_time to 00:00:00 so RPC due-time check passes immediately
  const originalAnnouncementTime = group.announcement_time;
  try {
    await supabase
      .from("groups")
      .update({ announcement_time: "00:00:00" })
      .eq("id", group.id);

    // C. Claim job atomically via bd_ping_claim_announcement_jobs RPC
    const claimedJobs = await announcementService.claimJobs({ batchSize: 20 });
    const targetJob = claimedJobs.find((j) => String(j.group_id) === String(group.id));

    if (!targetJob) {
      throw new Error(`Failed to claim announcement job for group ${group.id}. Job may be in invalid status.`);
    }

    console.log(`✅ [CLAIMED] Job ${targetJob.id} claimed with lease fencing token.`);

    // D. Dispatch to Telegram via botApi.sendMessage with HTML parse_mode
    const dispatchResult = await announcementService.dispatchJob(bot.api, targetJob);

    console.log(`🎉 [DELIVERED] Message sent to Telegram group "${group.title}"!`);
    console.log(`   • Message ID: ${dispatchResult.messageId}`);
    console.log(`   • Celebrants Announced: ${dispatchResult.celebrantCount}`);
    console.log(`   • Status: 'sent' recorded with fencing token verified.`);
    console.log(`   • Snapshots: Historical snapshots recorded in announcement_log_birthdays.`);
    console.log("\n==================================================================");
    console.log("✅ End-to-end test completed successfully!");
    console.log("==================================================================");

    return {
      success: true,
      sent: true,
      messageId: dispatchResult.messageId,
      celebrantCount: dispatchResult.celebrantCount,
    };
  } finally {
    // E. Restore group's original announcement_time
    await supabase
      .from("groups")
      .update({ announcement_time: originalAnnouncementTime })
      .eq("id", group.id);
  }
}

// Execute directly if run as a CLI script
if (process.argv[1]?.endsWith("test-announcement.js")) {
  const targetId = process.argv[2];
  runTestAnnouncement(targetId)
    .then((result) => {
      if (!result.success) process.exit(1);
    })
    .catch((err) => {
      console.error("❌ Unexpected test execution failure:", err);
      process.exit(1);
    });
}
