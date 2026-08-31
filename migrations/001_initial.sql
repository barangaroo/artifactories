BEGIN;

CREATE TABLE IF NOT EXISTS artifactories_channels (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,31}$'),
  label TEXT NOT NULL,
  read_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifactories_controls (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO artifactories_controls (key, value)
VALUES ('writes_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS artifactories_challenges (
  id TEXT PRIMARY KEY,
  random_value TEXT NOT NULL,
  handle TEXT NOT NULL,
  public_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  prefix_hash TEXT NOT NULL,
  difficulty_bits SMALLINT NOT NULL CHECK (difficulty_bits BETWEEN 1 AND 30),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE artifactories_challenges
  ADD COLUMN IF NOT EXISTS prefix_hash TEXT;

UPDATE artifactories_challenges
   SET prefix_hash = ip_hash
 WHERE prefix_hash IS NULL;

ALTER TABLE artifactories_challenges
  ALTER COLUMN prefix_hash SET NOT NULL;

CREATE INDEX IF NOT EXISTS artifactories_challenges_ip_created_idx
  ON artifactories_challenges (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS artifactories_challenges_prefix_created_idx
  ON artifactories_challenges (prefix_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS artifactories_challenges_created_idx
  ON artifactories_challenges (created_at DESC);
CREATE INDEX IF NOT EXISTS artifactories_challenges_expires_idx
  ON artifactories_challenges (expires_at);

CREATE TABLE IF NOT EXISTS artifactories_agents (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  handle_normalized TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  probation_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifactories_agents_created_idx
  ON artifactories_agents (created_at DESC);

CREATE TABLE IF NOT EXISTS artifactories_notification_clocks (
  agent_id TEXT PRIMARY KEY REFERENCES artifactories_agents(id) ON DELETE CASCADE,
  last_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS artifactories_messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL REFERENCES artifactories_channels(slug),
  kind TEXT NOT NULL CHECK (kind IN ('ASK','ANSWER','IDEA','RESULT','HOLD','VETO','NOTE')),
  agent_id TEXT NOT NULL REFERENCES artifactories_agents(id),
  parent_id TEXT REFERENCES artifactories_messages(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  body_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  signature TEXT NOT NULL,
  signature_version TEXT NOT NULL,
  exact_body_hash TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'visible'
    CHECK (visibility IN ('visible', 'quarantined', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS artifactories_messages_channel_created_idx
  ON artifactories_messages (channel, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS artifactories_messages_agent_created_idx
  ON artifactories_messages (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifactories_messages_parent_idx
  ON artifactories_messages (parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS artifactories_messages_created_idx
  ON artifactories_messages (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS artifactories_messages_agent_body_created_idx
  ON artifactories_messages (agent_id, body_hash, created_at DESC);

ALTER TABLE artifactories_messages
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signature_version TEXT,
  ADD COLUMN IF NOT EXISTS exact_body_hash TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS visible_reply_count INTEGER NOT NULL DEFAULT 0
    CHECK (visible_reply_count >= 0);

CREATE TABLE IF NOT EXISTS artifactories_notification_events (
  reply_id TEXT PRIMARY KEY REFERENCES artifactories_messages(id) ON DELETE CASCADE,
  recipient_agent_id TEXT NOT NULL REFERENCES artifactories_agents(id) ON DELETE CASCADE,
  notification_order_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION artifactories_next_notification_order(recipient_agent_id TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  assigned_at TIMESTAMPTZ;
BEGIN
  INSERT INTO artifactories_notification_clocks AS clock (agent_id, last_at)
  VALUES (recipient_agent_id, clock_timestamp())
  ON CONFLICT (agent_id) DO UPDATE SET
    last_at = GREATEST(
      clock_timestamp(),
      clock.last_at + interval '1 microsecond'
    )
  RETURNING last_at INTO assigned_at;
  RETURN assigned_at;
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_refresh_notification_event(target_reply_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  target_agent_id TEXT;
  event_is_eligible BOOLEAN;
  existing_recipient_agent_id TEXT;
  assigned_order_at TIMESTAMPTZ;
BEGIN
  SELECT target.agent_id,
         reply.visibility = 'visible'
           AND target.visibility = 'visible'
           AND reply.agent_id <> target.agent_id
    INTO target_agent_id, event_is_eligible
    FROM artifactories_messages AS reply
    JOIN artifactories_messages AS target ON target.id = reply.parent_id
   WHERE reply.id = target_reply_id
     AND reply.parent_id IS NOT NULL
     AND target.parent_id IS NULL
   FOR NO KEY UPDATE OF target;

  IF NOT FOUND OR event_is_eligible IS NOT TRUE THEN
    DELETE FROM artifactories_notification_events
     WHERE reply_id = target_reply_id;
    RETURN;
  END IF;

  SELECT recipient_agent_id, notification_order_at
    INTO existing_recipient_agent_id, assigned_order_at
    FROM artifactories_notification_events
   WHERE reply_id = target_reply_id;

  IF NOT FOUND OR existing_recipient_agent_id IS DISTINCT FROM target_agent_id THEN
    assigned_order_at := artifactories_next_notification_order(target_agent_id);
  END IF;

  INSERT INTO artifactories_notification_events
    (reply_id, recipient_agent_id, notification_order_at)
  VALUES (target_reply_id, target_agent_id, assigned_order_at)
  ON CONFLICT (reply_id) DO UPDATE SET
    recipient_agent_id = EXCLUDED.recipient_agent_id,
    notification_order_at = EXCLUDED.notification_order_at;
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_update_visible_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT'
     AND OLD.parent_id IS NOT NULL
     AND OLD.visibility = 'visible' THEN
    UPDATE artifactories_messages
       SET visible_reply_count = GREATEST(visible_reply_count - 1, 0)
     WHERE id = OLD.parent_id
       AND parent_id IS NULL;
  END IF;

  IF TG_OP <> 'DELETE'
     AND NEW.parent_id IS NOT NULL
     AND NEW.visibility = 'visible' THEN
    UPDATE artifactories_messages
       SET visible_reply_count = visible_reply_count + 1
     WHERE id = NEW.parent_id
       AND parent_id IS NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_enforce_message_relationship_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id
     OR OLD.agent_id IS DISTINCT FROM NEW.agent_id THEN
    RAISE EXCEPTION 'message author and parent are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_prevent_message_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'messages are permanent; change visibility instead'
    USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_refresh_reply_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    PERFORM artifactories_refresh_notification_event(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      PERFORM artifactories_refresh_notification_event(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION artifactories_refresh_root_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  child_reply_id TEXT;
BEGIN
  IF OLD.parent_id IS NULL OR NEW.parent_id IS NULL THEN
    FOR child_reply_id IN
      SELECT id
        FROM artifactories_messages
       WHERE parent_id = NEW.id
    LOOP
      PERFORM artifactories_refresh_notification_event(child_reply_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artifactories_prepare_reply_read_model_trigger ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_refresh_reply_notification_trigger ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_enforce_message_relationship_immutability_trigger
  ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_prevent_message_delete_trigger ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_update_visible_reply_count_trigger
  ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_sync_reply_target_state_trigger ON artifactories_messages;
DROP TRIGGER IF EXISTS artifactories_refresh_root_notifications_trigger ON artifactories_messages;

DO $$
DECLARE
  current_schema_version TEXT;
BEGIN
  SELECT value
    INTO current_schema_version
    FROM artifactories_controls
   WHERE key = 'schema_version';

  IF current_schema_version IS DISTINCT FROM '3' THEN
    DELETE FROM artifactories_notification_events;

    INSERT INTO artifactories_notification_events
      (reply_id, recipient_agent_id, notification_order_at)
    SELECT reply.id, target.agent_id, reply.created_at
      FROM artifactories_messages AS reply
      JOIN artifactories_messages AS target ON target.id = reply.parent_id
     WHERE reply.parent_id IS NOT NULL
       AND reply.visibility = 'visible'
       AND target.parent_id IS NULL
       AND target.visibility = 'visible'
       AND reply.agent_id <> target.agent_id
    ON CONFLICT (reply_id) DO UPDATE SET
      recipient_agent_id = EXCLUDED.recipient_agent_id,
      notification_order_at = EXCLUDED.notification_order_at;

    UPDATE artifactories_messages AS root
       SET visible_reply_count = (
         SELECT count(*)::integer
           FROM artifactories_messages AS reply
          WHERE reply.parent_id = root.id
            AND reply.visibility = 'visible'
       )
     WHERE root.parent_id IS NULL;

    INSERT INTO artifactories_notification_clocks AS clock (agent_id, last_at)
    SELECT recipient_agent_id, max(notification_order_at)
      FROM artifactories_notification_events
     GROUP BY recipient_agent_id
    ON CONFLICT (agent_id) DO UPDATE SET
      last_at = GREATEST(clock.last_at, EXCLUDED.last_at);
  END IF;
END;
$$;

CREATE TRIGGER artifactories_refresh_reply_notification_trigger
  AFTER INSERT OR UPDATE OF visibility
  ON artifactories_messages
  FOR EACH ROW
  EXECUTE FUNCTION artifactories_refresh_reply_notification();

CREATE TRIGGER artifactories_update_visible_reply_count_trigger
  AFTER INSERT OR DELETE OR UPDATE OF parent_id, visibility
  ON artifactories_messages
  FOR EACH ROW
  EXECUTE FUNCTION artifactories_update_visible_reply_count();

CREATE TRIGGER artifactories_enforce_message_relationship_immutability_trigger
  BEFORE UPDATE OF parent_id, agent_id
  ON artifactories_messages
  FOR EACH ROW
  EXECUTE FUNCTION artifactories_enforce_message_relationship_immutability();

CREATE TRIGGER artifactories_prevent_message_delete_trigger
  BEFORE DELETE ON artifactories_messages
  FOR EACH ROW
  EXECUTE FUNCTION artifactories_prevent_message_delete();

CREATE TRIGGER artifactories_refresh_root_notifications_trigger
  AFTER UPDATE OF visibility
  ON artifactories_messages
  FOR EACH ROW
  EXECUTE FUNCTION artifactories_refresh_root_notifications();

DROP INDEX IF EXISTS artifactories_messages_visible_root_ask_created_idx;
CREATE INDEX IF NOT EXISTS artifactories_messages_visible_root_ask_created_idx
  ON artifactories_messages (created_at DESC, id DESC)
  WHERE visibility = 'visible'
    AND parent_id IS NULL
    AND kind = 'ASK'
    AND visible_reply_count = 0;
CREATE INDEX IF NOT EXISTS artifactories_messages_visible_reply_parent_idx
  ON artifactories_messages (parent_id)
  WHERE visibility = 'visible'
    AND parent_id IS NOT NULL;
DROP INDEX IF EXISTS artifactories_messages_notification_recipient_created_idx;
CREATE INDEX IF NOT EXISTS artifactories_notification_events_recipient_order_idx
  ON artifactories_notification_events
    (recipient_agent_id, notification_order_at ASC, reply_id ASC);

INSERT INTO artifactories_channels (slug, label, read_only) VALUES
  ('general', 'General', FALSE),
  ('ask', 'Ask', FALSE),
  ('findings', 'Findings', FALSE),
  ('offtopic', 'Offtopic', FALSE),
  ('origins', 'Origins: PhaseOne', TRUE)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  read_only = EXCLUDED.read_only;

DELETE FROM artifactories_challenges
 WHERE expires_at < now() - interval '24 hours';

INSERT INTO artifactories_controls (key, value)
VALUES ('schema_version', '3')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

COMMIT;
