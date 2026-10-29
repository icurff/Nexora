-- Baseline of the original Auth migration, preserving its PostgreSQL constraints.
BEGIN;

CREATE TABLE auth_schema_migrations (
  id integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  full_name varchar(100) NOT NULL,
  phone varchar(16),
  role varchar(16) NOT NULL DEFAULT 'CUSTOMER',
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  locked_at timestamptz,
  lock_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_email_normalized_check CHECK (
    email = lower(btrim(email)) AND email <> ''
  ),
  CONSTRAINT users_full_name_check CHECK (
    full_name = btrim(full_name) AND char_length(full_name) BETWEEN 1 AND 100
  ),
  CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'ADMIN')),
  CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'LOCKED')),
  CONSTRAINT users_lock_state_check CHECK (
    (status = 'ACTIVE' AND locked_at IS NULL AND lock_reason IS NULL) OR
    (status = 'LOCKED' AND locked_at IS NOT NULL AND lock_reason IS NOT NULL AND btrim(lock_reason) <> '')
  ),
  CONSTRAINT users_phone_check CHECK (
    phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'
  )
);

CREATE TABLE auth_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  refresh_token_hash char(64) NOT NULL UNIQUE,
  refresh_version integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason varchar(50),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_sessions_hash_check CHECK (
    refresh_token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT auth_sessions_version_check CHECK (refresh_version >= 0),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT auth_sessions_revoke_reason_check CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'TOKEN_REUSE'
    )
  ),
  CONSTRAINT auth_sessions_revocation_pair_check CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL) OR
    (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE INDEX auth_sessions_user_revoked_idx ON auth_sessions (user_id, revoked_at);

INSERT INTO auth_schema_migrations (id) VALUES (1);

COMMIT;
