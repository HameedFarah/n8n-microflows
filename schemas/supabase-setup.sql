-- Supabase Multi-Tenant Database Schema for N8N Microflows
-- Run this in your Supabase SQL editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
CREATE TYPE workflow_complexity AS ENUM ('simple', 'medium', 'complex');
CREATE TYPE workflow_category AS ENUM ('content', 'validation', 'communication', 'data', 'seo', 'social', 'utilities');
CREATE TYPE execution_status AS ENUM ('success', 'error', 'timeout', 'cancelled');

-- Tenants table (multi-tenant foundation)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    subscription_tier TEXT DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Workflow metadata and definitions
CREATE TABLE workflow_metadata (
    id TEXT PRIMARY KEY, -- workflow ID following naming convention
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    category workflow_category NOT NULL,
    complexity workflow_complexity NOT NULL,
    execution_time TEXT NOT NULL,
    reuse_potential TEXT CHECK (reuse_potential IN ('high', 'medium', 'low')),
    tenant_aware BOOLEAN DEFAULT false,
    dependencies TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    version TEXT NOT NULL DEFAULT '1.0.0',
    author TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    
    -- Performance tracking
    avg_execution_time_ms INTEGER,
    success_rate DECIMAL(5,2) DEFAULT 100.0,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    
    -- Indexing for search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', goal || ' ' || array_to_string(tags, ' '))
    ) STORED
);

-- Vector embeddings for similarity search
CREATE TABLE workflow_embeddings (
    workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    embedding VECTOR(1536), -- OpenAI embedding dimension
    embedding_text TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}',
    semantic_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (workflow_id, tenant_id)
);

-- Execution logs for monitoring and debugging
CREATE TABLE execution_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    execution_id TEXT NOT NULL, -- N8N execution ID
    status execution_status NOT NULL,
    execution_time_ms INTEGER,
    input_data JSONB,
    output_data JSONB,
    error_details JSONB,
    node_executions JSONB, -- Per-node execution details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dynamic configuration per tenant
CREATE TABLE tenant_workflow_configs (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    priority INTEGER DEFAULT 5, -- 1-10 scale
    custom_parameters JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, workflow_id)
);

-- Workflow dependencies and relationships
CREATE TABLE workflow_dependencies (
    workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    depends_on_workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL, -- 'input', 'output', 'trigger', 'fallback'
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (workflow_id, depends_on_workflow_id, dependency_type)
);

-- Performance metrics aggregation
CREATE TABLE workflow_metrics (
    workflow_id TEXT REFERENCES workflow_metadata(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    avg_execution_time_ms DECIMAL(10,2),
    total_execution_time_ms BIGINT DEFAULT 0,
    p95_execution_time_ms INTEGER,
    p99_execution_time_ms INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (workflow_id, tenant_id, date)
);

-- Indexes for performance
CREATE INDEX idx_workflow_metadata_tenant_id ON workflow_metadata(tenant_id);
CREATE INDEX idx_workflow_metadata_category ON workflow_metadata(category);
CREATE INDEX idx_workflow_metadata_search ON workflow_metadata USING GIN(search_vector);
CREATE INDEX idx_workflow_metadata_tags ON workflow_metadata USING GIN(tags);

CREATE INDEX idx_workflow_embeddings_tenant ON workflow_embeddings(tenant_id);
CREATE INDEX idx_workflow_embeddings_vector ON workflow_embeddings USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX idx_execution_logs_tenant_workflow ON execution_logs(tenant_id, workflow_id);
CREATE INDEX idx_execution_logs_status ON execution_logs(status);
CREATE INDEX idx_execution_logs_created_at ON execution_logs(created_at);

CREATE INDEX idx_tenant_configs_tenant ON tenant_workflow_configs(tenant_id);
CREATE INDEX idx_tenant_configs_enabled ON tenant_workflow_configs(enabled);

-- Row Level Security (RLS) Policies
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_workflow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = id::text);

CREATE POLICY tenant_isolation_workflows ON workflow_metadata
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

CREATE POLICY tenant_isolation_embeddings ON workflow_embeddings
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

CREATE POLICY tenant_isolation_logs ON execution_logs
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

CREATE POLICY tenant_isolation_configs ON tenant_workflow_configs
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

CREATE POLICY tenant_isolation_metrics ON workflow_metrics
    FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Functions for workflow management
CREATE OR REPLACE FUNCTION update_workflow_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update workflow metadata with latest execution stats
    UPDATE workflow_metadata SET
        last_executed_at = NEW.created_at,
        execution_count = execution_count + 1,
        avg_execution_time_ms = (
            SELECT AVG(execution_time_ms)::INTEGER 
            FROM execution_logs 
            WHERE workflow_id = NEW.workflow_id 
            AND tenant_id = NEW.tenant_id
            AND created_at >= NOW() - INTERVAL '30 days'
        ),
        success_rate = (
            SELECT (COUNT(*) FILTER (WHERE status = 'success')::DECIMAL / COUNT(*) * 100)::DECIMAL(5,2)
            FROM execution_logs 
            WHERE workflow_id = NEW.workflow_id 
            AND tenant_id = NEW.tenant_id
            AND created_at >= NOW() - INTERVAL '30 days'
        )
    WHERE id = NEW.workflow_id AND tenant_id = NEW.tenant_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflow_stats_trigger
    AFTER INSERT ON execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_stats();

-- Function to find similar workflows using vector search
CREATE OR REPLACE FUNCTION find_similar_workflows(
    query_embedding VECTOR(1536),
    similarity_threshold DECIMAL DEFAULT 0.8,
    result_limit INTEGER DEFAULT 10,
    target_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
    workflow_id TEXT,
    tenant_id UUID,
    similarity DECIMAL,
    goal TEXT,
    category workflow_category,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        we.workflow_id,
        we.tenant_id,
        (1 - (we.embedding <=> query_embedding))::DECIMAL(5,4) as similarity,
        wm.goal,
        wm.category,
        wm.tags
    FROM workflow_embeddings we
    JOIN workflow_metadata wm ON we.workflow_id = wm.id AND we.tenant_id = wm.tenant_id
    WHERE 
        (target_tenant_id IS NULL OR we.tenant_id = target_tenant_id)
        AND wm.is_active = true
        AND (1 - (we.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get workflow recommendations
CREATE OR REPLACE FUNCTION get_workflow_recommendations(
    current_workflow_id TEXT,
    target_tenant_id UUID
)
RETURNS TABLE (
    recommended_workflow_id TEXT,
    reason TEXT,
    compatibility_score DECIMAL
) AS $$
BEGIN
    -- Find workflows commonly used together
    RETURN QUERY
    WITH workflow_pairs AS (
        SELECT 
            el1.workflow_id as workflow1,
            el2.workflow_id as workflow2,
            COUNT(*) as co_occurrence
        FROM execution_logs el1
        JOIN execution_logs el2 ON el1.tenant_id = el2.tenant_id 
            AND el1.created_at::date = el2.created_at::date
            AND el1.workflow_id != el2.workflow_id
        WHERE el1.tenant_id = target_tenant_id
            AND el1.created_at >= NOW() - INTERVAL '30 days'
            AND el1.workflow_id = current_workflow_id
        GROUP BY el1.workflow_id, el2.workflow_id
        HAVING COUNT(*) >= 2
    )
    SELECT 
        wp.workflow2 as recommended_workflow_id,
        'Frequently used together' as reason,
        (wp.co_occurrence::DECIMAL / 10)::DECIMAL(5,2) as compatibility_score
    FROM workflow_pairs wp
    JOIN workflow_metadata wm ON wp.workflow2 = wm.id AND wm.tenant_id = target_tenant_id
    WHERE wm.is_active = true
    ORDER BY compatibility_score DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_metadata_updated_at BEFORE UPDATE ON workflow_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_configs_updated_at BEFORE UPDATE ON tenant_workflow_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample tenant for testing
INSERT INTO tenants (name, slug) VALUES ('Default Tenant', 'default');

-- Create views for easier querying
CREATE VIEW workflow_performance_summary AS
SELECT 
    wm.id,
    wm.tenant_id,
    wm.goal,
    wm.category,
    wm.complexity,
    wm.execution_count,
    wm.success_rate,
    wm.avg_execution_time_ms,
    wm.last_executed_at,
    CASE 
        WHEN wm.success_rate >= 95 AND wm.avg_execution_time_ms <= 5000 THEN 'excellent'
        WHEN wm.success_rate >= 90 AND wm.avg_execution_time_ms <= 10000 THEN 'good'
        WHEN wm.success_rate >= 80 THEN 'acceptable'
        ELSE 'needs_attention'
    END as performance_grade
FROM workflow_metadata wm
WHERE wm.is_active = true;