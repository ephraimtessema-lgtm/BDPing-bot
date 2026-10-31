-- ============================================================================
-- Migration: 001_initial_schema.sql (Revised v5)
-- Project: BD Ping (@BDPingBot)
-- Description: Core database architecture with strict group isolation,
--              atomic announcement claiming with lease fencing & catch-up due time,
--              exponential retry backoff, auditable junction logs with member snapshots,
--              secure hashed deep-link registration tokens, and RLS protection.
-- ============================================================================

-- Enable pgcrypto for UUID generation and cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Helper Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION bd_ping_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bd_ping_validate_group_timezone()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM ('2026-01-01 00:00:00+00'::timestamptz AT TIME ZONE NEW.timezone);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone
      USING ERRCODE = 'invalid_parameter_value';
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Table: groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'group'
    CHECK (type IN ('group', 'supergroup')),
  timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
  announcement_time TIME NOT NULL DEFAULT '09:00:00',
  leap_year_policy TEXT NOT NULL DEFAULT 'feb28'
    CHECK (leap_year_policy IN ('feb28', 'mar01')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at
BEFORE UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION bd_ping_set_updated_at();

DROP TRIGGER IF EXISTS trg_groups_validate_timezone ON groups;
CREATE TRIGGER trg_groups_validate_timezone
BEFORE INSERT OR UPDATE OF timezone ON groups
FOR EACH ROW EXECUTE FUNCTION bd_ping_validate_group_timezone();

-- ============================================================================
-- 3. Table: birthdays
-- ============================================================================

CREATE TABLE IF NOT EXISTS birthdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  username TEXT,
  birth_month SMALLINT NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
  birth_day SMALLINT NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_group_user_birthday
    UNIQUE (group_id, telegram_user_id),

  CONSTRAINT uq_birthdays_id_group
    UNIQUE (id, group_id),

  CONSTRAINT chk_valid_calendar_day CHECK (
    (birth_month IN (1, 3, 5, 7, 8, 10, 12) AND birth_day BETWEEN 1 AND 31) OR
    (birth_month IN (4, 6, 9, 11) AND birth_day BETWEEN 1 AND 30) OR
    (birth_month = 2 AND birth_day BETWEEN 1 AND 29)
  )
);

DROP TRIGGER IF EXISTS trg_birthdays_updated_at ON birthdays;
CREATE TRIGGER trg_birthdays_updated_at
BEFORE UPDATE ON birthdays
FOR EACH ROW EXECUTE FUNCTION bd_ping_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_birthdays_group_date
  ON birthdays(group_id, birth_month, birth_day);

CREATE INDEX IF NOT EXISTS idx_birthdays_user
  ON birthdays(telegram_user_id);

-- ============================================================================
-- 4. Table: announcement_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS announcement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  announcement_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  telegram_message_id BIGINT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_group_announcement_date
    UNIQUE (group_id, announcement_date),

  CONSTRAINT uq_announcement_logs_id_group
    UNIQUE (id, group_id),

  CONSTRAINT chk_sending_lease_consistency
    CHECK (status != 'sending' OR claim_token IS NOT NULL),

  CONSTRAINT chk_sent_terminal
    CHECK (status != 'sent' OR sent_at IS NOT NULL)
);

DROP TRIGGER IF EXISTS trg_announcement_logs_updated_at ON announcement_logs;
CREATE TRIGGER trg_announcement_logs_updated_at
BEFORE UPDATE ON announcement_logs
FOR EACH ROW EXECUTE FUNCTION bd_ping_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_announcement_logs_group_status
  ON announcement_logs(group_id, announcement_date, status);

CREATE INDEX IF NOT EXISTS idx_announcement_logs_recovery
  ON announcement_logs(status, next_retry_at, claimed_at)
  WHERE status IN ('pending', 'sending', 'failed');

-- ============================================================================
-- 5. Table: announcement_log_birthdays
-- ============================================================================

CREATE TABLE IF NOT EXISTS announcement_log_birthdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_log_id UUID NOT NULL,
  birthday_id UUID,
  group_id BIGINT NOT NULL,

  member_name_snapshot TEXT NOT NULL,
  member_username_snapshot TEXT,
  birth_month SMALLINT NOT NULL,
  birth_day SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_alb_announcement
    FOREIGN KEY (announcement_log_id, group_id)
    REFERENCES announcement_logs(id, group_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_alb_birthday
    FOREIGN KEY (birthday_id, group_id)
    REFERENCES birthdays(id, group_id)
    ON DELETE SET NULL (birthday_id),

  CONSTRAINT uq_announcement_birthday
    UNIQUE (announcement_log_id, birthday_id)
);

CREATE INDEX IF NOT EXISTS idx_alb_announcement_log
  ON announcement_log_birthdays(announcement_log_id);

CREATE INDEX IF NOT EXISTS idx_alb_birthday
  ON announcement_log_birthdays(birthday_id);

-- ============================================================================
-- 6. Table: registration_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS registration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  telegram_user_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reg_sessions_updated_at ON registration_sessions;
CREATE TRIGGER trg_reg_sessions_updated_at
BEFORE UPDATE ON registration_sessions
FOR EACH ROW EXECUTE FUNCTION bd_ping_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_group_pending_session
  ON registration_sessions (telegram_user_id, group_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reg_sessions_lookup
  ON registration_sessions(telegram_user_id, status);

-- ============================================================================
-- 7. Atomic Announcement Job Claiming
-- ============================================================================

CREATE OR REPLACE FUNCTION bd_ping_claim_announcement_jobs(
  p_lease_seconds INTEGER DEFAULT 300,
  p_batch_size INTEGER DEFAULT 10,
  p_max_retries INTEGER DEFAULT 3
)
RETURNS SETOF announcement_logs AS $$
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 10 THEN
    RAISE EXCEPTION 'p_lease_seconds must be at least 10 seconds'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'p_batch_size must be between 1 and 100'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_max_retries IS NULL OR p_max_retries < 1 OR p_max_retries > 20 THEN
    RAISE EXCEPTION 'p_max_retries must be between 1 and 20'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Mark exhausted sending jobs as failed.
  UPDATE announcement_logs
  SET
    status = 'failed',
    error_message = COALESCE(
      error_message,
      'Exhausted maximum retries (worker lease expired)'
    ),
    claimed_at = NULL,
    claim_token = NULL,
    updated_at = now()
  WHERE status = 'sending'
    AND (
      claimed_at IS NULL
      OR claimed_at < (now() - (p_lease_seconds || ' seconds')::interval)
    )
    AND retry_count >= p_max_retries;

  -- Claim eligible jobs atomically.
  RETURN QUERY
  WITH claimable AS (
    SELECT al.id
    FROM announcement_logs al
    JOIN groups g ON g.id = al.group_id
    WHERE g.is_active = true

      -- Respect each group's local announcement date and time.
      AND (
        (now() AT TIME ZONE g.timezone)::date,
        (now() AT TIME ZONE g.timezone)::time
      ) >= (
        al.announcement_date,
        g.announcement_time
      )

      AND (
        al.status = 'pending'

        OR (
          al.status = 'failed'
          AND al.retry_count < p_max_retries
          AND (
            al.next_retry_at IS NULL
            OR al.next_retry_at <= now()
          )
        )

        OR (
          al.status = 'sending'
          AND (
            al.claimed_at IS NULL
            OR al.claimed_at < (now() - (p_lease_seconds || ' seconds')::interval)
          )
          AND al.retry_count < p_max_retries
        )
      )

    ORDER BY al.announcement_date ASC, al.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )

  UPDATE announcement_logs al
  SET
    status = 'sending',
    claim_token = gen_random_uuid(),
    claimed_at = now(),
    retry_count = al.retry_count + 1,
    error_message = NULL,
    next_retry_at = NULL,
    updated_at = now()
  FROM claimable c
  WHERE al.id = c.id
  RETURNING al.*;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Fenced Worker Completion Function
-- ============================================================================

CREATE OR REPLACE FUNCTION bd_ping_complete_announcement_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_status TEXT,
  p_telegram_message_id BIGINT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_backoff_base_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
  v_retry_count INTEGER;
BEGIN
  -- Validate status, including NULL.
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'p_status must be either "sent" or "failed"'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'p_claim_token is required for lease fencing'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Validate retry backoff.
  IF p_backoff_base_seconds IS NULL
     OR p_backoff_base_seconds < 1
     OR p_backoff_base_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid backoff base seconds'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A successful job must have a Telegram message ID.
  IF p_status = 'sent'
     AND p_telegram_message_id IS NULL THEN
    RAISE EXCEPTION 'Telegram message ID is required for sent status'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_status = 'sent' THEN

    -- Successful delivery: update only if the claim token is current.
    UPDATE announcement_logs
    SET
      status = 'sent',
      telegram_message_id = p_telegram_message_id,
      sent_at = now(),
      claimed_at = NULL,
      claim_token = NULL,
      error_message = NULL,
      next_retry_at = NULL,
      updated_at = now()
    WHERE id = p_job_id
      AND claim_token = p_claim_token
      AND status = 'sending';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;

  ELSE

    -- Failed delivery: retrieve retry count only for the current worker.
    SELECT retry_count INTO v_retry_count
    FROM announcement_logs
    WHERE id = p_job_id
      AND claim_token = p_claim_token
      AND status = 'sending';

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    -- Exponential backoff:
    -- Attempt 1: 30 seconds
    -- Attempt 2: 60 seconds
    -- Attempt 3: 120 seconds
    UPDATE announcement_logs
    SET
      status = 'failed',
      error_message = p_error_message,
      claimed_at = NULL,
      claim_token = NULL,
      next_retry_at = now() + (
        interval '1 second' *
        (
          p_backoff_base_seconds *
          power(2, GREATEST(v_retry_count - 1, 0))
        )
      ),
      updated_at = now()
    WHERE id = p_job_id
      AND claim_token = p_claim_token
      AND status = 'sending';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;

  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. RPC Execution Permissions
-- ============================================================================

REVOKE EXECUTE ON FUNCTION
  bd_ping_claim_announcement_jobs(INTEGER, INTEGER, INTEGER)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  bd_ping_claim_announcement_jobs(INTEGER, INTEGER, INTEGER)
FROM anon;

REVOKE EXECUTE ON FUNCTION
  bd_ping_claim_announcement_jobs(INTEGER, INTEGER, INTEGER)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  bd_ping_claim_announcement_jobs(INTEGER, INTEGER, INTEGER)
TO service_role;

REVOKE EXECUTE ON FUNCTION
  bd_ping_complete_announcement_job(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  bd_ping_complete_announcement_job(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER)
FROM anon;

REVOKE EXECUTE ON FUNCTION
  bd_ping_complete_announcement_job(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
  bd_ping_complete_announcement_job(UUID, UUID, TEXT, BIGINT, TEXT, INTEGER)
TO service_role;

-- ============================================================================
-- 10. Row Level Security (RLS)
-- ============================================================================

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_log_birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny public access on groups" ON groups;
CREATE POLICY "Deny public access on groups"
ON groups FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny public access on birthdays" ON birthdays;
CREATE POLICY "Deny public access on birthdays"
ON birthdays FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny public access on announcement_logs" ON announcement_logs;
CREATE POLICY "Deny public access on announcement_logs"
ON announcement_logs FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny public access on announcement_log_birthdays" ON announcement_log_birthdays;
CREATE POLICY "Deny public access on announcement_log_birthdays"
ON announcement_log_birthdays FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny public access on registration_sessions" ON registration_sessions;
CREATE POLICY "Deny public access on registration_sessions"
ON registration_sessions FOR ALL USING (false);