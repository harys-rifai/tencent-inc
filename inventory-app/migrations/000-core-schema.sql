-- Core schema: inventory, users, tasks tables (idempotent)

CREATE TABLE IF NOT EXISTS invschema.inventory (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(100),
  appreff     VARCHAR(100),
  ip          INET,
  port        INTEGER,
  version     VARCHAR(50),
  active      BOOLEAN DEFAULT TRUE,
  stage       VARCHAR(20) DEFAULT 'dev' CHECK (stage IN ('prod', 'uat', 'dev', 'other')),
  note        TEXT,
  user_name   VARCHAR(100),
  password    VARCHAR(100),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invschema.users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(100) UNIQUE,
  password   VARCHAR(100),
  role       VARCHAR(20) DEFAULT 'user',
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invschema.tasks (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  status      VARCHAR(20)  DEFAULT 'todo',
  priority    VARCHAR(20)  DEFAULT 'medium',
  due_date    DATE,
  assigned_to VARCHAR(100),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes — inventory
CREATE INDEX IF NOT EXISTS idx_inv_ip      ON invschema.inventory(ip);
CREATE INDEX IF NOT EXISTS idx_inv_type    ON invschema.inventory(type);
CREATE INDEX IF NOT EXISTS idx_inv_active  ON invschema.inventory(active);
CREATE INDEX IF NOT EXISTS idx_inv_appreff ON invschema.inventory(appreff);
CREATE INDEX IF NOT EXISTS idx_inv_created ON invschema.inventory(created_at DESC);

-- Indexes — tasks
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON invschema.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON invschema.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON invschema.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created  ON invschema.tasks(created_at DESC);

-- Indexes — users
CREATE INDEX IF NOT EXISTS idx_users_username ON invschema.users(username);
