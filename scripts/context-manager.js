#!/usr/bin/env node

/**
 * Context Preservation Manager for N8N Workflow Creation
 * Saves and restores workflow progress between chat sessions
 * Integrates with existing Supabase infrastructure
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class WorkflowContextManager {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY
    );
    
    // Local fallback storage
    this.localContextDir = path.join(process.cwd(), '.n8n-context');
    this.ensureLocalDir();
  }

  async ensureLocalDir() {
    try {
      await fs.mkdir(this.localContextDir, { recursive: true });
    } catch (error) {
      console.warn('Warning: Could not create local context directory:', error.message);
    }
  }

  /**
   * Save current workflow creation state
   */
  async saveWorkflowState(workflowName, currentStep, stateData, metadata = {}) {
    console.log(`💾 Saving workflow state: ${workflowName} (Step ${currentStep})`);
    
    const contextData = {
      workflow_name: workflowName,
      current_step: currentStep,
      state_data: stateData,
      metadata: {
        ...metadata,
        saved_at: new Date().toISOString(),
        version: '1.0',
        source: 'claude_context_manager'
      },
      tenant_id: metadata.tenant_id || 'default'
    };

    try {
      // Try Supabase first
      const saved = await this.saveToSupabase(contextData);
      if (saved) {
        console.log(`✅ Context saved to Supabase for ${workflowName}`);
        return { success: true, storage: 'supabase', data: contextData };
      }
    } catch (error) {
      console.warn('Supabase save failed, falling back to local storage:', error.message);
    }

    // Fallback to local storage
    try {
      await this.saveToLocal(contextData);
      console.log(`✅ Context saved locally for ${workflowName}`);
      return { success: true, storage: 'local', data: contextData };
    } catch (error) {
      console.error('❌ Failed to save context:', error.message);
      return { success: false, error: error.message };
    }
  }

  async saveToSupabase(contextData) {
    // First, ensure the context table exists
    await this.ensureContextTable();
    
    const { data, error } = await this.supabase
      .from('workflow_context')
      .upsert({
        workflow_name: contextData.workflow_name,
        tenant_id: contextData.tenant_id,
        current_step: contextData.current_step,
        state_data: contextData.state_data,
        metadata: contextData.metadata,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_name,tenant_id'
      })
      .select();

    if (error) throw error;
    return data && data.length > 0;
  }

  async saveToLocal(contextData) {
    const fileName = `${contextData.workflow_name}_${contextData.tenant_id}.json`;
    const filePath = path.join(this.localContextDir, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(contextData, null, 2));
    return true;
  }

  /**
   * Restore workflow state from previous session
   */
  async restoreWorkflowState(workflowName, tenantId = 'default') {
    console.log(`📂 Restoring workflow state: ${workflowName}`);

    try {
      // Try Supabase first
      const supabaseData = await this.loadFromSupabase(workflowName, tenantId);
      if (supabaseData) {
        console.log(`✅ Context restored from Supabase for ${workflowName}`);
        return { success: true, storage: 'supabase', data: supabaseData };
      }
    } catch (error) {
      console.warn('Supabase restore failed, trying local storage:', error.message);
    }

    // Fallback to local storage
    try {
      const localData = await this.loadFromLocal(workflowName, tenantId);
      if (localData) {
        console.log(`✅ Context restored from local storage for ${workflowName}`);
        return { success: true, storage: 'local', data: localData };
      }
    } catch (error) {
      console.warn('Local restore failed:', error.message);
    }

    console.log(`❌ No saved state found for ${workflowName}`);
    return { 
      success: false, 
      error: `No saved state found for workflow: ${workflowName}`,
      suggestions: this.getCreationSuggestions(workflowName)
    };
  }

  async loadFromSupabase(workflowName, tenantId) {
    const { data, error } = await this.supabase
      .from('workflow_context')
      .select('*')
      .eq('workflow_name', workflowName)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) return null;
    
    return {
      workflow_name: data.workflow_name,
      current_step: data.current_step,
      state_data: data.state_data,
      metadata: data.metadata,
      tenant_id: data.tenant_id,
      last_updated: data.updated_at
    };
  }

  async loadFromLocal(workflowName, tenantId) {
    const fileName = `${workflowName}_${tenantId}.json`;
    const filePath = path.join(this.localContextDir, fileName);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      return null;
    }
  }

  /**
   * List all saved workflow contexts
   */
  async listSavedContexts(tenantId = 'default') {
    console.log('📋 Listing saved workflow contexts...');

    const contexts = [];

    try {
      // Get from Supabase
      const { data: supabaseContexts } = await this.supabase
        .from('workflow_context')
        .select('workflow_name, current_step, updated_at, metadata')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });

      if (supabaseContexts) {
        contexts.push(...supabaseContexts.map(ctx => ({
          ...ctx,
          storage: 'supabase'
        })));
      }
    } catch (error) {
      console.warn('Could not fetch Supabase contexts:', error.message);
    }

    try {
      // Get from local storage
      const files = await fs.readdir(this.localContextDir);
      const localContexts = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file.includes(`_${tenantId}.`)) {
          try {
            const filePath = path.join(this.localContextDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const ctx = JSON.parse(content);
            
            localContexts.push({
              workflow_name: ctx.workflow_name,
              current_step: ctx.current_step,
              updated_at: ctx.metadata?.saved_at,
              metadata: ctx.metadata,
              storage: 'local'
            });
          } catch (error) {
            console.warn(`Could not read local context ${file}:`, error.message);
          }
        }
      }

      contexts.push(...localContexts);
    } catch (error) {
      console.warn('Could not scan local contexts:', error.message);
    }

    // Remove duplicates (prefer Supabase over local)
    const uniqueContexts = contexts.reduce((acc, ctx) => {
      const existing = acc.find(existing => existing.workflow_name === ctx.workflow_name);
      if (!existing || (ctx.storage === 'supabase' && existing.storage === 'local')) {
        if (existing) {
          const index = acc.indexOf(existing);
          acc[index] = ctx;
        } else {
          acc.push(ctx);
        }
      }
      return acc;
    }, []);

    console.log(`📋 Found ${uniqueContexts.length} saved contexts`);
    return uniqueContexts;
  }

  /**
   * Delete a saved workflow context
   */
  async deleteWorkflowState(workflowName, tenantId = 'default') {
    console.log(`🗑️ Deleting workflow state: ${workflowName}`);

    let deleted = false;

    try {
      // Delete from Supabase
      const { error } = await this.supabase
        .from('workflow_context')
        .delete()
        .eq('workflow_name', workflowName)
        .eq('tenant_id', tenantId);

      if (!error) {
        deleted = true;
        console.log('✅ Deleted from Supabase');
      }
    } catch (error) {
      console.warn('Could not delete from Supabase:', error.message);
    }

    try {
      // Delete from local storage
      const fileName = `${workflowName}_${tenantId}.json`;
      const filePath = path.join(this.localContextDir, fileName);
      await fs.unlink(filePath);
      deleted = true;
      console.log('✅ Deleted from local storage');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Could not delete from local storage:', error.message);
      }
    }

    return { success: deleted };
  }

  /**
   * Create the context table if it doesn't exist
   */
  async ensureContextTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS workflow_context (
        workflow_name TEXT,
        tenant_id TEXT,
        current_step INTEGER NOT NULL,
        state_data JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (workflow_name, tenant_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflow_context_updated 
      ON workflow_context(updated_at);
      
      CREATE INDEX IF NOT EXISTS idx_workflow_context_tenant 
      ON workflow_context(tenant_id);
    `;

    try {
      // Note: This requires service key for DDL operations
      const { error } = await this.supabase.rpc('exec_sql', { sql: createTableSQL });
      if (error && !error.message.includes('already exists')) {
        throw error;
      }
    } catch (error) {
      console.warn('Could not ensure context table (may need service key):', error.message);
    }
  }

  /**
   * Get suggestions for starting a new workflow
   */
  getCreationSuggestions(workflowName) {
    const suggestions = [];
    
    // Parse workflow name for suggestions
    if (workflowName.includes('slack')) {
      suggestions.push({
        step: 1,
        action: 'configure_slack_node',
        description: 'Start by adding a Slack node and configuring credentials'
      });
    }
    
    if (workflowName.includes('api') || workflowName.includes('http')) {
      suggestions.push({
        step: 1,
        action: 'configure_http_node',
        description: 'Begin with an HTTP Request node to call your API'
      });
    }
    
    if (workflowName.includes('data') || workflowName.includes('process')) {
      suggestions.push({
        step: 1,
        action: 'define_data_schema',
        description: 'First define your data structure and validation rules'
      });
    }
    
    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push(
        {
          step: 1,
          action: 'define_workflow_goal',
          description: 'Start by clearly defining what this workflow should accomplish'
        },
        {
          step: 2,
          action: 'choose_trigger',
          description: 'Decide how this workflow will be triggered (webhook, schedule, manual)'
        },
        {
          step: 3,
          action: 'map_data_flow',
          description: 'Plan how data will flow through your workflow nodes'
        }
      );
    }
    
    return suggestions;
  }

  /**
   * Quick summary of a saved context
   */
  async getContextSummary(workflowName, tenantId = 'default') {
    const result = await this.restoreWorkflowState(workflowName, tenantId);
    
    if (!result.success) {
      return null;
    }
    
    const data = result.data;
    return {
      name: data.workflow_name,
      step: data.current_step,
      lastUpdated: data.last_updated || data.metadata?.saved_at,
      storage: result.storage,
      hasNodes: !!(data.state_data?.workflow?.nodes?.length > 0),
      nodeCount: data.state_data?.workflow?.nodes?.length || 0,
      category: data.state_data?.workflow?.workflow_meta?.category,
      goal: data.state_data?.workflow?.workflow_meta?.goal
    };
  }

  /**
   * CLI interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    const manager = new WorkflowContextManager();

    if (command === 'save') {
      const [workflowName, step, dataFile] = args.slice(1);
      
      if (!workflowName || !step || !dataFile) {
        console.error('Usage: node context-manager.js save <workflow-name> <step> <data-file>');
        process.exit(1);
      }

      try {
        const stateData = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        const result = await manager.saveWorkflowState(workflowName, parseInt(step), stateData);
        
        if (result.success) {
          console.log(`✅ Saved to ${result.storage}`);
        } else {
          console.error(`❌ Save failed: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }

    } else if (command === 'restore') {
      const [workflowName, tenantId] = args.slice(1);
      
      if (!workflowName) {
        console.error('Usage: node context-manager.js restore <workflow-name> [tenant-id]');
        process.exit(1);
      }

      try {
        const result = await manager.restoreWorkflowState(workflowName, tenantId);
        
        if (result.success) {
          console.log('✅ Context restored:');
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(`❌ Restore failed: ${result.error}`);
          if (result.suggestions) {
            console.log('\n💡 Suggestions to get started:');
            result.suggestions.forEach((suggestion, i) => {
              console.log(`  ${i + 1}. ${suggestion.description}`);
            });
          }
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }

    } else if (command === 'list') {
      const [tenantId] = args.slice(1);
      
      try {
        const contexts = await manager.listSavedContexts(tenantId);
        
        if (contexts.length === 0) {
          console.log('📭 No saved contexts found');
        } else {
          console.log('\n📋 Saved Workflow Contexts:');
          console.log('─'.repeat(80));
          
          contexts.forEach((ctx, i) => {
            console.log(`${i + 1}. ${ctx.workflow_name} (Step ${ctx.current_step})`);
            console.log(`   Storage: ${ctx.storage} | Updated: ${ctx.updated_at}`);
            if (ctx.metadata?.source) {
              console.log(`   Source: ${ctx.metadata.source}`);
            }
            console.log('');
          });
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }

    } else if (command === 'delete') {
      const [workflowName, tenantId] = args.slice(1);
      
      if (!workflowName) {
        console.error('Usage: node context-manager.js delete <workflow-name> [tenant-id]');
        process.exit(1);
      }

      try {
        const result = await manager.deleteWorkflowState(workflowName, tenantId);
        
        if (result.success) {
          console.log(`✅ Deleted context for ${workflowName}`);
        } else {
          console.log(`❌ Could not delete context for ${workflowName}`);
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }

    } else if (command === 'summary') {
      const [workflowName, tenantId] = args.slice(1);
      
      if (!workflowName) {
        console.error('Usage: node context-manager.js summary <workflow-name> [tenant-id]');
        process.exit(1);
      }

      try {
        const summary = await manager.getContextSummary(workflowName, tenantId);
        
        if (summary) {
          console.log('📊 Workflow Context Summary:');
          console.log(`   Name: ${summary.name}`);
          console.log(`   Current Step: ${summary.step}`);
          console.log(`   Last Updated: ${summary.lastUpdated}`);
          console.log(`   Storage: ${summary.storage}`);
          console.log(`   Nodes: ${summary.nodeCount} nodes`);
          if (summary.category) console.log(`   Category: ${summary.category}`);
          if (summary.goal) console.log(`   Goal: ${summary.goal}`);
        } else {
          console.log(`❌ No context found for ${workflowName}`);
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }

    } else {
      console.log('N8N Workflow Context Manager');
      console.log('');
      console.log('Usage:');
      console.log('  node context-manager.js save <workflow-name> <step> <data-file>');
      console.log('  node context-manager.js restore <workflow-name> [tenant-id]');
      console.log('  node context-manager.js list [tenant-id]');
      console.log('  node context-manager.js delete <workflow-name> [tenant-id]');
      console.log('  node context-manager.js summary <workflow-name> [tenant-id]');
      console.log('');
      console.log('Examples:');
      console.log('  # Save current workflow state');
      console.log('  node context-manager.js save "slack-notification" 3 workflow-data.json');
      console.log('');
      console.log('  # Restore workflow from previous session');
      console.log('  node context-manager.js restore "slack-notification"');
      console.log('');
      console.log('  # List all saved contexts');
      console.log('  node context-manager.js list');
    }
  }
}

// Export for module use
module.exports = {
  WorkflowContextManager,
  saveWorkflowState: async (workflowName, step, stateData, metadata) => {
    const manager = new WorkflowContextManager();
    return await manager.saveWorkflowState(workflowName, step, stateData, metadata);
  },
  restoreWorkflowState: async (workflowName, tenantId) => {
    const manager = new WorkflowContextManager();
    return await manager.restoreWorkflowState(workflowName, tenantId);
  }
};

// Run CLI if called directly
if (require.main === module) {
  WorkflowContextManager.runCLI().catch(console.error);
}
