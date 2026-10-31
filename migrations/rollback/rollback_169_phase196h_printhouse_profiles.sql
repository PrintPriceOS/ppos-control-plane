-- migrations/rollback/rollback_169_phase196h_printhouse_profiles.sql
-- PrintPrice OS — Rollback for Phase 196H: Printhouse Operational & Commercial Profiles
--
-- Safe rollback script: drops printhouse_profiles table safely.

DROP TABLE IF EXISTS printhouse_profiles;
