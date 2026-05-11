-- Phase 34: Machine Detail Intelligence Schema
-- Author: Antigravity

-- 1. Machine Telemetry (Live Ops)
CREATE TABLE IF NOT EXISTS machine_telemetry (
    machine_id VARCHAR(64) PRIMARY KEY,
    jobs_running INT DEFAULT 0,
    jobs_queued INT DEFAULT 0,
    jobs_failed_24h INT DEFAULT 0,
    throughput_h DECIMAL(10,2) DEFAULT 0.00,
    utilization_pct DECIMAL(5,2) DEFAULT 0.00,
    avg_turnaround_mins INT DEFAULT 0,
    avg_lead_time_mins INT DEFAULT 0,
    avg_dispatch_latency_ms INT DEFAULT 0,
    estimated_saturation_pct DECIMAL(5,2) DEFAULT 0.00,
    current_load_pct DECIMAL(5,2) DEFAULT 0.00,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_utilization (utilization_pct)
) ENGINE=InnoDB;

-- 2. Machine Capabilities (Industrial Spec)
CREATE TABLE IF NOT EXISTS machine_capabilities (
    machine_id VARCHAR(64) PRIMARY KEY,
    paper_types JSON NULL,
    gsm_ranges JSON NULL,
    trim_formats JSON NULL,
    max_sheet_size VARCHAR(64) NULL,
    bindings JSON NULL,
    uv_support BOOLEAN DEFAULT FALSE,
    varnish_support BOOLEAN DEFAULT FALSE,
    foil_support BOOLEAN DEFAULT FALSE,
    hardcover_support BOOLEAN DEFAULT FALSE,
    sewn_binding_support BOOLEAN DEFAULT FALSE,
    coating_support BOOLEAN DEFAULT FALSE,
    lamination_support BOOLEAN DEFAULT FALSE,
    normalized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Machine Incidents (Forensic Log)
CREATE TABLE IF NOT EXISTS machine_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(64) NOT NULL,
    type ENUM('DEGRADATION', 'FAILURE', 'OFFLINE', 'MAINTENANCE', 'SPIKE', 'ROUTING_INCIDENT') NOT NULL,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
    message TEXT NOT NULL,
    details JSON NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_machine (machine_id),
    INDEX idx_type (type)
) ENGINE=InnoDB;

-- 4. Machine Throughput History (Analytics)
CREATE TABLE IF NOT EXISTS machine_throughput_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(64) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    jobs_completed INT DEFAULT 0,
    jobs_failed INT DEFAULT 0,
    avg_dispatch_ms INT DEFAULT 0,
    sla_success_ratio DECIMAL(5,2) DEFAULT 0.00,
    avg_preflight_score DECIMAL(5,2) DEFAULT 0.00,
    UNIQUE KEY unq_machine_period (machine_id, period_start),
    INDEX idx_machine_period (machine_id, period_start)
) ENGINE=InnoDB;
