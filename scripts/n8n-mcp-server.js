#!/usr/bin/env node

/**
 * N8N Context Preservation MCP Server
 * Provides Claude Desktop integration for workflow context management
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import our existing systems
const { WorkflowContextManager } = require('./context-manager');
const { SmartDocumentationCache } = require('./docs-cache');
const { UltraEnhancedValidator } = require('./ultra-enhanced-validator');

class N8nContextMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'n8n-context-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.contextManager = new WorkflowContextManager();
    this.docsCache = new SmartDocumentationCache();
    this.validator = new UltraEnhancedValidator();

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_workflow_session',
            description: 'Start a new workflow creation session with context preservation',
            inputSchema: {
              type: 'object',
              properties: {
                workflow_name: {
                  type: 'string',
                  description: 'Name of the workflow to create'
                },
                user_intent: {
                  type: 'string',
                  description: 'Description of what the workflow should accomplish'
                },
                tenant_id: {
                  type: 'string',
                  description: 'Tenant ID for multi-tenant isolation (optional)',
                  default: 'default'
                }
              },
              required: ['workflow_name', 'user_intent']
            }
          },
          {
            name: 'save_workflow_state',
            description: 'Save current workflow creation progress',
            inputSchema: {
              type: 'object',
              properties: {
                workflow_name: {
                  type: 'string',
                  description: 'Name of the workflow'
                },
                current_step: {
                  type: 'number',
                  description: 'Current step in workflow creation (1-6)'
                },
                state_data: {
                  type: 'object',
                  description: 'Current workflow state and progress data'
                },
                tenant_id: {
                  type: 'string',
                  description: 'Tenant ID (optional)',
                  default: 'default'
                }
              },
              required: ['workflow_name', 'current_step', 'state_data']
            }
          },
          {
            name: 'restore_workflow_state',
            description: 'Restore workflow state from previous session',
            inputSchema: {
              type: 'object',
              properties: {
                workflow_name: {
                  type: 'string',
                  description: 'Name of the workflow to restore'
                },
                tenant_id: {
                  type: 'string',
                  description: 'Tenant ID (optional)',
                  default: 'default'
                }
              },
              required: ['workflow_name']
            }
          },
          {
            name: 'list_saved_workflows',
            description: 'List all saved workflow contexts',
            inputSchema: {
              type: 'object',
              properties: {
                tenant_id: {
                  type: 'string',
                  description: 'Tenant ID (optional)',
                  default: 'default'
                }
              }
            }
          },
          {
            name: 'validate_workflow_with_context',
            description: 'Validate workflow with enhanced context and caching',
            inputSchema: {
              type: 'object',
              properties: {
                workflow: {
                  type: 'object',
                  description: 'Workflow JSON to validate'
                },
                step_info: {
                  type: 'object',
                  description: 'Current step information (optional)',
                  default: {}
                }
              },
              required: ['workflow']
            }
          },
          {
            name: 'get_node_documentation',
            description: 'Get N8N node documentation with smart caching',
            inputSchema: {
              type: 'object',
              properties: {
                node_type: {
                  type: 'string',
                  description: 'N8N node type (e.g., nodes-base.slack)'
                },
                topic: {
                  type: 'string',
                  description: 'Specific documentation topic (optional)'
                },
                force_refresh: {
                  type: 'boolean',
                  description: 'Force refresh from API instead of cache',
                  default: false
                }
              },
              required: ['node_type']
            }
          },
          {
            name: 'get_session_stats',
            description: 'Get current session statistics and performance metrics',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_cache_stats',
            description: 'Get documentation cache performance statistics',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'create_checkpoint',
            description: 'Create a checkpoint in the current workflow session',
            inputSchema: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description: 'Description of the checkpoint'
                }
              },
              required: ['label']
            }
          },
          {
            name: 'advance_workflow_step',
            description: 'Advance to the next step in workflow creation',
            inputSchema: {
              type: 'object',
              properties: {
                step_description: {
                  type: 'string',
                  description: 'Description of what was accomplished in this step'
                }
              },
              required: ['step_description']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'start_workflow_session':
            return await this.handleStartSession(args);

          case 'save_workflow_state':
            return await this.handleSaveState(args);

          case 'restore_workflow_state':
            return await this.handleRestoreState(args);

          case 'list_saved_workflows':
            return await this.handleListWorkflows(args);

          case 'validate_workflow_with_context':
            return await this.handleValidateWorkflow(args);

          case 'get_node_documentation':
            return await this.handleGetDocumentation(args);

          case 'get_session_stats':
            return await this.handleGetSessionStats(args);

          case 'get_cache_stats':
            return await this.handleGetCacheStats(args);

          case 'create_checkpoint':
            return await this.handleCreateCheckpoint(args);

          case 'advance_workflow_step':
            return await this.handleAdvanceStep(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async handleStartSession(args) {
    const { workflow_name, user_intent, tenant_id = 'default' } = args;

    const result = await this.validator.startWorkflowSession(workflow_name, {
      userIntent: user_intent,
      tenantId: tenant_id
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: result.message,
            type: result.type,
            cacheEnabled: result.cacheEnabled,
            prefetchCompleted: result.prefetchCompleted,
            suggestions: result.suggestions || result.nextSteps || [],
            workflowName: workflow_name,
            step: 1
          }, null, 2)
        }
      ]
    };
  }

  async handleSaveState(args) {
    const { workflow_name, current_step, state_data, tenant_id = 'default' } = args;

    const result = await this.contextManager.saveWorkflowState(
      workflow_name,
      current_step,
      state_data,
      { tenantId: tenant_id, source: 'claude_desktop_mcp' }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            storage: result.storage,
            message: result.success 
              ? `Workflow state saved for ${workflow_name} at step ${current_step}`
              : `Save failed: ${result.error}`
          }, null, 2)
        }
      ]
    };
  }

  async handleRestoreState(args) {
    const { workflow_name, tenant_id = 'default' } = args;

    const result = await this.contextManager.restoreWorkflowState(workflow_name, tenant_id);

    if (result.success) {
      // Update validator's current session
      this.validator.currentSession = {
        workflowName: workflow_name,
        currentStep: result.data.current_step,
        tenantId: tenant_id,
        startTime: Date.now(),
        tokensUsed: result.data.metadata?.tokensUsed || 0,
        validationCount: 0
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            data: result.success ? {
              workflowName: result.data.workflow_name,
              currentStep: result.data.current_step,
              lastUpdated: result.data.last_updated,
              storage: result.storage,
              workflow: result.data.state_data?.workflow,
              metadata: result.data.metadata
            } : null,
            error: result.error,
            suggestions: result.suggestions || []
          }, null, 2)
        }
      ]
    };
  }

  async handleListWorkflows(args) {
    const { tenant_id = 'default' } = args;

    const contexts = await this.contextManager.listSavedContexts(tenant_id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: contexts.length,
            workflows: contexts.map(ctx => ({
              name: ctx.workflow_name,
              step: ctx.current_step,
              lastUpdated: ctx.updated_at,
              storage: ctx.storage,
              category: ctx.metadata?.source
            }))
          }, null, 2)
        }
      ]
    };
  }

  async handleValidateWorkflow(args) {
    const { workflow, step_info = {} } = args;

    // Ensure we have an active session
    if (!this.validator.currentSession.workflowName && workflow.workflow_meta?.id) {
      await this.validator.startWorkflowSession(workflow.workflow_meta.id, {
        userIntent: workflow.workflow_meta.goal || 'Workflow validation'
      });
    }

    const result = await this.validator.validateWithContext(workflow, step_info);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            validation: {
              valid: result.valid,
              canProceed: result.canProceed,
              issues: result.issues,
              suggestions: result.suggestions,
              nextSteps: result.contextualNextSteps,
              session: result.session,
              cacheInfo: result.cacheInfo,
              autoSaved: result.autoSaved
            }
          }, null, 2)
        }
      ]
    };
  }

  async handleGetDocumentation(args) {
    const { node_type, topic, force_refresh = false } = args;

    const result = await this.docsCache.getNodeDocumentation(node_type, {
      topic,
      forceRefresh: force_refresh
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: !result.error,
            source: result.source,
            nodeType: node_type,
            documentation: result.data,
            cached: result.source === 'cache',
            error: result.error
          }, null, 2)
        }
      ]
    };
  }

  async handleGetSessionStats(args) {
    if (!this.validator.currentSession.workflowName) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No active session'
            }, null, 2)
          }
        ]
      };
    }

    const stats = this.validator.getEnhancedSessionStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            session: stats
          }, null, 2)
        }
      ]
    };
  }

  async handleGetCacheStats(args) {
    const stats = await this.docsCache.getCacheStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            cache: stats
          }, null, 2)
        }
      ]
    };
  }

  async handleCreateCheckpoint(args) {
    const { label } = args;

    if (!this.validator.currentSession.workflowName) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No active session to checkpoint'
            }, null, 2)
          }
        ]
      };
    }

    const result = await this.validator.saveCheckpoint(label);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            message: result.success 
              ? `Checkpoint '${label}' created for ${this.validator.currentSession.workflowName}`
              : `Checkpoint failed: ${result.error}`,
            label,
            workflowName: this.validator.currentSession.workflowName
          }, null, 2)
        }
      ]
    };
  }

  async handleAdvanceStep(args) {
    const { step_description } = args;

    if (!this.validator.currentSession.workflowName) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No active session'
            }, null, 2)
          }
        ]
      };
    }

    const result = await this.validator.advanceStep(step_description);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            newStep: result.newStep,
            progress: result.progress,
            guidance: result.guidance,
            description: step_description
          }, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('N8N Context Preservation MCP Server running on stdio');
  }
}

// Export for use in other modules
module.exports = { N8nContextMCPServer };

// Run server if called directly
if (require.main === module) {
  const server = new N8nContextMCPServer();
  server.run().catch(console.error);
}
