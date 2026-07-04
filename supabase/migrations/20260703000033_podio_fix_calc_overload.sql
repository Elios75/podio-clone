-- Podio Clone: Migration 33 - Fix: drop the orphaned compute_calculations(uuid) overload.
-- Migration 26 changed the signature to (uuid, int default 0); CREATE OR REPLACE
-- created an overload instead of replacing, making the trigger's call ambiguous
-- and breaking every item_field_values insert.
drop function if exists podio.compute_calculations(uuid);
