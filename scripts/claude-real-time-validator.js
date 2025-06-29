#!/usr/bin/env node

/**
 * Real-time Workflow Validation for Claude Integration
 * Provides instant feedback during workflow creation
 */

const { ValidationPipeline } = require('./validation-pipeline-integration');
const { searchExistingWorkflows, suggestWorkflowUpdates } = require('./claude-self-learning');
const fs = require('fs').promises;
const path = require('path');

class ClaudeWorkflowValidator {
  constructor() {
    this.pipeline = new ValidationPipeline({
      validationMode: 'standard',
      mcpEnabled: true,
      claudeEnabled: true
    });
    
    this.validationHistory = [];
    this.suggestionCache = new Map();
  }

  /**
   * Real-time validation during workflow creation
   */
  async validateInProgress(partialWorkflow, context = {}) {
    console.log('🔄 Claude real-time validation starting...');
    
    const validationStart = Date.now();
    const result = {
      timestamp: new Date().toISOString(),
      valid: true,
      canProceed: true,
      issues: [],
      suggestions: [],
      recommendations: [],
      similarWorkflows: [],
      nextSteps: [],
      confidence: 'high'
    };

    try {
      // Basic structure validation
      await this.validateBasicStructure(partialWorkflow, result);
      
      // Naming convention check
      await this.validateNaming(partialWorkflow, result);
      
      // Node validation
      await this.validateNodes(partialWorkflow, result);
      
      // Find similar workflows
      await this.findSimilarWorkflows(partialWorkflow, result);
      
      // Generate suggestions
      await this.generateSuggestions(partialWorkflow, result, context);
      
      // Determine next steps
      this.determineNextSteps(partialWorkflow, result);
      
      result.duration = Date.now() - validationStart;
      result.valid = result.issues.filter(i => i.severity === 'error').length === 0;
      
      // Store in history
      this.validationHistory.push({
        timestamp: result.timestamp,
        workflowId: partialWorkflow.workflow_meta?.id,
        issues: result.issues.length,
        valid: result.valid
      });
      
      console.log(`✅ Validation completed in ${result.duration}ms`);
      return result;
      
    } catch (error) {
      console.error('❌ Real-time validation failed:', error.message);
      
      result.valid = false;
      result.canProceed = false;
      result.issues.push({
        type: 'error',
        severity: 'critical',
        message: `Validation system error: ${error.message}`,
        code: 'VALIDATION_SYSTEM_ERROR'
      });
      
      return result;
    }
  }

  async validateBasicStructure(workflow, result) {
    // Check workflow metadata
    if (!workflow.workflow_meta) {
      result.issues.push({
        type: 'error',
        severity: 'high',
        message: 'Workflow metadata is missing',
        code: 'MISSING_METADATA',
        fix: 'Add workflow_meta object with id, goal, and category'
      });
    }

    // Check required metadata fields
    const requiredFields = ['id', 'goal', 'category'];
    const meta = workflow.workflow_meta || {};
    
    for (const field of requiredFields) {
      if (!meta[field]) {
        result.issues.push({
          type: 'warning',
          severity: 'medium',
          message: `Missing required metadata field: ${field}`,
          code: `MISSING_${field.toUpperCase()}`,
          fix: `Add ${field} to workflow_meta`
        });
      }
    }

    // Check nodes array
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      result.issues.push({
        type: 'error',
        severity: 'high',
        message: 'Workflow must have a nodes array',
        code: 'MISSING_NODES_ARRAY',
        fix: 'Add nodes array to workflow'
      });
    } else if (workflow.nodes.length === 0) {
      result.suggestions.push({
        type: 'info',
        message: 'Workflow has no nodes yet',
        suggestion: 'Add your first node to get started'
      });
    }
  }

  async validateNaming(workflow, result) {
    const workflowId = workflow.workflow_meta?.id;
    
    if (!workflowId) {
      return; // Already handled in basic structure
    }

    // Validate naming pattern
    const namingPattern = /^[a-z]+__[a-z]+__[a-z_]+$/;
    
    if (!namingPattern.test(workflowId)) {
      result.issues.push({
        type: 'error',
        severity: 'medium',
        message: `Workflow ID '${workflowId}' doesn't follow naming convention`,
        code: 'INVALID_NAMING_PATTERN',
        fix: 'Use format: [function]__[tool]__[output] (e.g., send__slack__notification)',
        expectedPattern: '[function]__[tool]__[output]'
      });
      
      // Suggest a corrected name
      const suggestion = this.suggestCorrectNaming(workflowId);
      if (suggestion) {
        result.suggestions.push({
          type: 'suggestion',
          message: `Consider renaming to: ${suggestion}`,
          action: 'rename_workflow',
          value: suggestion
        });
      }
    }

    // Check for descriptive naming
    const parts = workflowId.split('__');
    if (parts.length === 3) {
      const [func, tool, output] = parts;
      
      if (func.length < 3) {
        result.suggestions.push({
          type: 'improvement',
          message: 'Function name could be more descriptive',
          suggestion: `Consider using a longer, more descriptive function name instead of '${func}'`
        });
      }
    }
  }

  suggestCorrectNaming(currentId) {
    // Simple heuristics to suggest better naming
    const commonMappings = {
      'slack': 'send__slack__message',
      'email': 'send__email__notification',
      'http': 'get__http__data',
      'webhook': 'receive__webhook__trigger'
    };
    
    const lowerCaseId = currentId.toLowerCase();
    
    for (const [keyword, suggestion] of Object.entries(commonMappings)) {
      if (lowerCaseId.includes(keyword)) {
        return suggestion;
      }
    }
    
    return null;
  }

  async validateNodes(workflow, result) {
    if (!workflow.nodes || workflow.nodes.length === 0) {
      return;
    }

    for (const [index, node] of workflow.nodes.entries()) {
      await this.validateSingleNode(node, index, result);
    }
  }

  async validateSingleNode(node, index, result) {
    const nodePrefix = `Node ${index}`;
    
    // Check required fields
    if (!node.type) {
      result.issues.push({
        type: 'error',
        severity: 'high',
        message: `${nodePrefix}: Missing node type`,
        code: 'MISSING_NODE_TYPE',
        nodeIndex: index,
        fix: 'Add type field (e.g., "n8n-nodes-base.httpRequest")'
      });
      return;
    }

    // Validate node type format
    if (!node.type.includes('.')) {
      result.issues.push({
        type: 'error',
        severity: 'high',
        message: `${nodePrefix}: Invalid node type format`,
        code: 'INVALID_NODE_TYPE_FORMAT',
        nodeIndex: index,
        fix: 'Use format: package.nodeName (e.g., "n8n-nodes-base.slack")'
      });
    }

    // Check for parameters
    if (!node.parameters) {
      result.suggestions.push({
        type: 'info',
        message: `${nodePrefix}: No parameters configured`,
        suggestion: 'Configure node parameters for functionality',
        nodeIndex: index
      });
    }

    // Use MCP validation if available
    try {
      const mcpResult = await this.pipeline.validateNodeMinimal(node.type, node.parameters);
      
      if (mcpResult.issues) {
        mcpResult.issues.forEach(issue => {
          result.issues.push({
            ...issue,
            nodeIndex: index,
            nodeType: node.type,
            source: 'mcp'
          });
        });
      }
    } catch (error) {
      // MCP validation failed, continue with basic validation
      console.warn(`MCP validation failed for node ${index}:`, error.message);
    }

    // Node-specific suggestions
    this.addNodeSpecificSuggestions(node, index, result);
  }

  addNodeSpecificSuggestions(node, index, result) {
    const nodeType = node.type;
    const params = node.parameters || {};
    
    // Slack-specific suggestions
    if (nodeType === 'n8n-nodes-base.slack') {
      if (!params.channel) {
        result.suggestions.push({
          type: 'config',
          message: `Node ${index}: Configure Slack channel`,
          suggestion: 'Set the channel parameter (e.g., "#general" or "@username")',
          nodeIndex: index
        });
      }
      
      if (!params.text && !params.attachments) {
        result.suggestions.push({
          type: 'config',
          message: `Node ${index}: Configure message content`,
          suggestion: 'Set text or attachments for the Slack message',
          nodeIndex: index
        });
      }
    }

    // HTTP Request suggestions
    if (nodeType === 'n8n-nodes-base.httpRequest') {
      if (!params.url) {
        result.suggestions.push({
          type: 'config',
          message: `Node ${index}: Configure HTTP URL`,
          suggestion: 'Set the URL parameter for the HTTP request',
          nodeIndex: index
        });
      }
      
      if (params.method === 'POST' && !params.body) {
        result.suggestions.push({
          type: 'config',
          message: `Node ${index}: POST request without body`,
          suggestion: 'Consider adding request body for POST requests',
          nodeIndex: index
        });
      }
    }

    // Google Sheets suggestions
    if (nodeType === 'n8n-nodes-base.googleSheets') {
      if (!params.documentId) {
        result.suggestions.push({
          type: 'config',
          message: `Node ${index}: Configure spreadsheet ID`,
          suggestion: 'Set the documentId parameter with your Google Sheets ID',
          nodeIndex: index
        });
      }
    }
  }

  async findSimilarWorkflows(workflow, result) {
    if (!workflow.workflow_meta?.goal) {
      return;
    }

    try {
      const similar = await searchExistingWorkflows(workflow.workflow_meta.goal);
      
      if (similar && similar.length > 0) {
        result.similarWorkflows = similar.slice(0, 3).map(w => ({
          id: w.id,
          goal: w.goal,
          similarity: w.similarity || 'high',
          reuseComponents: w.reusable_components || []
        }));
        
        result.recommendations.push({
          type: 'reuse',
          message: `Found ${similar.length} similar workflows`,
          suggestion: 'Consider reusing components from existing workflows',
          similarCount: similar.length
        });
      }
    } catch (error) {
      console.warn('Similar workflow search failed:', error.message);
    }
  }

  async generateSuggestions(workflow, result, context) {
    const meta = workflow.workflow_meta || {};
    
    // Category-specific suggestions
    if (meta.category) {
      this.addCategorySuggestions(meta.category, workflow, result);
    }

    // Integration suggestions based on context
    if (context.userIntent) {
      this.addIntentBasedSuggestions(context.userIntent, workflow, result);
    }

    // Performance suggestions
    this.addPerformanceSuggestions(workflow, result);
    
    // Security suggestions
    this.addSecuritySuggestions(workflow, result);
  }

  addCategorySuggestions(category, workflow, result) {
    const suggestions = {
      'communication': [
        'Consider adding error handling for failed message delivery',
        'Add retry logic for communication failures',
        'Include message formatting validation'
      ],
      'data': [
        'Add data validation before processing',
        'Consider data transformation nodes',
        'Include error handling for data format issues'
      ],
      'content': [
        'Add content quality validation',
        'Consider content backup before modifications',
        'Include content approval workflows'
      ],
      'validation': [
        'Add comprehensive input validation',
        'Include validation error reporting',
        'Consider validation result logging'
      ]
    };

    const categorySuggestions = suggestions[category] || [];
    
    categorySuggestions.forEach(suggestion => {
      result.suggestions.push({
        type: 'best_practice',
        message: suggestion,
        category: category
      });
    });
  }

  addIntentBasedSuggestions(intent, workflow, result) {
    // Parse user intent and provide contextual suggestions
    const intentLower = intent.toLowerCase();
    
    if (intentLower.includes('notification') || intentLower.includes('alert')) {
      result.suggestions.push({
        type: 'feature',
        message: 'Consider adding notification scheduling',
        suggestion: 'Add delay or schedule nodes for timed notifications'
      });
    }
    
    if (intentLower.includes('data') || intentLower.includes('process')) {
      result.suggestions.push({
        type: 'feature',
        message: 'Consider data validation',
        suggestion: 'Add validation nodes to ensure data quality'
      });
    }
    
    if (intentLower.includes('api') || intentLower.includes('request')) {
      result.suggestions.push({
        type: 'feature',
        message: 'Consider API rate limiting',
        suggestion: 'Add delay between API requests to avoid rate limits'
      });
    }
  }

  addPerformanceSuggestions(workflow, result) {
    if (!workflow.nodes) return;
    
    const nodeCount = workflow.nodes.length;
    
    if (nodeCount > 10) {
      result.suggestions.push({
        type: 'performance',
        message: 'Large workflow detected',
        suggestion: 'Consider breaking into smaller, reusable microflows'
      });
    }
    
    // Check for potential loops
    const hasLoops = workflow.nodes.some(node => 
      node.parameters?.mode === 'runOnceForEachItem'
    );
    
    if (hasLoops) {
      result.suggestions.push({
        type: 'performance',
        message: 'Loop nodes detected',
        suggestion: 'Consider batch processing for better performance'
      });
    }
  }

  addSecuritySuggestions(workflow, result) {
    if (!workflow.nodes) return;
    
    // Check for credential usage
    const hasCredentials = workflow.nodes.some(node => 
      node.credentials && Object.keys(node.credentials).length > 0
    );
    
    if (hasCredentials) {
      result.suggestions.push({
        type: 'security',
        message: 'Credentials detected',
        suggestion: 'Ensure credentials are properly configured and secured'
      });
    }
    
    // Check for HTTP nodes without authentication
    const unsecuredHttp = workflow.nodes.filter(node => 
      node.type === 'n8n-nodes-base.httpRequest' && 
      !node.parameters?.authentication
    );
    
    if (unsecuredHttp.length > 0) {
      result.suggestions.push({
        type: 'security',
        message: 'HTTP requests without authentication',
        suggestion: 'Consider adding authentication for external API calls'
      });
    }
  }

  determineNextSteps(workflow, result) {
    const meta = workflow.workflow_meta || {};
    const nodes = workflow.nodes || [];
    
    // Suggest next steps based on current state
    if (!meta.id) {
      result.nextSteps.push({
        step: 'add_workflow_id',
        description: 'Add a unique workflow ID',
        priority: 'high'
      });
    }
    
    if (!meta.goal) {
      result.nextSteps.push({
        step: 'define_goal',
        description: 'Define the workflow goal and purpose',
        priority: 'high'
      });
    }
    
    if (nodes.length === 0) {
      result.nextSteps.push({
        step: 'add_first_node',
        description: 'Add your first workflow node',
        priority: 'high'
      });
    } else if (nodes.length === 1) {
      result.nextSteps.push({
        step: 'add_more_nodes',
        description: 'Add additional nodes to build workflow logic',
        priority: 'medium'
      });
    }
    
    if (nodes.length > 1 && !workflow.connections) {
      result.nextSteps.push({
        step: 'connect_nodes',
        description: 'Connect nodes to define workflow flow',
        priority: 'high'
      });
    }
    
    if (result.issues.length > 0) {
      result.nextSteps.push({
        step: 'fix_issues',
        description: `Fix ${result.issues.length} validation issues`,
        priority: 'high'
      });
    }
    
    // Suggest testing
    if (result.valid && nodes.length > 0) {
      result.nextSteps.push({
        step: 'test_workflow',
        description: 'Test workflow with sample data',
        priority: 'medium'
      });
    }
  }

  /**
   * Get validation suggestions for Claude during workflow building
   */
  async getSuggestionsForClaude(userQuery, currentWorkflow = {}) {
    console.log('🤖 Generating Claude-specific suggestions...');
    
    const suggestions = {
      improvements: [],
      nextActions: [],
      alternatives: [],
      examples: []
    };

    try {
      // Analyze user query for intent
      const intent = this.analyzeUserIntent(userQuery);
      
      // Get context-aware suggestions
      if (intent.action === 'create') {
        suggestions.nextActions = await this.getCreationSuggestions(intent, currentWorkflow);
      } else if (intent.action === 'modify') {
        suggestions.improvements = await this.getModificationSuggestions(intent, currentWorkflow);
      } else if (intent.action === 'troubleshoot') {
        suggestions.improvements = await this.getTroubleshootingSuggestions(intent, currentWorkflow);
      }
      
      // Find alternative approaches
      suggestions.alternatives = await this.getAlternativeApproaches(intent, currentWorkflow);
      
      // Provide examples
      suggestions.examples = await this.getRelevantExamples(intent);
      
      return suggestions;
      
    } catch (error) {
      console.error('Failed to generate Claude suggestions:', error.message);
      return suggestions;
    }
  }

  analyzeUserIntent(query) {
    const queryLower = query.toLowerCase();
    
    const intent = {
      action: 'unknown',
      target: 'workflow',
      specifics: []
    };
    
    // Determine action
    if (queryLower.includes('create') || queryLower.includes('build') || queryLower.includes('make')) {
      intent.action = 'create';
    } else if (queryLower.includes('modify') || queryLower.includes('update') || queryLower.includes('change')) {
      intent.action = 'modify';
    } else if (queryLower.includes('fix') || queryLower.includes('error') || queryLower.includes('issue')) {
      intent.action = 'troubleshoot';
    } else if (queryLower.includes('validate') || queryLower.includes('check')) {
      intent.action = 'validate';
    }
    
    // Determine target
    if (queryLower.includes('slack')) {
      intent.target = 'slack';
      intent.specifics.push('communication');
    } else if (queryLower.includes('email')) {
      intent.target = 'email';
      intent.specifics.push('communication');
    } else if (queryLower.includes('api') || queryLower.includes('http')) {
      intent.target = 'api';
      intent.specifics.push('integration');
    } else if (queryLower.includes('data') || queryLower.includes('process')) {
      intent.target = 'data';
      intent.specifics.push('processing');
    }
    
    return intent;
  }

  async getCreationSuggestions(intent, currentWorkflow) {
    const suggestions = [];
    
    if (intent.target === 'slack') {
      suggestions.push({
        action: 'add_slack_node',
        description: 'Add a Slack node for messaging',
        template: 'slack-node',
        priority: 'high'
      });
      
      suggestions.push({
        action: 'configure_credentials',
        description: 'Set up Slack API credentials',
        priority: 'high'
      });
    }
    
    if (intent.target === 'api') {
      suggestions.push({
        action: 'add_http_node',
        description: 'Add HTTP Request node for API calls',
        template: 'http-request-node',
        priority: 'high'
      });
      
      suggestions.push({
        action: 'add_error_handling',
        description: 'Add error handling for API failures',
        priority: 'medium'
      });
    }
    
    return suggestions;
  }

  async getModificationSuggestions(intent, currentWorkflow) {
    const suggestions = [];
    
    // Analyze current workflow to suggest modifications
    const validation = await this.validateInProgress(currentWorkflow);
    
    validation.issues.forEach(issue => {
      if (issue.fix) {
        suggestions.push({
          action: 'fix_issue',
          description: issue.fix,
          issue: issue.code,
          priority: issue.severity === 'critical' ? 'high' : 'medium'
        });
      }
    });
    
    return suggestions;
  }

  async getTroubleshootingSuggestions(intent, currentWorkflow) {
    const suggestions = [];
    
    // Common troubleshooting suggestions
    suggestions.push({
      action: 'check_credentials',
      description: 'Verify all credentials are properly configured',
      priority: 'high'
    });
    
    suggestions.push({
      action: 'validate_connections',
      description: 'Check node connections and data flow',
      priority: 'high'
    });
    
    suggestions.push({
      action: 'test_individually',
      description: 'Test each node individually',
      priority: 'medium'
    });
    
    return suggestions;
  }

  async getAlternativeApproaches(intent, currentWorkflow) {
    const alternatives = [];
    
    if (intent.target === 'slack') {
      alternatives.push({
        approach: 'webhook',
        description: 'Use Slack webhook instead of API',
        benefits: ['Simpler setup', 'No OAuth required']
      });
    }
    
    if (intent.target === 'api') {
      alternatives.push({
        approach: 'webhook_trigger',
        description: 'Use webhook trigger instead of scheduled API calls',
        benefits: ['Real-time processing', 'Better performance']
      });
    }
    
    return alternatives;
  }

  async getRelevantExamples(intent) {
    const examples = [];
    
    if (intent.target === 'slack') {
      examples.push({
        title: 'Simple Slack Notification',
        description: 'Send a basic message to Slack channel',
        file: 'examples/slack-notification.json'
      });
    }
    
    if (intent.target === 'api') {
      examples.push({
        title: 'API Data Fetching',
        description: 'Fetch data from REST API',
        file: 'examples/api-data-fetch.json'
      });
    }
    
    return examples;
  }

  /**
   * CLI interface for real-time validation
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const validator = new ClaudeWorkflowValidator();
    
    if (command === 'validate') {
      const workflowFile = args[1];
      if (!workflowFile) {
        console.error('Usage: node claude-real-time-validator.js validate <workflow-file>');
        process.exit(1);
      }
      
      try {
        const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));
        const result = await validator.validateInProgress(workflow);
        
        console.log('\n🔍 Real-time Validation Results:');
        console.log(`✅ Valid: ${result.valid ? 'Yes' : 'No'}`);
        console.log(`🚦 Can Proceed: ${result.canProceed ? 'Yes' : 'No'}`);
        console.log(`⚠️  Issues: ${result.issues.length}`);
        console.log(`💡 Suggestions: ${result.suggestions.length}`);
        console.log(`⏱️  Duration: ${result.duration}ms`);
        
        if (result.issues.length > 0) {
          console.log('\n❌ Issues:');
          result.issues.forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.severity?.toUpperCase()}] ${issue.message}`);
            if (issue.fix) {
              console.log(`     🔧 Fix: ${issue.fix}`);
            }
          });
        }
        
        if (result.suggestions.length > 0) {
          console.log('\n💡 Suggestions:');
          result.suggestions.forEach((suggestion, i) => {
            console.log(`  ${i + 1}. ${suggestion.message}`);
            if (suggestion.suggestion) {
              console.log(`     💭 ${suggestion.suggestion}`);
            }
          });
        }
        
        if (result.nextSteps.length > 0) {
          console.log('\n📋 Next Steps:');
          result.nextSteps.forEach((step, i) => {
            console.log(`  ${i + 1}. [${step.priority?.toUpperCase()}] ${step.description}`);
          });
        }
        
      } catch (error) {
        console.error('❌ Validation failed:', error.message);
        process.exit(1);
      }
      
    } else if (command === 'suggest') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('Usage: node claude-real-time-validator.js suggest <query>');
        process.exit(1);
      }
      
      try {
        const suggestions = await validator.getSuggestionsForClaude(query);
        
        console.log('\n🤖 Claude Suggestions:');
        
        if (suggestions.nextActions.length > 0) {
          console.log('\n📋 Next Actions:');
          suggestions.nextActions.forEach((action, i) => {
            console.log(`  ${i + 1}. ${action.description}`);
          });
        }
        
        if (suggestions.improvements.length > 0) {
          console.log('\n🔧 Improvements:');
          suggestions.improvements.forEach((improvement, i) => {
            console.log(`  ${i + 1}. ${improvement.description}`);
          });
        }
        
        if (suggestions.alternatives.length > 0) {
          console.log('\n🔄 Alternatives:');
          suggestions.alternatives.forEach((alt, i) => {
            console.log(`  ${i + 1}. ${alt.description}`);
          });
        }
        
      } catch (error) {
        console.error('❌ Suggestion generation failed:', error.message);
        process.exit(1);
      }
      
    } else {
      console.log('Usage:');
      console.log('  node claude-real-time-validator.js validate <workflow-file>');
      console.log('  node claude-real-time-validator.js suggest <query>');
      process.exit(1);
    }
  }
}

// Export for module use
module.exports = {
  ClaudeWorkflowValidator,
  validateInProgress: async (workflow, context) => {
    const validator = new ClaudeWorkflowValidator();
    return await validator.validateInProgress(workflow, context);
  },
  getSuggestionsForClaude: async (query, workflow) => {
    const validator = new ClaudeWorkflowValidator();
    return await validator.getSuggestionsForClaude(query, workflow);
  }
};

// Run CLI if called directly
if (require.main === module) {
  ClaudeWorkflowValidator.runCLI();
}