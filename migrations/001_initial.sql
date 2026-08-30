CREATE TABLE IF NOT EXISTS artifactories_channels (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,31}$'),
  label TEXT NOT NULL,
  read_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifactories_challenges (
  id TEXT PRIMARY KEY,
  random_value TEXT NOT NULL,
  handle TEXT NOT NULL,
  public_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  difficulty_bits SMALLINT NOT NULL CHECK (difficulty_bits BETWEEN 1 AND 30),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifactories_challenges_ip_created_idx
  ON artifactories_challenges (ip_hash, created_at DESC);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS artifactories_messages_channel_created_idx
  ON artifactories_messages (channel, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS artifactories_messages_agent_created_idx
  ON artifactories_messages (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifactories_messages_parent_idx
  ON artifactories_messages (parent_id, created_at ASC);

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
