
-- ============================================================================
-- Migration: 002_registration_atomicity.sql
-- Project: BD Ping (@BDPingBot)
--
-- Description:
--   1. Enforce one pending registration session per Telegram user.
--   2. Create registration sessions atomically.
--   3. Complete private registration atomically.
--   4. Never overwrite an existing birthday.
--   5. Safely handle concurrent registration attempts.
--
-- PostgreSQL 17 compatible.
-- ============================================================================


-- ============================================================================
-- 1. ONE PENDING SESSION PER TELEGRAM USER
-- ============================================================================

DROP INDEX IF EXISTS public.uq_user_group_pending_session;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_pending_session
ON public.registration_sessions (telegram_user_id)
WHERE status = 'pending';


-- ============================================================================
-- 2. ATOMIC REGISTRATION SESSION CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bd_ping_create_registration_session(
    p_token_hash TEXT,
    p_telegram_user_id BIGINT,
    p_group_id BIGINT,
    p_expiry_seconds INTEGER DEFAULT 1800
)
RETURNS JSONB
AS $$
DECLARE
    v_session_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN

    -- Parameter validation

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
        RAISE EXCEPTION 'p_token_hash is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_telegram_user_id IS NULL THEN
        RAISE EXCEPTION 'p_telegram_user_id is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_group_id IS NULL THEN
        RAISE EXCEPTION 'p_group_id is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_expiry_seconds IS NULL
       OR p_expiry_seconds < 60
       OR p_expiry_seconds > 86400 THEN

        RAISE EXCEPTION
            'p_expiry_seconds must be between 60 and 86400 seconds'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;


    -- Serialize session creation for this Telegram user.
    -- Concurrent requests for the same user must wait for one another.
    -- Different Telegram users can still create sessions concurrently.

    PERFORM pg_advisory_xact_lock(p_telegram_user_id);


    -- Verify that the target group exists.

    PERFORM 1
    FROM public.groups
    WHERE id = p_group_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'GROUP_NOT_FOUND'
        );
    END IF;


    -- Expire previous pending sessions for this user.

    UPDATE public.registration_sessions
    SET
        status = 'expired',
        updated_at = now()
    WHERE telegram_user_id = p_telegram_user_id
      AND status = 'pending';


    -- Calculate expiration time.

    v_expires_at :=
        now() + (p_expiry_seconds * INTERVAL '1 second');


    -- Create the new pending session.

    INSERT INTO public.registration_sessions (
        token_hash,
        telegram_user_id,
        group_id,
        status,
        expires_at
    )
    VALUES (
        p_token_hash,
        p_telegram_user_id,
        p_group_id,
        'pending',
        v_expires_at
    )
    RETURNING id INTO v_session_id;


    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'expires_at', v_expires_at
    );

END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;


-- Restrict execution to the backend service role.

REVOKE EXECUTE ON FUNCTION
public.bd_ping_create_registration_session(TEXT, BIGINT, BIGINT, INTEGER)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
public.bd_ping_create_registration_session(TEXT, BIGINT, BIGINT, INTEGER)
FROM anon;

REVOKE EXECUTE ON FUNCTION
public.bd_ping_create_registration_session(TEXT, BIGINT, BIGINT, INTEGER)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
public.bd_ping_create_registration_session(TEXT, BIGINT, BIGINT, INTEGER)
TO service_role;


-- ============================================================================
-- 3. ATOMIC PRIVATE BIRTHDAY REGISTRATION COMPLETION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bd_ping_complete_registration(
    p_token_hash TEXT,
    p_telegram_user_id BIGINT,
    p_name TEXT,
    p_username TEXT,
    p_birth_month SMALLINT,
    p_birth_day SMALLINT
)
RETURNS JSONB
AS $$
DECLARE
    v_session public.registration_sessions%ROWTYPE;

    v_group_title TEXT;

    v_birthday_id UUID;

    v_existing_month SMALLINT;
    v_existing_day SMALLINT;

BEGIN

    -- ------------------------------------------------------------------------
    -- 3.1 Parameter validation
    -- ------------------------------------------------------------------------

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
        RAISE EXCEPTION 'p_token_hash is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_telegram_user_id IS NULL THEN
        RAISE EXCEPTION 'p_telegram_user_id is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'p_name is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_birth_month IS NULL
       OR p_birth_month < 1
       OR p_birth_month > 12 THEN

        RAISE EXCEPTION 'p_birth_month must be between 1 and 12'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_birth_day IS NULL
       OR p_birth_day < 1
       OR p_birth_day > 31 THEN

        RAISE EXCEPTION 'p_birth_day must be between 1 and 31'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;


    -- Validate actual calendar boundaries.
    -- February 29 is intentionally permitted.

    IF (
        p_birth_month IN (4, 6, 9, 11)
        AND p_birth_day > 30
    )
    OR (
        p_birth_month = 2
        AND p_birth_day > 29
    ) THEN

        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_CALENDAR_DATE'
        );

    END IF;


    -- ------------------------------------------------------------------------
    -- 3.2 Lock and retrieve the registration session
    -- ------------------------------------------------------------------------

    SELECT *
    INTO v_session
    FROM public.registration_sessions
    WHERE token_hash = p_token_hash
    FOR UPDATE;


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SESSION_NOT_FOUND'
        );
    END IF;


    -- Verify ownership before revealing session status.

    IF v_session.telegram_user_id IS DISTINCT FROM p_telegram_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED_USER'
        );
    END IF;


    IF v_session.status IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SESSION_ALREADY_USED'
        );
    END IF;


    -- Reject expired sessions.

    IF v_session.expires_at <= now() THEN

        UPDATE public.registration_sessions
        SET
            status = 'expired',
            updated_at = now()
        WHERE id = v_session.id;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'SESSION_EXPIRED'
        );

    END IF;


    -- ------------------------------------------------------------------------
    -- 3.3 Attempt atomic birthday insertion
    -- ------------------------------------------------------------------------
    --
    -- IMPORTANT:
    -- The birthdays table must have a UNIQUE constraint or unique index on:
    --
    --     (group_id, telegram_user_id)
    --
    -- This is what makes ON CONFLICT safe under concurrent registration.
    --
    -- If another registration inserts the same user's birthday first,
    -- this INSERT waits for that transaction and then does nothing.
    --
    -- Existing birthday information is NEVER overwritten.
    -- ------------------------------------------------------------------------

    INSERT INTO public.birthdays (
        group_id,
        telegram_user_id,
        name,
        username,
        birth_month,
        birth_day
    )
    VALUES (
        v_session.group_id,
        p_telegram_user_id,
        trim(p_name),
        NULLIF(trim(COALESCE(p_username, '')), ''),
        p_birth_month,
        p_birth_day
    )
    ON CONFLICT (group_id, telegram_user_id)
    DO NOTHING
    RETURNING id INTO v_birthday_id;


    -- ------------------------------------------------------------------------
    -- 3.4 Successful new registration
    -- ------------------------------------------------------------------------

    IF v_birthday_id IS NOT NULL THEN

        UPDATE public.registration_sessions
        SET
            status = 'completed',
            used_at = now(),
            updated_at = now()
        WHERE id = v_session.id;


        SELECT title
        INTO v_group_title
        FROM public.groups
        WHERE id = v_session.group_id;


        RETURN jsonb_build_object(
            'success', true,
            'birthday_id', v_birthday_id,
            'group_id', v_session.group_id,
            'group_title', v_group_title
        );

    END IF;


    -- ------------------------------------------------------------------------
    -- 3.5 Another registration already created this birthday
    -- ------------------------------------------------------------------------
    --
    -- Retrieve the existing birthday without modifying it.
    -- The session is consumed so the user cannot replay the same token.
    -- ------------------------------------------------------------------------

    SELECT birth_month, birth_day
    INTO v_existing_month, v_existing_day
    FROM public.birthdays
    WHERE group_id = v_session.group_id
      AND telegram_user_id = p_telegram_user_id;


    IF NOT FOUND THEN

        -- Defensive protection: a conflict occurred but the expected
        -- existing record could not be retrieved.
        -- Raise an exception so the transaction rolls back safely.

        RAISE EXCEPTION
            'Birthday conflict occurred but existing record was not found';

    END IF;


    UPDATE public.registration_sessions
    SET
        status = 'completed',
        used_at = now(),
        updated_at = now()
    WHERE id = v_session.id;


    RETURN jsonb_build_object(
        'success', false,
        'error', 'ALREADY_REGISTERED',
        'group_id', v_session.group_id,
        'existing_month', v_existing_month,
        'existing_day', v_existing_day
    );

END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;


-- Restrict execution to the backend service role.

REVOKE EXECUTE ON FUNCTION
public.bd_ping_complete_registration(TEXT, BIGINT, TEXT, TEXT, SMALLINT, SMALLINT)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
public.bd_ping_complete_registration(TEXT, BIGINT, TEXT, TEXT, SMALLINT, SMALLINT)
FROM anon;

REVOKE EXECUTE ON FUNCTION
public.bd_ping_complete_registration(TEXT, BIGINT, TEXT, TEXT, SMALLINT, SMALLINT)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
public.bd_ping_complete_registration(TEXT, BIGINT, TEXT, TEXT, SMALLINT, SMALLINT)
TO service_role;


-- ============================================================================
-- END OF MIGRATION 002
-- ============================================================================
