// scripts/supabase-integration.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class SupabaseWorkflowManager {
    constructor() {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
        }
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.tenantId = null;
    }

    // Initialize with tenant context
    async setTenant(tenantSlug) {
        const { data, error } = await this.supabase
            .from('tenants')
            .select('id')
            .eq('slug', tenantSlug)
            .single();

        if (error) {
            throw new Error(`Tenant not found: ${tenantSlug}`);
        }

        this.tenantId = data.id;
        return data.id;
    }

    // Register a new workflow
    async registerWorkflow(workflowData) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set. Call setTenant() first.');
        }

        const metadata = {
            id: workflowData.workflow_meta.id,
            tenant_id: this.tenantId,
            goal: workflowData.workflow_meta.goal,
            category: workflowData.workflow_meta.category,
            complexity: workflowData.workflow_meta.complexity,
            execution_time: workflowData.workflow_meta.execution_time,
            reuse_potential: workflowData.workflow_meta.reuse_potential,
            tenant_aware: workflowData.workflow_meta.tenant_aware === 'yes',
            dependencies: workflowData.workflow_meta.dependencies,
            tags: workflowData.workflow_meta.tags,
            version: workflowData.workflow_meta.version,
            author: workflowData.workflow_meta.author
        };

        // Insert workflow metadata
        const { data: workflowResult, error: workflowError } = await this.supabase
            .from('workflow_metadata')
            .upsert(metadata)
            .select();

        if (workflowError) {
            throw new Error(`Failed to register workflow: ${workflowError.message}`);
        }

        // Set up tenant-specific configuration
        const config = {
            tenant_id: this.tenantId,
            workflow_id: workflowData.workflow_meta.id,
            config: {
                implementation: workflowData.implementation,
                supabase_config: workflowData.supabase_config,
                inputs: workflowData.inputs,
                outputs: workflowData.outputs
            },
            enabled: true
        };

        const { error: configError } = await this.supabase
            .from('tenant_workflow_configs')
            .upsert(config);

        if (configError) {
            throw new Error(`Failed to set workflow config: ${configError.message}`);
        }

        console.log(`✅ Workflow ${workflowData.workflow_meta.id} registered successfully`);
        return workflowResult[0];
    }

    // Generate and store vector embeddings
    async generateEmbedding(workflowId, embeddingText, keywords = [], semanticTags = []) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        // Generate embedding using OpenAI (you'll need to implement this)
        const embedding = await this.generateTextEmbedding(embeddingText);

        const embeddingData = {
            workflow_id: workflowId,
            tenant_id: this.tenantId,
            embedding: `[${embedding.join(',')}]`, // PostgreSQL vector format
            embedding_text: embeddingText,
            keywords: keywords,
            semantic_tags: semanticTags
        };

        const { error } = await this.supabase
            .from('workflow_embeddings')
            .upsert(embeddingData);

        if (error) {
            throw new Error(`Failed to store embedding: ${error.message}`);
        }

        console.log(`✅ Embedding generated for workflow ${workflowId}`);
    }

    // Find similar workflows using vector search
    async findSimilarWorkflows(queryText, threshold = 0.8, limit = 10) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        const queryEmbedding = await this.generateTextEmbedding(queryText);
        
        const { data, error } = await this.supabase
            .rpc('find_similar_workflows', {
                query_embedding: `[${queryEmbedding.join(',')}]`,
                similarity_threshold: threshold,
                result_limit: limit,
                target_tenant_id: this.tenantId
            });

        if (error) {
            throw new Error(`Failed to find similar workflows: ${error.message}`);
        }

        return data;
    }

    // Log workflow execution
    async logExecution(workflowId, executionData) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        const logEntry = {
            workflow_id: workflowId,
            tenant_id: this.tenantId,
            execution_id: executionData.execution_id,
            status: executionData.status,
            execution_time_ms: executionData.execution_time_ms,
            input_data: executionData.input_data,
            output_data: executionData.output_data,
            error_details: executionData.error_details,
            node_executions: executionData.node_executions
        };

        const { error } = await this.supabase
            .from('execution_logs')
            .insert(logEntry);

        if (error) {
            throw new Error(`Failed to log execution: ${error.message}`);
        }
    }

    // Get workflow recommendations
    async getWorkflowRecommendations(currentWorkflowId) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        const { data, error } = await this.supabase
            .rpc('get_workflow_recommendations', {
                current_workflow_id: currentWorkflowId,
                target_tenant_id: this.tenantId
            });

        if (error) {
            throw new Error(`Failed to get recommendations: ${error.message}`);
        }

        return data;
    }

    // Mock function for text embedding generation
    // Replace with actual OpenAI implementation
    async generateTextEmbedding(text) {
        // This is a mock implementation
        // In a real implementation, you would use OpenAI's embedding API
        const mockEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        return mockEmbedding;
    }

    // Batch register multiple workflows
    async batchRegisterWorkflows(workflowsData, tenantSlug) {
        await this.setTenant(tenantSlug);
        
        const results = [];
        for (const workflowData of workflowsData) {
            try {
                const result = await this.registerWorkflow(workflowData);
                
                // Generate embedding for the workflow
                const embeddingText = `${workflowData.workflow_meta.goal} ${workflowData.workflow_meta.tags.join(' ')}`;
                await this.generateEmbedding(
                    workflowData.workflow_meta.id,
                    embeddingText,
                    workflowData.workflow_meta.tags,
                    [workflowData.workflow_meta.category]
                );
                
                results.push({ success: true, workflow: result });
            } catch (error) {
                results.push({ 
                    success: false, 
                    workflow_id: workflowData.workflow_meta.id, 
                    error: error.message 
                });
            }
        }
        
        return results;
    }

    // Get workflow performance metrics
    async getWorkflowMetrics(workflowId, days = 30) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        const { data, error } = await this.supabase
            .from('workflow_metrics')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('tenant_id', this.tenantId)
            .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (error) {
            throw new Error(`Failed to get metrics: ${error.message}`);
        }

        return data;
    }

    // Update workflow configuration
    async updateWorkflowConfig(workflowId, configUpdates) {
        if (!this.tenantId) {
            throw new Error('Tenant context not set');
        }

        const { data, error } = await this.supabase
            .from('tenant_workflow_configs')
            .update(configUpdates)
            .eq('tenant_id', this.tenantId)
            .eq('workflow_id', workflowId)
            .select();

        if (error) {
            throw new Error(`Failed to update config: ${error.message}`);
        }

        return data[0];
    }
}

module.exports = SupabaseWorkflowManager;

// CLI usage
if (require.main === module) {
    async function main() {
        const manager = new SupabaseWorkflowManager();
        
        const args = process.argv.slice(2);
        const command = args[0];
        
        try {
            switch (command) {
                case 'register':
                    if (args.length < 3) {
                        console.error('Usage: node supabase-integration.js register <tenant_slug> <workflow_file>');
                        process.exit(1);
                    }
                    const tenantSlug = args[1];
                    const workflowFile = args[2];
                    const workflowData = JSON.parse(require('fs').readFileSync(workflowFile, 'utf8'));
                    
                    await manager.setTenant(tenantSlug);
                    await manager.registerWorkflow(workflowData);
                    console.log('Workflow registered successfully');
                    break;
                    
                case 'search':
                    if (args.length < 3) {
                        console.error('Usage: node supabase-integration.js search <tenant_slug> <query>');
                        process.exit(1);
                    }
                    await manager.setTenant(args[1]);
                    const results = await manager.findSimilarWorkflows(args[2]);
                    console.log('Similar workflows:', JSON.stringify(results, null, 2));
                    break;
                    
                default:
                    console.log('Available commands: register, search');
                    console.log('Usage examples:');
                    console.log('  node supabase-integration.js register default ./microflows/content/example.json');
                    console.log('  node supabase-integration.js search default "generate content"');
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    }
    
    main();
}