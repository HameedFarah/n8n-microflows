#!/usr/bin/env node

/**
 * Enhanced Supabase Setup Script
 * Initializes database schema, creates tables, and sets up multi-tenant configuration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class SupabaseSetup {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
    }

    async setup() {
        console.log('🚀 Starting Supabase setup...');
        
        try {
            await this.createTables();
            await this.setupRLS();
            await this.createFunctions();
            await this.seedInitialData();
            await this.setupIndexes();
            
            console.log('✅ Supabase setup completed successfully!');
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async createTables() {
        console.log('📊 Creating database tables...');

        const schemas = [
            // Workflow metadata table
            `
            CREATE TABLE IF NOT EXISTS workflow_metadata (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                goal TEXT NOT NULL,
                complexity TEXT CHECK (complexity IN ('simple', 'medium', 'complex')),
                reuse_potential TEXT CHECK (reuse_potential IN ('high', 'medium', 'low')),
                tags TEXT[],
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            `,

            // Vector embeddings table for similarity search
            `
            CREATE TABLE IF NOT EXISTS workflow_embeddings (
                workflow_id TEXT REFERENCES workflow_metadata(id),
                embedding VECTOR(384),
                created_at TIMESTAMP DEFAULT NOW()
            );
            `,

            // Execution logs for debugging and monitoring
            `
            CREATE TABLE IF NOT EXISTS execution_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workflow_id TEXT REFERENCES workflow_metadata(id),
                tenant_id TEXT NOT NULL,
                status TEXT CHECK (status IN ('success', 'error', 'timeout')),
                execution_time_ms INTEGER,
                error_details JSONB,
                input_data JSONB,
                output_data JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
            `,

            // Multi-tenant configuration table
            `
            CREATE TABLE IF NOT EXISTS tenant_workflow_configs (
                tenant_id TEXT,
                workflow_id TEXT REFERENCES workflow_metadata(id),
                config JSONB NOT NULL,
                enabled BOOLEAN DEFAULT true,
                PRIMARY KEY (tenant_id, workflow_id)
            );
            `,

            // Validation results tracking
            `
            CREATE TABLE IF NOT EXISTS validation_results (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workflow_id TEXT REFERENCES workflow_metadata(id),
                validation_type TEXT NOT NULL,
                status TEXT CHECK (status IN ('passed', 'failed', 'warning')),
                details JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
            `,

            // Usage analytics
            `
            CREATE TABLE IF NOT EXISTS usage_analytics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workflow_id TEXT REFERENCES workflow_metadata(id),
                tenant_id TEXT NOT NULL,
                action TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
            `
        ];

        for (const schema of schemas) {
            const { error } = await this.supabase.rpc('exec_sql', { sql: schema });
            if (error) throw error;
        }

        console.log('✅ Tables created successfully');
    }

    async setupRLS() {
        console.log('🔒 Setting up Row Level Security...');

        const rlsPolicies = [
            // Enable RLS on all tables
            'ALTER TABLE workflow_metadata ENABLE ROW LEVEL SECURITY;',
            'ALTER TABLE workflow_embeddings ENABLE ROW LEVEL SECURITY;',
            'ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;',
            'ALTER TABLE tenant_workflow_configs ENABLE ROW LEVEL SECURITY;',
            'ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;',
            'ALTER TABLE usage_analytics ENABLE ROW LEVEL SECURITY;',

            // Create policies for tenant isolation
            `
            CREATE POLICY IF NOT EXISTS tenant_isolation_logs 
            ON execution_logs FOR ALL 
            USING (tenant_id = current_setting('app.current_tenant', true));
            `,

            `
            CREATE POLICY IF NOT EXISTS tenant_isolation_configs 
            ON tenant_workflow_configs FOR ALL 
            USING (tenant_id = current_setting('app.current_tenant', true));
            `,

            `
            CREATE POLICY IF NOT EXISTS tenant_isolation_analytics 
            ON usage_analytics FOR ALL 
            USING (tenant_id = current_setting('app.current_tenant', true));
            `,

            // Allow read access to workflow metadata for all authenticated users
            `
            CREATE POLICY IF NOT EXISTS workflow_metadata_read 
            ON workflow_metadata FOR SELECT 
            USING (true);
            `,

            // Allow read access to embeddings for similarity search
            `
            CREATE POLICY IF NOT EXISTS workflow_embeddings_read 
            ON workflow_embeddings FOR SELECT 
            USING (true);
            `
        ];

        for (const policy of rlsPolicies) {
            const { error } = await this.supabase.rpc('exec_sql', { sql: policy });
            if (error && !error.message.includes('already exists')) {
                throw error;
            }
        }

        console.log('✅ RLS policies configured');
    }

    async createFunctions() {
        console.log('⚡ Creating database functions...');

        const functions = [
            // Function to search similar workflows
            `
            CREATE OR REPLACE FUNCTION search_similar_workflows(
                query_embedding VECTOR(384),
                similarity_threshold FLOAT DEFAULT 0.8,
                match_count INT DEFAULT 10
            )
            RETURNS TABLE (
                workflow_id TEXT,
                similarity FLOAT,
                metadata JSONB
            )
            LANGUAGE SQL
            AS $$
                SELECT 
                    we.workflow_id,
                    1 - (we.embedding <=> query_embedding) AS similarity,
                    row_to_json(wm.*) AS metadata
                FROM workflow_embeddings we
                JOIN workflow_metadata wm ON we.workflow_id = wm.id
                WHERE 1 - (we.embedding <=> query_embedding) > similarity_threshold
                ORDER BY similarity DESC
                LIMIT match_count;
            $$;
            `,

            // Function to update workflow metadata timestamp
            `
            CREATE OR REPLACE FUNCTION update_workflow_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            `,

            // Function to log workflow usage
            `
            CREATE OR REPLACE FUNCTION log_workflow_usage(
                p_workflow_id TEXT,
                p_tenant_id TEXT,
                p_action TEXT,
                p_metadata JSONB DEFAULT '{}'::jsonb
            )
            RETURNS UUID
            LANGUAGE SQL
            AS $$
                INSERT INTO usage_analytics (workflow_id, tenant_id, action, metadata)
                VALUES (p_workflow_id, p_tenant_id, p_action, p_metadata)
                RETURNING id;
            $$;
            `,

            // Function to get tenant configuration
            `
            CREATE OR REPLACE FUNCTION get_tenant_config(
                p_tenant_id TEXT,
                p_workflow_id TEXT
            )
            RETURNS JSONB
            LANGUAGE SQL
            AS $$
                SELECT config
                FROM tenant_workflow_configs
                WHERE tenant_id = p_tenant_id 
                AND workflow_id = p_workflow_id 
                AND enabled = true;
            $$;
            `
        ];

        for (const func of functions) {
            const { error } = await this.supabase.rpc('exec_sql', { sql: func });
            if (error) throw error;
        }

        // Create triggers
        const triggers = [
            `
            CREATE TRIGGER IF NOT EXISTS update_workflow_metadata_timestamp
            BEFORE UPDATE ON workflow_metadata
            FOR EACH ROW EXECUTE FUNCTION update_workflow_timestamp();
            `
        ];

        for (const trigger of triggers) {
            const { error } = await this.supabase.rpc('exec_sql', { sql: trigger });
            if (error && !error.message.includes('already exists')) {
                throw error;
            }
        }

        console.log('✅ Database functions created');
    }

    async setupIndexes() {
        console.log('🔍 Creating performance indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_workflow_metadata_category ON workflow_metadata(category);',
            'CREATE INDEX IF NOT EXISTS idx_workflow_metadata_complexity ON workflow_metadata(complexity);',
            'CREATE INDEX IF NOT EXISTS idx_workflow_metadata_reuse ON workflow_metadata(reuse_potential);',
            'CREATE INDEX IF NOT EXISTS idx_workflow_metadata_tags ON workflow_metadata USING GIN(tags);',
            'CREATE INDEX IF NOT EXISTS idx_execution_logs_workflow ON execution_logs(workflow_id);',
            'CREATE INDEX IF NOT EXISTS idx_execution_logs_tenant ON execution_logs(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_execution_logs_status ON execution_logs(status);',
            'CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON execution_logs(created_at);',
            'CREATE INDEX IF NOT EXISTS idx_tenant_configs_tenant ON tenant_workflow_configs(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_tenant_configs_enabled ON tenant_workflow_configs(enabled);',
            'CREATE INDEX IF NOT EXISTS idx_validation_results_workflow ON validation_results(workflow_id);',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_workflow ON usage_analytics(workflow_id);',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_tenant ON usage_analytics(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_usage_analytics_action ON usage_analytics(action);'
        ];

        for (const index of indexes) {
            const { error } = await this.supabase.rpc('exec_sql', { sql: index });
            if (error && !error.message.includes('already exists')) {
                throw error;
            }
        }

        console.log('✅ Indexes created');
    }

    async seedInitialData() {
        console.log('🌱 Seeding initial data...');

        // Check if we already have data
        const { data: existingData } = await this.supabase
            .from('workflow_metadata')
            .select('id')
            .limit(1);

        if (existingData && existingData.length > 0) {
            console.log('📋 Data already exists, skipping seed');
            return;
        }

        // Sample workflow metadata
        const sampleWorkflows = [
            {
                id: 'slack-notification-basic',
                category: 'communication',
                goal: 'Send notification to Slack channel',
                complexity: 'simple',
                reuse_potential: 'high',
                tags: ['slack', 'notification', 'communication']
            },
            {
                id: 'google-sheets-data-sync',
                category: 'data',
                goal: 'Synchronize data with Google Sheets',
                complexity: 'medium',
                reuse_potential: 'high',
                tags: ['google-sheets', 'data-sync', 'automation']
            },
            {
                id: 'email-marketing-campaign',
                category: 'communication',
                goal: 'Automated email marketing workflow',
                complexity: 'complex',
                reuse_potential: 'medium',
                tags: ['email', 'marketing', 'automation', 'campaign']
            }
        ];

        const { error } = await this.supabase
            .from('workflow_metadata')
            .insert(sampleWorkflows);

        if (error) throw error;

        console.log('✅ Initial data seeded');
    }

    async verifySetup() {
        console.log('🔍 Verifying setup...');

        try {
            // Test table access
            const { data: workflows } = await this.supabase
                .from('workflow_metadata')
                .select('*')
                .limit(1);

            // Test function access
            const { data: functions } = await this.supabase
                .rpc('log_workflow_usage', {
                    p_workflow_id: 'test',
                    p_tenant_id: 'test-tenant',
                    p_action: 'setup-verification'
                });

            console.log('✅ Setup verification passed');
            return true;
        } catch (error) {
            console.error('❌ Setup verification failed:', error.message);
            return false;
        }
    }
}

// Main execution
async function main() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('❌ Missing required environment variables:');
        console.error('   - SUPABASE_URL');
        console.error('   - SUPABASE_SERVICE_KEY');
        process.exit(1);
    }

    const setup = new SupabaseSetup();
    await setup.setup();
    await setup.verifySetup();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SupabaseSetup;
