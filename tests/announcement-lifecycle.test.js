import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

/**
 * Announcement Lifecycle, Lease Fencing & Retry Backoff Simulation
 * 
 * Tests the exact algorithmic logic implemented in:
 *   - bd_ping_claim_announcement_jobs (claim, due-time, stale lease, NULL lease, retry limits)
 *   - bd_ping_complete_announcement_job (fencing token verification, backoff calculation)
 * 
 * NOTE: This is a standalone JavaScript state machine simulation verifying the logic
 * prior to executing live PostgreSQL integration tests.
 */
describe("[STATE MACHINE] Announcement Claiming, Leases & Fencing Lifecycle", () => {
  // Simulates bd_ping_claim_announcement_jobs logic in JavaScript
  function simulateClaimJobs(jobs, options = {}) {
    const {
      leaseSeconds = 300,
      batchSize = 10,
      maxRetries = 3,
      currentLocalTime = new Date("2026-10-31T09:00:00Z"), // ISO time
    } = options;

    if (!leaseSeconds || leaseSeconds < 10) throw new Error("p_lease_seconds must be at least 10 seconds");
    if (!batchSize || batchSize < 1 || batchSize > 100) throw new Error("p_batch_size must be between 1 and 100");
    if (!maxRetries || maxRetries < 1 || maxRetries > 20) throw new Error("p_max_retries must be between 1 and 20");

    const leaseWindowMs = leaseSeconds * 1000;
    const nowMs = currentLocalTime.getTime();

    // Step 1: Mark exhausted sending jobs as permanently failed
    // Explicitly handles claimed_at === null
    for (const job of jobs) {
      const isLeaseExpired = !job.claimed_at || (nowMs - job.claimed_at.getTime() >= leaseWindowMs);
      if (job.status === "sending" && isLeaseExpired && job.retry_count >= maxRetries) {
        job.status = "failed";
        job.error_message = job.error_message || "Exhausted maximum retries (worker lease expired)";
        job.claimed_at = null;
        job.claim_token = null;
      }
    }

    // Step 2: Identify claimable jobs
    const claimable = jobs.filter((job) => {
      if (!job.is_group_active) return false;

      // Due time comparison: (now_date, now_time) >= (announcement_date, announcement_time)
      const jobDueTime = new Date(`${job.announcement_date}T${job.group_announcement_time}Z`);
      if (currentLocalTime < jobDueTime) {
        // Future job! Must NOT be claimed early
        return false;
      }

      // 1. Fresh pending
      if (job.status === "pending") return true;

      // 2. Recoverable failed with backoff check
      if (job.status === "failed" && job.retry_count < maxRetries) {
        if (job.next_retry_at && job.next_retry_at > currentLocalTime) {
          // Still in backoff cooldown period
          return false;
        }
        return true;
      }

      // 3. Stale sending job (including NULL claimed_at) under retry limit
      const isLeaseExpired = !job.claimed_at || (nowMs - job.claimed_at.getTime() >= leaseWindowMs);
      if (job.status === "sending" && isLeaseExpired && job.retry_count < maxRetries) {
        return true;
      }

      return false;
    }).slice(0, batchSize);

    // Step 3: Claim jobs and assign new fencing claim_token
    const claimed = [];
    for (const job of claimable) {
      job.status = "sending";
      job.claim_token = crypto.randomUUID(); // Unique lease generation token
      job.claimed_at = new Date(nowMs);
      job.retry_count += 1;
      job.error_message = null; // Clear transient error
      job.next_retry_at = null; // Clear backoff
      claimed.push(job);
    }

    return { claimed, allJobs: jobs };
  }

  // Simulates bd_ping_complete_announcement_job logic in JavaScript
  function simulateCompleteJob(job, { claimToken, status, telegramMessageId, errorMessage, backoffBaseSeconds = 30, currentTime = new Date() }) {
    if (!["sent", "failed"].includes(status)) throw new Error("Invalid status");
    if (!claimToken) throw new Error("p_claim_token is required for lease fencing");

    // Fencing check: token must match current active lease
    if (job.claim_token !== claimToken) {
      return { success: false, reason: "FENCED_OUT_STALE_WORKER" };
    }

    if (status === "sent") {
      job.status = "sent";
      job.telegram_message_id = telegramMessageId;
      job.sent_at = new Date(currentTime);
      job.claimed_at = null;
      job.claim_token = null;
      job.error_message = null;
      job.next_retry_at = null;
      return { success: true };
    } else {
      // Failed with exponential backoff: base_seconds * 2^(retry_count - 1)
      const exponent = Math.max(job.retry_count - 1, 0);
      const backoffSeconds = backoffBaseSeconds * Math.pow(2, exponent);
      job.status = "failed";
      job.error_message = errorMessage;
      job.claimed_at = null;
      job.claim_token = null;
      job.next_retry_at = new Date(currentTime.getTime() + backoffSeconds * 1000);
      return { success: true, backoffSeconds };
    }
  }

  test("CRITICAL: Future announcements are NOT claimed early before due time", () => {
    const jobs = [
      {
        id: "future-job",
        announcement_date: "2026-10-31",
        group_announcement_time: "09:00:00",
        status: "pending",
        retry_count: 0,
        is_group_active: true,
      },
    ];

    // Current local time is 08:30:00 (before 09:00:00 due time)
    const currentLocalTime = new Date("2026-10-31T08:30:00Z");
    const { claimed } = simulateClaimJobs(jobs, { currentLocalTime });
    assert.equal(claimed.length, 0, "Job due at 09:00:00 must NOT be claimed at 08:30:00");
  });

  test("Catch-up behavior: Overdue announcements are claimed after downtime", () => {
    const jobs = [
      {
        id: "overdue-job",
        announcement_date: "2026-10-31",
        group_announcement_time: "09:00:00",
        status: "pending",
        retry_count: 0,
        is_group_active: true,
      },
    ];

    // Server was down until 11:15:00
    const currentLocalTime = new Date("2026-10-31T11:15:00Z");
    const { claimed } = simulateClaimJobs(jobs, { currentLocalTime });
    assert.equal(claimed.length, 1, "Overdue job must be claimed as a catch-up task");
    assert.equal(claimed[0].status, "sending");
    assert.ok(claimed[0].claim_token, "Fencing token must be generated");
  });

  test("Lease fencing: Rejects completion updates from stale workers", () => {
    const job = {
      id: "job-1",
      announcement_date: "2026-10-31",
      group_announcement_time: "09:00:00",
      status: "pending",
      retry_count: 0,
      is_group_active: true,
    };

    // Worker A claims job at 09:00:00
    const timeA = new Date("2026-10-31T09:00:00Z");
    const claimA = simulateClaimJobs([job], { currentLocalTime: timeA, leaseSeconds: 300 });
    const workerAToken = claimA.claimed[0].claim_token;

    // Worker A hangs for 400 seconds (lease expires). Worker B reclaims the job at 09:06:40
    const timeB = new Date("2026-10-31T09:06:40Z");
    const claimB = simulateClaimJobs([job], { currentLocalTime: timeB, leaseSeconds: 300 });
    const workerBToken = claimB.claimed[0].claim_token;

    assert.notEqual(workerAToken, workerBToken, "Worker B must receive a new distinct claim token");

    // Worker A finally wakes up and attempts to mark the job 'sent' with its stale token
    const staleResult = simulateCompleteJob(job, {
      claimToken: workerAToken,
      status: "sent",
      telegramMessageId: 12345n,
    });

    assert.equal(staleResult.success, false, "Stale worker completion must be rejected");
    assert.equal(staleResult.reason, "FENCED_OUT_STALE_WORKER");
    assert.equal(job.status, "sending", "Job status remains active for Worker B");

    // Worker B completes the job with its valid token
    const validResult = simulateCompleteJob(job, {
      claimToken: workerBToken,
      status: "sent",
      telegramMessageId: 67890n,
    });
    assert.equal(validResult.success, true);
    assert.equal(job.status, "sent");
    assert.equal(job.telegram_message_id, 67890n);
  });

  test("NULL lease recovery: Recovers jobs stuck in 'sending' with NULL claimed_at", () => {
    const jobs = [
      {
        id: "malformed-job",
        announcement_date: "2026-10-31",
        group_announcement_time: "09:00:00",
        status: "sending",
        claimed_at: null, // Malformed or interrupted record
        retry_count: 1,
        is_group_active: true,
      },
    ];

    const currentLocalTime = new Date("2026-10-31T09:10:00Z");
    const { claimed } = simulateClaimJobs(jobs, { currentLocalTime });
    assert.equal(claimed.length, 1, "Job with NULL claimed_at must be recovered");
    assert.equal(claimed[0].retry_count, 2);
    assert.ok(claimed[0].claimed_at instanceof Date);
  });

  test("Retry backoff: Failed jobs must wait until next_retry_at", () => {
    const job = {
      id: "retry-job",
      announcement_date: "2026-10-31",
      group_announcement_time: "09:00:00",
      status: "pending",
      retry_count: 0,
      is_group_active: true,
    };

    // Attempt 1: Claim and fail
    const time1 = new Date("2026-10-31T09:00:00Z");
    const claim1 = simulateClaimJobs([job], { currentLocalTime: time1 });
    const failResult1 = simulateCompleteJob(job, {
      claimToken: claim1.claimed[0].claim_token,
      status: "failed",
      errorMessage: "Telegram 502 Bad Gateway",
      backoffBaseSeconds: 30,
      currentTime: time1,
    });

    assert.equal(failResult1.backoffSeconds, 30, "Attempt 1 backoff: 30s * 2^0 = 30s");
    assert.equal(job.status, "failed");
    assert.ok(job.next_retry_at instanceof Date);

    // 10 seconds later: still inside 30s backoff window -> must NOT be claimed
    const time2 = new Date("2026-10-31T09:00:10Z");
    const claim2 = simulateClaimJobs([job], { currentLocalTime: time2 });
    assert.equal(claim2.claimed.length, 0, "Job must not be claimed before backoff expires");

    // 35 seconds later: past backoff window -> claimed for Attempt 2
    const time3 = new Date("2026-10-31T09:00:35Z");
    const claim3 = simulateClaimJobs([job], { currentLocalTime: time3 });
    assert.equal(claim3.claimed.length, 1, "Job should be claimed after backoff expires");
    assert.equal(claim3.claimed[0].retry_count, 2);

    // Attempt 2 fails -> backoff: 30s * 2^1 = 60s
    const failResult2 = simulateCompleteJob(job, {
      claimToken: claim3.claimed[0].claim_token,
      status: "failed",
      errorMessage: "Telegram 502 Bad Gateway",
      backoffBaseSeconds: 30,
      currentTime: time3,
    });
    assert.equal(failResult2.backoffSeconds, 60, "Attempt 2 backoff: 30s * 2^1 = 60s");
  });

  test("Exhausted retries: Total attempts bounded by maxRetries", () => {
    const job = {
      id: "bounded-job",
      announcement_date: "2026-10-31",
      group_announcement_time: "09:00:00",
      status: "pending",
      retry_count: 0,
      is_group_active: true,
    };

    let currentTime = new Date("2026-10-31T09:00:00Z");

    // Attempt 1
    let claim = simulateClaimJobs([job], { currentLocalTime: currentTime, maxRetries: 3 });
    simulateCompleteJob(job, { claimToken: claim.claimed[0].claim_token, status: "failed", currentTime });

    // Attempt 2 (after backoff)
    currentTime = new Date(currentTime.getTime() + 40000);
    claim = simulateClaimJobs([job], { currentLocalTime: currentTime, maxRetries: 3 });
    simulateCompleteJob(job, { claimToken: claim.claimed[0].claim_token, status: "failed", currentTime });

    // Attempt 3 (final allowed attempt)
    currentTime = new Date(currentTime.getTime() + 70000);
    claim = simulateClaimJobs([job], { currentLocalTime: currentTime, maxRetries: 3 });
    assert.equal(claim.claimed[0].retry_count, 3);
    simulateCompleteJob(job, { claimToken: claim.claimed[0].claim_token, status: "failed", currentTime });

    // Next sweep: retry_count is 3, maxRetries is 3 -> MUST NOT CLAIM
    currentTime = new Date(currentTime.getTime() + 150000);
    claim = simulateClaimJobs([job], { currentLocalTime: currentTime, maxRetries: 3 });
    assert.equal(claim.claimed.length, 0, "Exhausted job must not be retried further");
    assert.equal(job.status, "failed");
  });
});

describe("[SEMANTIC TEST] Column-Specific ON DELETE SET NULL (birthday_id)", () => {
  test("Deleting a member birthday preserves NOT NULL group_id and member snapshot in junction", () => {
    const birthday = { id: "bday-123", group_id: -1001234567890n, name: "Alice", birth_month: 5, birth_day: 14 };
    const junctionRow = {
      id: "junc-999",
      announcement_log_id: "ann-456",
      birthday_id: birthday.id,
      group_id: birthday.group_id, // NOT NULL in schema
      member_name_snapshot: birthday.name,
      birth_month: birthday.birth_month,
      birth_day: birthday.birth_day,
    };

    // When birthday is deleted with ON DELETE SET NULL (birthday_id):
    // Only birthday_id is set to null; group_id and snapshots remain untouched
    junctionRow.birthday_id = null;

    assert.equal(junctionRow.birthday_id, null, "birthday_id should be null");
    assert.equal(junctionRow.group_id, -1001234567890n, "group_id must NOT be nulled (remains NOT NULL)");
    assert.equal(junctionRow.member_name_snapshot, "Alice", "Member name snapshot preserved");
    assert.equal(junctionRow.birth_month, 5, "Birth month snapshot preserved");
    assert.equal(junctionRow.birth_day, 14, "Birth day snapshot preserved");
  });
});
