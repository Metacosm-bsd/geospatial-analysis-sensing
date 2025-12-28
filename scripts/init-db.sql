-- LiDAR Forest Analysis Platform - Database Initialization Script
-- This script runs on PostgreSQL/PostGIS container startup

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";
CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS lidar;
CREATE SCHEMA IF NOT EXISTS auth;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA lidar TO lidar;
GRANT ALL PRIVILEGES ON SCHEMA auth TO lidar;

-- ====================
-- Auth Schema Tables
-- ====================

-- Users table
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'viewer')),
    organization VARCHAR(255),
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    device_info JSONB
);

-- ====================
-- LiDAR Schema Tables
-- ====================

-- Projects table
CREATE TABLE IF NOT EXISTS lidar.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    bounds GEOMETRY(POLYGON, 4326),
    metadata JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Files table
CREATE TABLE IF NOT EXISTS lidar.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES lidar.projects(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('las', 'laz', 'geotiff', 'shapefile', 'geojson', 'other')),
    file_size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    s3_key VARCHAR(1000),
    upload_status VARCHAR(50) DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'completed', 'failed')),
    bounds GEOMETRY(POLYGON, 4326),
    point_count BIGINT,
    crs VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    checksum VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID REFERENCES auth.users(id)
);

-- Analyses table
CREATE TABLE IF NOT EXISTS lidar.analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES lidar.projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    analysis_type VARCHAR(100) NOT NULL CHECK (analysis_type IN (
        'tree_detection',
        'species_classification',
        'biomass_estimation',
        'carbon_calculation',
        'canopy_height_model',
        'ground_classification',
        'inventory_report',
        'change_detection',
        'custom'
    )),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'queued',
        'processing',
        'completed',
        'failed',
        'cancelled'
    )),
    parameters JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    error_message TEXT,
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id),
    job_id VARCHAR(255)
);

-- Detected trees table
CREATE TABLE IF NOT EXISTS lidar.trees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES lidar.analyses(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES lidar.projects(id) ON DELETE CASCADE,
    location GEOMETRY(POINT, 4326) NOT NULL,
    height NUMERIC(8, 3) NOT NULL,
    dbh NUMERIC(8, 3),
    crown_diameter NUMERIC(8, 3),
    crown_area NUMERIC(12, 3),
    species VARCHAR(100),
    species_confidence NUMERIC(4, 3),
    biomass_kg NUMERIC(12, 3),
    carbon_kg NUMERIC(12, 3),
    confidence NUMERIC(4, 3) DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stand summaries table
CREATE TABLE IF NOT EXISTS lidar.stand_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES lidar.analyses(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES lidar.projects(id) ON DELETE CASCADE,
    stand_id VARCHAR(100),
    boundary GEOMETRY(POLYGON, 4326),
    area_hectares NUMERIC(12, 4),
    tree_count INTEGER,
    trees_per_hectare NUMERIC(10, 2),
    mean_height NUMERIC(8, 3),
    dominant_height NUMERIC(8, 3),
    mean_dbh NUMERIC(8, 3),
    basal_area_per_hectare NUMERIC(10, 4),
    volume_per_hectare NUMERIC(12, 4),
    biomass_per_hectare NUMERIC(12, 4),
    carbon_per_hectare NUMERIC(12, 4),
    dominant_species VARCHAR(100),
    species_distribution JSONB DEFAULT '{}',
    dbh_distribution JSONB DEFAULT '{}',
    height_distribution JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reports table
CREATE TABLE IF NOT EXISTS lidar.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES lidar.projects(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES lidar.analyses(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL CHECK (report_type IN (
        'inventory',
        'carbon_credit',
        'change_detection',
        'timber_cruise',
        'custom'
    )),
    format VARCHAR(50) DEFAULT 'pdf' CHECK (format IN ('pdf', 'excel', 'csv', 'geojson', 'shapefile')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    storage_path TEXT,
    s3_key VARCHAR(1000),
    parameters JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- ====================
-- Indexes
-- ====================

-- Auth indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON auth.refresh_tokens(expires_at);

-- Project indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner ON lidar.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON lidar.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_bounds ON lidar.projects USING GIST(bounds);

-- File indexes
CREATE INDEX IF NOT EXISTS idx_files_project ON lidar.files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON lidar.files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_status ON lidar.files(upload_status);
CREATE INDEX IF NOT EXISTS idx_files_bounds ON lidar.files USING GIST(bounds);

-- Analysis indexes
CREATE INDEX IF NOT EXISTS idx_analyses_project ON lidar.analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_analyses_type ON lidar.analyses(analysis_type);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON lidar.analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_job ON lidar.analyses(job_id);

-- Tree indexes
CREATE INDEX IF NOT EXISTS idx_trees_analysis ON lidar.trees(analysis_id);
CREATE INDEX IF NOT EXISTS idx_trees_project ON lidar.trees(project_id);
CREATE INDEX IF NOT EXISTS idx_trees_location ON lidar.trees USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_trees_species ON lidar.trees(species);
CREATE INDEX IF NOT EXISTS idx_trees_height ON lidar.trees(height);

-- Stand summary indexes
CREATE INDEX IF NOT EXISTS idx_stands_analysis ON lidar.stand_summaries(analysis_id);
CREATE INDEX IF NOT EXISTS idx_stands_project ON lidar.stand_summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_stands_boundary ON lidar.stand_summaries USING GIST(boundary);

-- Report indexes
CREATE INDEX IF NOT EXISTS idx_reports_project ON lidar.reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_analysis ON lidar.reports(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON lidar.reports(report_type);

-- ====================
-- Functions
-- ====================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON auth.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON lidar.projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON lidar.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate tree biomass using FIA equations
CREATE OR REPLACE FUNCTION lidar.calculate_tree_biomass(
    p_height NUMERIC,
    p_dbh NUMERIC,
    p_species VARCHAR DEFAULT 'unknown'
)
RETURNS NUMERIC AS $$
DECLARE
    v_biomass NUMERIC;
    v_b0 NUMERIC;
    v_b1 NUMERIC;
    v_b2 NUMERIC;
BEGIN
    -- Default softwood coefficients (Jenkins et al. 2003)
    v_b0 := -2.0773;
    v_b1 := 2.3323;
    v_b2 := 0;

    -- Species-specific coefficients
    CASE p_species
        WHEN 'douglas_fir' THEN
            v_b0 := -2.4623; v_b1 := 2.4349;
        WHEN 'ponderosa_pine' THEN
            v_b0 := -2.6177; v_b1 := 2.4638;
        WHEN 'western_red_cedar' THEN
            v_b0 := -2.0773; v_b1 := 2.3323;
        WHEN 'red_alder' THEN
            v_b0 := -2.0773; v_b1 := 2.3323;
        ELSE
            -- Use default softwood coefficients
            NULL;
    END CASE;

    -- Calculate aboveground biomass (kg)
    IF p_dbh IS NOT NULL AND p_dbh > 0 THEN
        v_biomass := EXP(v_b0 + v_b1 * LN(p_dbh));
    ELSIF p_height IS NOT NULL AND p_height > 0 THEN
        -- Estimate DBH from height if not available
        v_biomass := 0.5 * p_height * p_height;  -- Simplified fallback
    ELSE
        v_biomass := 0;
    END IF;

    RETURN ROUND(v_biomass, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate carbon from biomass
CREATE OR REPLACE FUNCTION lidar.calculate_carbon(p_biomass_kg NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    -- Carbon is approximately 47% of dry biomass
    RETURN ROUND(p_biomass_kg * 0.47, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ====================
-- Initial Data
-- ====================

-- Create default admin user (password: 'admin123!' - change immediately!)
-- Password hash is bcrypt hash of 'admin123!'
INSERT INTO auth.users (email, password_hash, name, role, email_verified)
VALUES (
    'admin@lidar-forest.local',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.FWo1i8YE8KiPKy',
    'System Administrator',
    'admin',
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'LiDAR Forest Analysis Platform database initialized successfully';
    RAISE NOTICE 'PostGIS version: %', PostGIS_Version();
END $$;
