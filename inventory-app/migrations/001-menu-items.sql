-- Drop existing table to ensure clean migration (safe in fresh DB)
DROP TABLE IF EXISTS invschema.menu_items CASCADE;

CREATE TABLE invschema.menu_items (
  id          SERIAL PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,
  icon        VARCHAR(50),
  href        VARCHAR(255) NOT NULL UNIQUE,
  order_index INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT TRUE,
  parent_id   INTEGER REFERENCES invschema.menu_items(id),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default menu items based on existing pages
INSERT INTO invschema.menu_items (label, icon, href, order_index) VALUES
  ('Home', 'home', '/', 1),
  ('Inventory', 'inventory', '/inventory', 2),
  ('Network', 'network', '/network', 3),
  ('Search', 'search', '/search', 4),
  ('Tasks', 'tasks', '/tasks', 5),
  ('Settings', 'settings', '/settings', 6)
ON CONFLICT (href) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_menu_items_order ON invschema.menu_items(order_index);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON invschema.menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON invschema.menu_items(active);
