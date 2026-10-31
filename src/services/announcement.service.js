import { supabase } from "../database/supabase.js";
import { formatBirthdayAnnouncement, escapeHtml } from "../utils/formatting.js";
import { birthdayService } from "./birthday.service.js";

/**
 * Service for scheduled daily birthday announcements.
 * Implements job claiming, lease fencing, timezone evaluation,
 * and Telegram HTML delivery.
 */
export const announcementService = {
  // Timer handle for the background scheduler
  _schedulerTimer: null,
  _isSweeping: false,

  /**
   * Evaluates the current local date and time for a group given its IANA timezone.
   * Defaults to Africa/Addis_Ababa per schema defaults.
   * @param {string} [timezone="Africa/Addis_Ababa"]
   * @param {Date} [now=new Date()]
   * @returns {{ year: number, month: number, day: number, dateString: string, timeString: string }}
   */
  getGroupLocalDateTime(timezone = "Africa/Addis_Ababa", now = new Date()) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const getVal = (type) => parts.find((p) => p.type === type)?.value;

      const year = parseInt(getVal("year"), 10);
      const month = parseInt(getVal("month"), 10);
      const day = parseInt(getVal("day"), 10);
      const hour = getVal("hour");
      const minute = getVal("minute");
      const second = getVal("second");

      return {
        year,
        month,
        day,
        dateString: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        timeString: `${hour}:${minute}:${second}`,
      };
    } catch {
      // Fallback to UTC if timezone is invalid
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const day = now.getUTCDate();
      return {
        year,
        month,
        day,
        dateString: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        timeString: now.toISOString().slice(11, 19),
      };
    }
  },

  /**
   * Determines if a calendar year is a leap year.
   * @param {number} year 
   * @returns {boolean}
   */
  isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  },

  /**
   * Fetches all birthday celebrants for a group on a specific date,
   * handling leap year policy (Feb 29 celebrants on Feb 28 or Mar 1 in non-leap years).
   * @param {number} groupId 
   * @param {number} month 
   * @param {number} day 
   * @param {number} year 
   * @param {string} [leapYearPolicy="feb28"] 'feb28' or 'mar1'
   * @returns {Promise<Array<object>>}
   */
  async getCelebrantsForDate(groupId, month, day, year, leapYearPolicy = "feb28") {
    const celebrants = await birthdayService.getBirthdaysByDate(groupId, month, day);

    // In non-leap years, celebrate Feb 29 birthdays according to group policy
    if (!this.isLeapYear(year)) {
      if (month === 2 && day === 28 && leapYearPolicy === "feb28") {
        const leapCelebrants = await birthdayService.getBirthdaysByDate(groupId, 2, 29);
        celebrants.push(...leapCelebrants);
      } else if (month === 3 && day === 1 && leapYearPolicy === "mar1") {
        const leapCelebrants = await birthdayService.getBirthdaysByDate(groupId, 2, 29);
        celebrants.push(...leapCelebrants);
      }
    }

    return celebrants;
  },

  /**
   * Formats the final Telegram announcement message.
   * Returns null if nobody has a birthday today.
   * @param {Array<object>} celebrants 
   * @returns {string | null}
   */
  formatMessage(celebrants) {
    return formatBirthdayAnnouncement(celebrants);
  },

  /**
   * Atomically claims due announcement jobs from Supabase.
   * Enforces due time, lease fencing, stale worker recovery, and retry backoff.
   * @param {object} [options]
   * @param {number} [options.leaseSeconds=300]
   * @param {number} [options.batchSize=10]
   * @param {number} [options.maxRetries=3]
   * @returns {Promise<Array<object>>} Claimed jobs
   */
  async claimJobs({ leaseSeconds = 300, batchSize = 10, maxRetries = 3 } = {}) {
    if (!supabase) return [];

    const { data, error } = await supabase.rpc("bd_ping_claim_announcement_jobs", {
      p_lease_seconds: leaseSeconds,
      p_batch_size: batchSize,
      p_max_retries: maxRetries,
    });

    if (error) {
      throw new Error(`Failed to claim announcement jobs: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Completes an announcement job with lease fencing verification.
   * @param {object} params
   * @param {string} params.jobId 
   * @param {string} params.claimToken 
   * @param {string} params.status 'sent' | 'failed'
   * @param {number} [params.telegramMessageId]
   * @param {string} [params.errorMessage]
   * @param {number} [params.backoffBaseSeconds=30]
   * @returns {Promise<{ success: boolean, reason?: string }>}
   */
  async completeJob({ jobId, claimToken, status, telegramMessageId, errorMessage, backoffBaseSeconds = 30 }) {
    if (!supabase) return { success: true };

    const { data, error } = await supabase.rpc("bd_ping_complete_announcement_job", {
      p_job_id: jobId,
      p_claim_token: claimToken,
      p_status: status,
      p_telegram_message_id: telegramMessageId !== undefined ? telegramMessageId : null,
      p_error_message: errorMessage || null,
      p_backoff_base_seconds: backoffBaseSeconds,
    });

    if (error) {
      throw new Error(`Failed to complete announcement job: ${error.message}`);
    }

    return data;
  },

  /**
   * Records historical snapshot of announced birthdays in junction table.
   * @param {string} announcementLogId 
   * @param {number} groupId 
   * @param {Array<object>} celebrants 
   * @returns {Promise<void>}
   */
  async recordSnapshots(announcementLogId, groupId, celebrants) {
    if (!supabase || !celebrants || celebrants.length === 0) return;

    const rows = celebrants.map((c) => ({
      announcement_log_id: announcementLogId,
      birthday_id: c.id,
      group_id: groupId,
      member_name_snapshot: c.name,
      member_username_snapshot: c.username || null,
      birth_month: c.birth_month,
      birth_day: c.birth_day,
    }));

    const { error } = await supabase
      .from("announcement_log_birthdays")
      .upsert(rows, { onConflict: "announcement_log_id, birthday_id", ignoreDuplicates: true });

    if (error) {
      console.error(`Warning: Failed to record announcement snapshots: ${error.message}`);
    }
  },

  /**
   * Enqueues daily announcement logs for all active groups.
   * Idempotent: uses UNIQUE (group_id, announcement_date) constraint.
   * If a group has NO birthdays today, marks it completed (status: 'sent', telegram_message_id: 0)
   * so it does not leave pending/unprocessed jobs in the database.
   * @returns {Promise<{ enqueued: number, emptyDaysMarked: number }>}
   */
  async enqueueDailyJobs() {
    if (!supabase) return { enqueued: 0, emptyDaysMarked: 0 };

    const { data: groups, error } = await supabase
      .from("groups")
      .select("id, timezone, announcement_time, leap_year_policy")
      .eq("is_active", true);

    if (error) {
      console.error(`Error querying active groups for announcements: ${error.message}`);
      return { enqueued: 0, emptyDaysMarked: 0 };
    }

    let enqueued = 0;
    let emptyDaysMarked = 0;

    for (const group of (groups || [])) {
      const local = this.getGroupLocalDateTime(group.timezone);
      const dateString = local.dateString;

      // Check if announcement record already exists for this group and date
      const { data: existing, error: checkError } = await supabase
        .from("announcement_logs")
        .select("id, status")
        .eq("group_id", group.id)
        .eq("announcement_date", dateString)
        .maybeSingle();

      if (checkError) {
        console.error(`Error checking announcement log for group ${group.id}: ${checkError.message}`);
        continue;
      }

      // If record already exists in any state, leave it intact (idempotency)
      if (existing) continue;

      // Check if group has celebrants today
      const celebrants = await this.getCelebrantsForDate(
        group.id,
        local.month,
        local.day,
        local.year,
        group.leap_year_policy || "feb28"
      );

      if (celebrants.length === 0) {
        // Requirement 8 & 5: Empty birthday days send NO message and are completed cleanly
        const { error: insertError } = await supabase
          .from("announcement_logs")
          .insert({
            group_id: group.id,
            announcement_date: dateString,
            status: "sent",
            telegram_message_id: 0, // Sentinel 0: Valid BIGINT indicating completed empty day
            sent_at: new Date().toISOString(),
            error_message: "No birthdays today",
          });

        if (!insertError) emptyDaysMarked++;
      } else {
        // Enqueue pending announcement for when due time arrives
        const { error: insertError } = await supabase
          .from("announcement_logs")
          .insert({
            group_id: group.id,
            announcement_date: dateString,
            status: "pending",
          });

        if (!insertError) enqueued++;
      }
    }

    return { enqueued, emptyDaysMarked };
  },

  /**
   * Dispatches an announcement for a specific claimed job.
   * If nobody has a birthday, sends no message and completes the job with telegram_message_id: 0.
   * @param {object} botApi grammY bot.api instance
   * @param {object} job Claimed job row
   * @returns {Promise<{ sent: boolean, celebrantCount: number, messageId?: number }>}
   */
  async dispatchJob(botApi, job) {
    const [yearStr, monthStr, dayStr] = job.announcement_date.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    const celebrants = await this.getCelebrantsForDate(
      job.group_id,
      month,
      day,
      year,
      job.group_leap_year_policy || "feb28"
    );

    // Requirement 8 & 5: If nobody has a birthday, send NO message and complete job cleanly
    if (!celebrants || celebrants.length === 0) {
      await this.completeJob({
        jobId: job.id,
        claimToken: job.claim_token,
        status: "sent",
        telegramMessageId: 0, // Sentinel 0 satisfies NOT NULL in bd_ping_complete_announcement_job
      });
      return { sent: false, celebrantCount: 0 };
    }

    const messageText = formatBirthdayAnnouncement(celebrants);

    try {
      const sentMessage = await botApi.sendMessage(job.group_id, messageText, {
        parse_mode: "HTML",
      });

      // Record snapshot junction rows
      await this.recordSnapshots(job.id, job.group_id, celebrants);

      // Complete job with lease fencing token
      await this.completeJob({
        jobId: job.id,
        claimToken: job.claim_token,
        status: "sent",
        telegramMessageId: sentMessage.message_id,
      });

      return { sent: true, celebrantCount: celebrants.length, messageId: sentMessage.message_id };
    } catch (err) {
      // Record failure and trigger exponential retry backoff
      await this.completeJob({
        jobId: job.id,
        claimToken: job.claim_token,
        status: "failed",
        errorMessage: err.message,
      });
      throw err;
    }
  },

  /**
   * Executes a complete announcement processing cycle:
   * 1. Enqueues daily jobs for active groups.
   * 2. Atomically claims due announcement jobs.
   * 3. Dispatches each job to Telegram.
   * @param {object} botApi grammY bot.api instance
   * @param {object} [options]
   * @returns {Promise<{ enqueued: number, processed: number, errors: number }>}
   */
  async runAnnouncementSweep(botApi, options = {}) {
    if (this._isSweeping) return { enqueued: 0, processed: 0, errors: 0 };
    this._isSweeping = true;

    let processed = 0;
    let errors = 0;
    let enqueued = 0;

    try {
      // Step 1: Enqueue daily logs for active groups
      const enqueueResult = await this.enqueueDailyJobs();
      enqueued = enqueueResult.enqueued;

      // Step 2: Claim due announcement jobs (respecting timezone, due time, backoff, leases)
      const claimedJobs = await this.claimJobs(options);

      // Step 3: Dispatch each claimed job
      for (const job of claimedJobs) {
        try {
          await this.dispatchJob(botApi, job);
          processed++;
        } catch (err) {
          console.error(`Error dispatching announcement job ${job.id}:`, err);
          errors++;
        }
      }
    } catch (sweepError) {
      console.error("Announcement sweep error:", sweepError);
    } finally {
      this._isSweeping = false;
    }

    return { enqueued, processed, errors };
  },

  /**
   * Starts the background recurring announcement scheduler.
   * Sweeps every intervalMs (defaults to 60 seconds).
   * @param {object} botApi grammY bot.api instance
   * @param {object} [options]
   * @param {number} [options.intervalMs=60000]
   */
  startScheduler(botApi, { intervalMs = 60000, ...sweepOptions } = {}) {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
    }

    // Trigger immediate initial sweep
    this.runAnnouncementSweep(botApi, sweepOptions).catch((err) => {
      console.error("Initial announcement sweep failed:", err);
    });

    // Schedule recurring sweeps
    this._schedulerTimer = setInterval(() => {
      this.runAnnouncementSweep(botApi, sweepOptions).catch((err) => {
        console.error("Scheduled announcement sweep failed:", err);
      });
    }, intervalMs);

    // Unref timer so it doesn't block process exit if unmanaged
    if (this._schedulerTimer.unref) {
      this._schedulerTimer.unref();
    }

    return this._schedulerTimer;
  },

  /**
   * Stops the background scheduler cleanly.
   */
  stopScheduler() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  },
};
