-- Add active column to users table (was missing from original schema)
ALTER TABLE invschema.users
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;