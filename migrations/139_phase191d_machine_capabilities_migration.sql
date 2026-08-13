-- migrations/139_phase191d_machine_capabilities_migration.sql
-- Drop the legacy foreign keys to printhouses
ALTER TABLE printhouse_machines DROP FOREIGN KEY printhouse_machines_ibfk_1;
ALTER TABLE printhouse_media DROP FOREIGN KEY printhouse_media_ibfk_1;
ALTER TABLE printhouse_policy_profiles DROP FOREIGN KEY printhouse_policy_profiles_ibfk_1;
ALTER TABLE printhouse_sla_profiles DROP FOREIGN KEY printhouse_sla_profiles_ibfk_1;

-- Add a unique constraint to printer_nodes on (id, tenant_id) to allow composite foreign keys
ALTER TABLE printer_nodes ADD UNIQUE INDEX uk_printer_nodes_id_tenant (id, tenant_id);

-- Add composite foreign keys to ensure tenant isolation (machine and node must belong to same tenant)
ALTER TABLE printhouse_machines
  ADD CONSTRAINT fk_machines_printer_node
  FOREIGN KEY (printhouse_id, tenant_id)
  REFERENCES printer_nodes (id, tenant_id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE printhouse_media
  ADD CONSTRAINT fk_media_printer_node
  FOREIGN KEY (printhouse_id, tenant_id)
  REFERENCES printer_nodes (id, tenant_id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE printhouse_policy_profiles
  ADD CONSTRAINT fk_policies_printer_node
  FOREIGN KEY (printhouse_id, tenant_id)
  REFERENCES printer_nodes (id, tenant_id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE printhouse_sla_profiles
  ADD CONSTRAINT fk_sla_printer_node
  FOREIGN KEY (printhouse_id, tenant_id)
  REFERENCES printer_nodes (id, tenant_id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
