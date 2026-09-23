-- An archived course drops off the home grid but keeps everything in it until it is restored or deleted.
ALTER TABLE course ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
