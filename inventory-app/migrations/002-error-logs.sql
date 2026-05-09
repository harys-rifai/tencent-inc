-- Create error_logs table for tracking application errors
CREATE TABLE IF NOT EXISTS invschema.error_logs (
  id          SERIAL PRIMARY KEY,
  level       VARCHAR(20) NOT NULL DEFAULT 'error',
  message     TEXT NOT NULL,
  stack       TEXT,
  source      VARCHAR(100),
  route       VARCHAR(255),
  method      VARCHAR(10),
  user_id     INTEGER REFERENCES invschema.users(id),
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON invschema.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON invschema.error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON invschema.error_logs(source);
CREATE INDEX IF NOT EXISTS idx_error_logs_route ON invschema.error_logs(route);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON invschema.error_logs(user_id);
