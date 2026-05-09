-- Add stage and note columns to inventory table
ALTER TABLE invschema.inventory
  ADD COLUMN IF NOT EXISTS stage VARCHAR(20) DEFAULT 'dev' CHECK (stage IN ('prod', 'uat', 'dev', 'other')),
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Update existing rows to have default stage value
UPDATE invschema.inventory SET stage = 'dev' WHERE stage IS NULL;

-- Add index on stage for filtering
CREATE INDEX IF NOT EXISTS idx_inv_stage ON invschema.inventory(stage);
