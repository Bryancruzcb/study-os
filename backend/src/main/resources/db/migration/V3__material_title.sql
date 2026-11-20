-- The lecture's subject in a few words, as extraction names it ("Albedo and blackbody radiation").
-- Lectures ingested before this have none, and the app names them from their filename instead.
ALTER TABLE material ADD COLUMN IF NOT EXISTS title VARCHAR(200);
