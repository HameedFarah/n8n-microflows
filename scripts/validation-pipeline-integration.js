#!/usr/bin/env node

/**
 * Complete Validation Pipeline Integration
 * Connects N8N MCP tools with microflows validation system
 */

const { validateNodeOperation, validateWorkflow } = require('./n8n-mcp-validator');
const { generateUserFriendlyError } = require('./error-handling-framework');
const { searchExistingWorkflows, analyzeWorkflowStructure } = require('./claude-self-learning');
const { loadWorkflowConfig } = require('./supabase-integration');
const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');

class ValidationPipeline {
  constructor(options = {}) {
    this.mcpEnabled = options.mcpEnabled || true;
    this.supabaseEnabled = options.supabaseEnabled || true;
    this.claudeEnabled = options.claudeEnabled || true;
    this.validationMode = options.validationMode || 'comprehensive'; // minimal, standard, comprehensive
    
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.schemas = new Map();
    this.validationCache = new Map();
    
    this.init();
  }

  async init() {
    // Load validation schemas
    await this.loadSchemas();
    
    // Initialize MCP tools connection
    if (this.mcpEnabled) {
      await this.initializeMCPTools();
    }
    
    console.log('🔧 Validation Pipeline initialized');
  }

  async loadSchemas() {
    const schemaFiles = [
      'workflow-schema.json',
      'complete-workflow-schema.json',
      'metadata-schema.json',
      'node-documentation.json'
    ];

    for (const schemaFile of schemaFiles) {
      try {
        const schemaPath = path.join(process.cwd(), 'schemas', schemaFile);
        const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
        const schemaName = schemaFile.replace('.json', '');
        
        this.ajv.addSchema(schema, schemaName);
        this.schemas.set(schemaName, schema);
        
        console.log(`✅ Loaded schema: ${schemaName}`);
      } catch (error) {
        console.error(`❌ Failed to load schema ${schemaFile}:`, error.message);
      }
    }
  }

  async initializeMCPTools() {
    try {
      // Test MCP connection
      const testResult = await validateNodeOperation('test-node', {
        type: 'n8n-nodes-base.httpRequest',
        parameters: { url: 'https://example.com' }
      });
      
      console.log('🔗 MCP Tools connection established');
    } catch (error) {
      console.warn('⚠️ MCP Tools not available, falling back to basic validation');
      this.mcpEnabled = false;
    }
  }

  /**
   * Main validation entry point
   */
  async validateMicroflow(workflowPath, options = {}) {
    const startTime = Date.now();
    const validationId = this.generateValidationId();
    
    console.log(`🔍 Starting validation [${validationId}]: ${workflowPath}`);
    
    try {
      // Load workflow
      const workflow = await this.loadWorkflow(workflowPath);
      
      // Create validation context
      const context = {
        validationId,
        workflowPath,
        workflow,
        mode: options.mode || this.validationMode,
        skipCache: options.skipCache || false,
        tenantId: options.tenantId,
        errors: [],
        warnings: [],
        suggestions: [],
        metrics: {}
      };

      // Run validation pipeline
      await this.runValidationSteps(context);
      
      // Generate results
      const results = this.generateValidationResults(context, startTime);
      
      // Cache results if successful
      if (!context.skipCache && results.valid) {
        this.cacheValidationResults(validationId, results);
      }
      
      return results;
      
    } catch (error) {
      console.error(`💥 Validation failed [${validationId}]:`, error.message);
      
      return {
        validationId,
        valid: false,
        errors: [{
          type: 'VALIDATION_ERROR',
          message: error.message,
          severity: 'critical',
          code: 'PIPELINE_FAILURE'
        }],
        warnings: [],
        suggestions: [],
        duration: Date.now() - startTime
      };
    }
  }

  async runValidationSteps(context) {
    const steps = this.getValidationSteps(context.mode);
    
    for (const step of steps) {
      try {
        console.log(`  📋 Running: ${step.name}`);
        await step.execute(context);
      } catch (error) {
        const friendlyError = generateUserFriendlyError(error, context.workflow);
        context.errors.push({
          step: step.name,
          type: step.errorType || 'VALIDATION_ERROR',
          message: friendlyError.userMessage,
          severity: step.severity || 'high',
          code: friendlyError.errorCode,
          technicalDetails: friendlyError.technicalDetails,
          suggestedActions: friendlyError.suggestedActions
        });
        
        if (step.critical) {
          throw error;
        }
      }
    }
  }

  getValidationSteps(mode) {
    const allSteps = [
      {
        name: 'Schema Validation',
        execute: this.validateSchema.bind(this),
        critical: true,
        severity: 'critical'
      },
      {
        name: 'Node Configuration',
        execute: this.validateNodeConfigurations.bind(this),
        critical: true,
        severity: 'high'
      },
      {
        name: 'Workflow Structure',
        execute: this.validateWorkflowStructure.bind(this),
        critical: false,
        severity: 'medium'
      },
      {
        name: 'Naming Convention',
        execute: this.validateNamingConvention.bind(this),
        critical: false,
        severity: 'low'
      },
      {
        name: 'Dependencies',
        execute: this.validateDependencies.bind(this),
        critical: false,
        severity: 'medium'
      },
      {
        name: 'Security Requirements',
        execute: this.validateSecurity.bind(this),
        critical: false,
        severity: 'high'
      },
      {
        name: 'Performance Analysis',
        execute: this.analyzePerformance.bind(this),
        critical: false,
        severity: 'low'
      },
      {
        name: 'Documentation Check',
        execute: this.validateDocumentation.bind(this),
        critical: false,
        severity: 'low'
      }
    ];

    switch (mode) {
      case 'minimal':
        return allSteps.filter(s => s.critical);
      case 'standard':
        return allSteps.filter(s => s.critical || s.severity === 'high');
      case 'comprehensive':
      default:
        return allSteps;
    }
  }

  async validateSchema(context) {
    const { workflow } = context;
    
    // Validate against workflow schema
    const isValid = this.ajv.validate('workflow-schema', workflow);
    
    if (!isValid) {
      const errors = this.ajv.errors.map(error => ({
        type: 'SCHEMA_ERROR',
        message: `Schema validation failed: ${error.instancePath} ${error.message}`,
        severity: 'critical',
        code: 'INVALID_SCHEMA',
        path: error.instancePath,
        allowedValues: error.schema?.enum
      }));
      
      context.errors.push(...errors);
    }
    
    context.metrics.schemaValid = isValid;
  }

  async validateNodeConfigurations(context) {
    const { workflow } = context;
    
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      context.errors.push({
        type: 'STRUCTURE_ERROR',
        message: 'Workflow must contain a nodes array',
        severity: 'critical',
        code: 'MISSING_NODES'
      });
      return;
    }

    for (const [index, node] of workflow.nodes.entries()) {
      try {
        if (this.mcpEnabled) {
          // Use MCP tools for advanced validation
          const mcpResult = await validateNodeOperation(node.type, node.parameters);
          
          if (!mcpResult.valid) {
            context.errors.push({
              type: 'NODE_ERROR',
              message: `Node ${index} (${node.type}): ${mcpResult.error}`,
              severity: 'high',
              code: 'INVALID_NODE_CONFIG',
              nodeIndex: index,
              nodeType: node.type,
              suggestions: mcpResult.suggestions
            });
          }
        } else {
          // Basic node validation
          await this.basicNodeValidation(node, index, context);
        }
      } catch (error) {
        context.errors.push({
          type: 'NODE_ERROR',
          message: `Node ${index} validation failed: ${error.message}`,
          severity: 'high',
          code: 'NODE_VALIDATION_ERROR',
          nodeIndex: index
        });
      }
    }
    
    context.metrics.nodesValidated = workflow.nodes.length;
    context.metrics.nodeErrors = context.errors.filter(e => e.type === 'NODE_ERROR').length;
  }

  async basicNodeValidation(node, index, context) {
    // Check required fields
    if (!node.type) {
      context.errors.push({
        type: 'NODE_ERROR',
        message: `Node ${index}: Missing required 'type' field`,
        severity: 'critical',
        code: 'MISSING_NODE_TYPE',
        nodeIndex: index
      });
    }

    if (!node.parameters) {
      context.warnings.push({
        type: 'NODE_WARNING',
        message: `Node ${index}: No parameters defined`,
        severity: 'low',
        code: 'MISSING_PARAMETERS',
        nodeIndex: index
      });
    }

    // Validate node type format
    if (node.type && !node.type.includes('.')) {
      context.errors.push({
        type: 'NODE_ERROR',
        message: `Node ${index}: Invalid node type format '${node.type}'`,
        severity: 'high',
        code: 'INVALID_NODE_TYPE',
        nodeIndex: index
      });
    }
  }

  async validateWorkflowStructure(context) {
    const { workflow } = context;
    
    if (this.mcpEnabled) {
      try {
        const structureAnalysis = await analyzeWorkflowStructure(workflow.workflow_meta?.id);
        
        if (structureAnalysis.issues) {
          structureAnalysis.issues.forEach(issue => {
            context.warnings.push({
              type: 'STRUCTURE_WARNING',
              message: issue.message,
              severity: issue.severity || 'medium',
              code: issue.code || 'STRUCTURE_ISSUE',
              suggestions: issue.suggestions
            });
          });
        }
        
        context.metrics.structureScore = structureAnalysis.score || 0;
      } catch (error) {
        console.warn('Claude structure analysis failed:', error.message);
      }
    }
    
    // Basic structure validation
    this.validateBasicStructure(context);
  }

  validateBasicStructure(context) {
    const { workflow } = context;
    
    // Check for connections
    if (workflow.connections && Object.keys(workflow.connections).length === 0) {
      context.warnings.push({
        type: 'STRUCTURE_WARNING',
        message: 'Workflow has no node connections',
        severity: 'medium',
        code: 'NO_CONNECTIONS'
      });
    }
    
    // Check for isolated nodes
    if (workflow.nodes && workflow.nodes.length > 1) {
      const connectedNodes = new Set();
      
      if (workflow.connections) {
        Object.entries(workflow.connections).forEach(([nodeId, connections]) => {
          connectedNodes.add(nodeId);
          Object.values(connections).forEach(connList => {
            connList.forEach(conn => {
              if (conn.node) connectedNodes.add(conn.node);
            });
          });
        });
      }
      
      const isolatedNodes = workflow.nodes.filter((_, index) => 
        !connectedNodes.has(index.toString())
      );
      
      if (isolatedNodes.length > 0) {
        context.warnings.push({
          type: 'STRUCTURE_WARNING',
          message: `Found ${isolatedNodes.length} isolated nodes`,
          severity: 'low',
          code: 'ISOLATED_NODES',
          isolatedCount: isolatedNodes.length
        });
      }
    }
  }

  async validateNamingConvention(context) {
    const { workflow } = context;
    const workflowId = workflow.workflow_meta?.id;
    
    if (!workflowId) {
      context.errors.push({
        type: 'NAMING_ERROR',
        message: 'Workflow missing required ID',
        severity: 'high',
        code: 'MISSING_ID'
      });
      return;
    }
    
    // Validate naming pattern: [function]__[tool]__[output]
    const namingPattern = /^[a-z]+__[a-z]+__[a-z_]+$/;
    
    if (!namingPattern.test(workflowId)) {
      context.errors.push({
        type: 'NAMING_ERROR',
        message: `Workflow ID '${workflowId}' does not follow naming convention [function]__[tool]__[output]`,
        severity: 'medium',
        code: 'INVALID_NAMING_PATTERN',
        expectedPattern: '[function]__[tool]__[output]'
      });
    }
    
    context.metrics.namingValid = namingPattern.test(workflowId);
  }

  async validateDependencies(context) {
    const { workflow } = context;
    const dependencies = workflow.workflow_meta?.dependencies || [];
    
    for (const dependency of dependencies) {
      try {
        // Check if dependency exists in the system
        if (this.claudeEnabled) {
          const searchResult = await searchExistingWorkflows(dependency);
          
          if (!searchResult || searchResult.length === 0) {
            context.warnings.push({
              type: 'DEPENDENCY_WARNING',
              message: `Dependency '${dependency}' not found in workflow catalog`,
              severity: 'medium',
              code: 'MISSING_DEPENDENCY',
              dependency
            });
          }
        }
      } catch (error) {
        console.warn(`Dependency check failed for '${dependency}':`, error.message);
      }
    }
    
    context.metrics.dependenciesChecked = dependencies.length;
  }

  async validateSecurity(context) {
    const { workflow } = context;
    
    // Check for hardcoded credentials
    const workflowStr = JSON.stringify(workflow);
    const suspiciousPatterns = [
      /password\s*[:=]\s*["'][^"']+["']/i,
      /api_key\s*[:=]\s*["'][^"']+["']/i,
      /secret\s*[:=]\s*["'][^"']+["']/i,
      /token\s*[:=]\s*["'][^"']+["']/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(workflowStr)) {
        context.errors.push({
          type: 'SECURITY_ERROR',
          message: 'Potential hardcoded credentials detected',
          severity: 'high',
          code: 'HARDCODED_CREDENTIALS',
          suggestion: 'Use environment variables or credential management'
        });
        break;
      }
    }
    
    // Check tenant isolation
    if (workflow.workflow_meta?.tenant_aware === 'yes' && !context.tenantId) {
      context.warnings.push({
        type: 'SECURITY_WARNING',
        message: 'Tenant-aware workflow without tenant context',
        severity: 'medium',
        code: 'MISSING_TENANT_CONTEXT'
      });
    }
    
    context.metrics.securityChecksRun = suspiciousPatterns.length + 1;
  }

  async analyzePerformance(context) {
    const { workflow } = context;
    
    // Estimate execution complexity
    let complexityScore = 0;
    
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        // Basic complexity scoring
        switch (node.type) {
          case 'n8n-nodes-base.httpRequest':
            complexityScore += 2;
            break;
          case 'n8n-nodes-base.code':
            complexityScore += 3;
            break;
          case 'n8n-nodes-base.function':
            complexityScore += 3;
            break;
          default:
            complexityScore += 1;
        }
        
        // Check for loops
        if (node.parameters?.mode === 'runOnceForEachItem') {
          complexityScore += 5;
        }
      }
    }
    
    if (complexityScore > 20) {
      context.warnings.push({
        type: 'PERFORMANCE_WARNING',
        message: 'High complexity workflow may have performance implications',
        severity: 'low',
        code: 'HIGH_COMPLEXITY',
        complexityScore
      });
    }
    
    context.metrics.complexityScore = complexityScore;
  }

  async validateDocumentation(context) {
    const { workflow } = context;
    const meta = workflow.workflow_meta || {};
    
    const requiredFields = ['goal', 'category'];
    const missingFields = requiredFields.filter(field => !meta[field]);
    
    if (missingFields.length > 0) {
      context.warnings.push({
        type: 'DOCUMENTATION_WARNING',
        message: `Missing documentation fields: ${missingFields.join(', ')}`,
        severity: 'low',
        code: 'INCOMPLETE_DOCUMENTATION',
        missingFields
      });
    }
    
    // Check documentation quality
    if (meta.goal && meta.goal.length < 10) {
      context.warnings.push({
        type: 'DOCUMENTATION_WARNING',
        message: 'Goal description is too brief',
        severity: 'low',
        code: 'BRIEF_DESCRIPTION'
      });
    }
    
    context.metrics.documentationScore = ((requiredFields.length - missingFields.length) / requiredFields.length) * 100;
  }

  async loadWorkflow(workflowPath) {
    try {
      const content = await fs.readFile(workflowPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load workflow from ${workflowPath}: ${error.message}`);
    }
  }

  generateValidationId() {
    return `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateValidationResults(context, startTime) {
    const duration = Date.now() - startTime;
    const hasErrors = context.errors.length > 0;
    const criticalErrors = context.errors.filter(e => e.severity === 'critical').length;
    
    return {
      validationId: context.validationId,
      valid: !hasErrors,
      critical: criticalErrors > 0,
      summary: {
        errors: context.errors.length,
        warnings: context.warnings.length,
        suggestions: context.suggestions.length,
        criticalErrors,
        duration
      },
      errors: context.errors,
      warnings: context.warnings,
      suggestions: context.suggestions,
      metrics: context.metrics,
      workflowPath: context.workflowPath,
      mode: context.mode,
      timestamp: new Date().toISOString()
    };
  }

  cacheValidationResults(validationId, results) {
    // Simple in-memory cache with TTL
    const ttl = 5 * 60 * 1000; // 5 minutes
    
    this.validationCache.set(validationId, {
      results,
      expires: Date.now() + ttl
    });
    
    // Clean expired entries
    for (const [key, value] of this.validationCache.entries()) {
      if (value.expires < Date.now()) {
        this.validationCache.delete(key);
      }
    }
  }

  /**
   * Real-time validation for Claude integration
   */
  async validateWorkflowInProgress(partialWorkflow) {
    console.log('🔄 Real-time validation for Claude');
    
    const issues = [];
    const suggestions = [];
    
    // Quick validation checks
    if (!partialWorkflow.workflow_meta?.id) {
      issues.push({
        type: 'warning',
        message: "Workflow ID not specified",
        code: 'MISSING_ID'
      });
      
      suggestions.push({
        type: 'suggestion',
        message: "Add a descriptive workflow ID following [function]__[tool]__[output] pattern"
      });
    }
    
    // Check ID naming if present
    if (partialWorkflow.workflow_meta?.id) {
      const namingPattern = /^[a-z]+__[a-z]+__[a-z_]+$/;
      if (!namingPattern.test(partialWorkflow.workflow_meta.id)) {
        issues.push({
          type: 'error',
          message: `Workflow ID doesn't follow naming convention`,
          code: 'INVALID_NAMING'
        });
      }
    }
    
    // Node validation using N8N MCP if available
    if (this.mcpEnabled && partialWorkflow.nodes) {
      for (const [index, node] of partialWorkflow.nodes.entries()) {
        try {
          const nodeResult = await this.validateNodeMinimal(node.type, node.parameters);
          if (nodeResult.issues) {
            issues.push(...nodeResult.issues.map(issue => ({
              ...issue,
              nodeIndex: index
            })));
          }
        } catch (error) {
          // Silently continue for real-time validation
        }
      }
    }
    
    return {
      issues,
      suggestions,
      isValid: issues.filter(i => i.type === 'error').length === 0,
      canProceed: true
    };
  }

  async validateNodeMinimal(nodeType, parameters) {
    if (!this.mcpEnabled) {
      return { issues: [] };
    }
    
    try {
      return await validateNodeOperation(nodeType, parameters || {});
    } catch (error) {
      return {
        issues: [{
          type: 'warning',
          message: `Node validation unavailable: ${error.message}`,
          code: 'VALIDATION_UNAVAILABLE'
        }]
      };
    }
  }

  /**
   * CLI Interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const workflowPath = args[0];
    
    if (!workflowPath) {
      console.error('Usage: node validation-pipeline-integration.js <workflow-path>');
      process.exit(1);
    }
    
    const pipeline = new ValidationPipeline({
      validationMode: args.includes('--minimal') ? 'minimal' : 
                     args.includes('--standard') ? 'standard' : 'comprehensive'
    });
    
    try {
      const results = await pipeline.validateMicroflow(workflowPath, {
        skipCache: args.includes('--no-cache')
      });
      
      console.log('\n📊 Validation Results:');
      console.log(`✅ Valid: ${results.valid ? 'Yes' : 'No'}`);
      console.log(`⚠️  Errors: ${results.summary.errors}`);
      console.log(`📝 Warnings: ${results.summary.warnings}`);
      console.log(`⏱️  Duration: ${results.summary.duration}ms`);
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach((error, i) => {
          console.log(`  ${i + 1}. [${error.severity.toUpperCase()}] ${error.message}`);
          if (error.suggestedActions) {
            console.log(`     💡 Suggestion: ${error.suggestedActions[0]}`);
          }
        });
      }
      
      if (results.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        results.warnings.forEach((warning, i) => {
          console.log(`  ${i + 1}. ${warning.message}`);
        });
      }
      
      process.exit(results.valid ? 0 : 1);
      
    } catch (error) {
      console.error('💥 Validation failed:', error.message);
      process.exit(1);
    }
  }
}

// Export for use as module
module.exports = {
  ValidationPipeline,
  validateMicroflow: async (workflowPath, options) => {
    const pipeline = new ValidationPipeline(options);
    return await pipeline.validateMicroflow(workflowPath, options);
  },
  validateWorkflowInProgress: async (partialWorkflow, options) => {
    const pipeline = new ValidationPipeline(options);
    return await pipeline.validateWorkflowInProgress(partialWorkflow);
  }
};

// Run CLI if called directly
if (require.main === module) {
  ValidationPipeline.runCLI();
}