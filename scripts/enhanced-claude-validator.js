#!/usr/bin/env node

/**
 * Enhanced Claude Real-time Validator with Context Preservation
 * Extends the existing validator with workflow state management
 */

const { ClaudeWorkflowValidator } = require('./claude-real-time-validator');
const { WorkflowContextManager } = require('./context-manager');
const fs = require('fs').promises;
const path = require('path');

class EnhancedClaudeValidator extends ClaudeWorkflowValidator {
  constructor() {
    super();
    this.contextManager = new WorkflowContextManager();
    this.currentSession = {
      workflowName: null,
      currentStep: 0,
      startTime: Date.now(),
      tokensUsed: 0,
      validationCount: 0
    };
  }

  /**
   * Start a new workflow creation session with context tracking
   */
  async startWorkflowSession(workflowName, options = {}) {
    console.log(`🚀 Starting workflow session: ${workflowName}`);
    
    this.currentSession = {
      workflowName,
      currentStep: 1,
      startTime: Date.now(),
      tokensUsed: 0,
      validationCount: 0,
      tenantId: options.tenantId || 'default',
      userIntent: options.userIntent || '',
      estimatedSteps: options.estimatedSteps || 6
    };

    // Check if we have existing context
    const existingContext = await this.contextManager.restoreWorkflowState(
      workflowName, 
      this.currentSession.tenantId
    );

    if (existingContext.success) {
      console.log(`📂 Found existing session at step ${existingContext.data.current_step}`);
      
      this.currentSession.currentStep = existingContext.data.current_step;
      this.currentSession.tokensUsed = existingContext.data.metadata?.tokensUsed || 0;
      
      return {
        type: 'resume',
        message: `Resuming workflow "${workflowName}" from step ${existingContext.data.current_step}`,
        previousState: existingContext.data,
        nextSteps: this.getResumeGuidance(existingContext.data)
      };
    }

    // Start fresh session
    const initialState = {
      workflow: {
        workflow_meta: {
          id: workflowName,
          goal: options.userIntent || 'Workflow creation in progress',
          category: this.inferCategory(workflowName),
          complexity: 'medium',
          reuse_potential: 'high',
          tenant_aware: 'yes',
          tags: this.generateInitialTags(workflowName)
        },
        nodes: [],
        connections: {}
      },
      validationHistory: [],
      userDecisions: [],
      suggestedComponents: []
    };

    await this.saveCurrentState(initialState, { userIntent: options.userIntent });

    return {
      type: 'new',
      message: `Started new workflow session: "${workflowName}"`,
      suggestions: this.contextManager.getCreationSuggestions(workflowName),
      estimatedSteps: this.currentSession.estimatedSteps
    };
  }

  /**
   * Enhanced validation that automatically saves progress
   */
  async validateWithContext(partialWorkflow, stepInfo = {}) {
    console.log(`🔄 Validating step ${this.currentSession.currentStep} of ${this.currentSession.workflowName}`);
    
    const validationStart = Date.now();
    
    // Run the original validation
    const result = await this.validateInProgress(partialWorkflow, {
      sessionInfo: this.currentSession,
      stepInfo
    });

    // Enhanced result with context information
    result.session = {
      workflowName: this.currentSession.workflowName,
      currentStep: this.currentSession.currentStep,
      progress: Math.round((this.currentSession.currentStep / this.currentSession.estimatedSteps) * 100),
      elapsedTime: Date.now() - this.currentSession.startTime,
      validationCount: ++this.currentSession.validationCount
    };

    // Estimate tokens used (rough estimation)
    const complexity = this.estimateComplexity(partialWorkflow, result);
    const estimatedTokens = this.estimateTokens(complexity);
    this.currentSession.tokensUsed += estimatedTokens;
    
    result.session.tokensUsed = this.currentSession.tokensUsed;
    result.session.estimatedTokens = estimatedTokens;

    // Auto-save progress if significant changes
    if (this.shouldAutoSave(partialWorkflow, result)) {
      await this.saveCurrentState(
        {
          workflow: partialWorkflow,
          validationHistory: this.validationHistory,
          stepInfo,
          lastValidation: result
        },
        {
          validationCount: this.currentSession.validationCount,
          tokensUsed: this.currentSession.tokensUsed,
          lastStep: stepInfo
        }
      );
      
      result.autoSaved = true;
      console.log(`💾 Auto-saved progress for ${this.currentSession.workflowName}`);
    }

    // Add context-aware next steps
    result.contextualNextSteps = this.getContextualNextSteps(partialWorkflow, result);
    
    return result;
  }

  /**
   * Save current workflow state
   */
  async saveCurrentState(stateData, additionalMetadata = {}) {
    if (!this.currentSession.workflowName) {
      console.warn('⚠️ No active session to save');
      return { success: false, error: 'No active session' };
    }

    const metadata = {
      ...additionalMetadata,
      sessionId: `${this.currentSession.workflowName}_${Date.now()}`,
      userIntent: this.currentSession.userIntent,
      tenantId: this.currentSession.tenantId,
      estimatedSteps: this.currentSession.estimatedSteps,
      source: 'enhanced_claude_validator'
    };

    return await this.contextManager.saveWorkflowState(
      this.currentSession.workflowName,
      this.currentSession.currentStep,
      stateData,
      metadata
    );
  }

  /**
   * Manual save checkpoint
   */
  async saveCheckpoint(label = '') {
    console.log(`💾 Creating checkpoint: ${label}`);
    
    const checkpointData = {
      workflow: this.currentSession.currentWorkflow || {},
      validationHistory: this.validationHistory,
      sessionInfo: this.currentSession,
      checkpoint: {
        label,
        timestamp: new Date().toISOString(),
        step: this.currentSession.currentStep
      }
    };

    const result = await this.saveCurrentState(checkpointData, { 
      checkpointLabel: label,
      isManualCheckpoint: true 
    });

    if (result.success) {
      console.log(`✅ Checkpoint "${label}" saved`);
    }

    return result;
  }

  /**
   * Advance to next step
   */
  async advanceStep(stepDescription = '') {
    this.currentSession.currentStep++;
    
    console.log(`➡️ Advanced to step ${this.currentSession.currentStep}: ${stepDescription}`);
    
    // Auto-save on step advancement
    if (this.currentSession.currentWorkflow) {
      await this.saveCurrentState(
        { 
          workflow: this.currentSession.currentWorkflow,
          stepAdvancement: {
            previousStep: this.currentSession.currentStep - 1,
            currentStep: this.currentSession.currentStep,
            description: stepDescription,
            timestamp: new Date().toISOString()
          }
        },
        { stepDescription }
      );
    }

    return {
      newStep: this.currentSession.currentStep,
      progress: Math.round((this.currentSession.currentStep / this.currentSession.estimatedSteps) * 100),
      guidance: this.getStepGuidance(this.currentSession.currentStep)
    };
  }

  /**
   * Get guidance for resuming a workflow
   */
  getResumeGuidance(previousState) {
    const guidance = [];
    const step = previousState.current_step;
    const workflow = previousState.state_data?.workflow;

    guidance.push({
      priority: 'high',
      message: `Continue from step ${step}`,
      action: 'resume_validation'
    });

    if (workflow?.nodes?.length > 0) {
      guidance.push({
        priority: 'medium',
        message: `You have ${workflow.nodes.length} nodes configured`,
        action: 'review_nodes'
      });
    }

    if (previousState.state_data?.validationHistory?.length > 0) {
      const lastValidation = previousState.state_data.validationHistory.slice(-1)[0];
      if (lastValidation && lastValidation.issues?.length > 0) {
        guidance.push({
          priority: 'high',
          message: `${lastValidation.issues.length} validation issues need attention`,
          action: 'fix_issues'
        });
      }
    }

    return guidance;
  }

  /**
   * Get contextual next steps based on current progress
   */
  getContextualNextSteps(workflow, validationResult) {
    const steps = [];
    const currentStep = this.currentSession.currentStep;

    // Step-based guidance
    if (currentStep <= 2) {
      steps.push({
        priority: 'high',
        step: 'define_structure',
        message: 'Define workflow structure and goals',
        actions: ['Set workflow metadata', 'Choose trigger type', 'Plan data flow']
      });
    }

    if (currentStep >= 2 && currentStep <= 4) {
      steps.push({
        priority: 'high',
        step: 'add_nodes',
        message: 'Add and configure workflow nodes',
        actions: ['Add primary nodes', 'Configure parameters', 'Set up credentials']
      });
    }

    if (currentStep >= 4 && currentStep <= 6) {
      steps.push({
        priority: 'medium',
        step: 'connect_test',
        message: 'Connect nodes and test workflow',
        actions: ['Connect node outputs to inputs', 'Test with sample data', 'Handle errors']
      });
    }

    // Progress-based suggestions
    const nodeCount = workflow?.nodes?.length || 0;
    if (nodeCount === 0) {
      steps.push({
        priority: 'high',
        step: 'first_node',
        message: 'Add your first workflow node',
        suggestion: 'Start with a trigger node or data input'
      });
    } else if (nodeCount === 1) {
      steps.push({
        priority: 'medium',
        step: 'second_node',
        message: 'Add processing or output node',
        suggestion: 'Add a node to process or output the data'
      });
    }

    return steps;
  }

  /**
   * Determine if we should auto-save
   */
  shouldAutoSave(workflow, validationResult) {
    // Always save on validation issues resolved
    if (validationResult.issues?.length === 0 && this.validationHistory.some(v => v.issues?.length > 0)) {
      return true;
    }

    // Save every 3 validations
    if (this.currentSession.validationCount % 3 === 0) {
      return true;
    }

    // Save when nodes are added
    if (workflow?.nodes?.length > (this.currentSession.lastNodeCount || 0)) {
      this.currentSession.lastNodeCount = workflow.nodes.length;
      return true;
    }

    return false;
  }

  /**
   * Estimate complexity for token calculation
   */
  estimateComplexity(workflow, validationResult) {
    let complexity = 1;

    if (workflow?.nodes) {
      complexity += workflow.nodes.length * 0.5;
    }

    if (validationResult?.issues) {
      complexity += validationResult.issues.length * 0.3;
    }

    if (validationResult?.suggestions) {
      complexity += validationResult.suggestions.length * 0.2;
    }

    return Math.max(1, complexity);
  }

  /**
   * Estimate tokens used (rough approximation)
   */
  estimateTokens(complexity) {
    const baseTokens = 150;
    const complexityMultiplier = complexity;
    return Math.round(baseTokens * complexityMultiplier);
  }

  /**
   * Get guidance for current step
   */
  getStepGuidance(step) {
    const guidance = {
      1: 'Define workflow purpose and structure',
      2: 'Add trigger node and configure inputs',
      3: 'Add processing nodes and configure logic',
      4: 'Connect nodes and define data flow',
      5: 'Add error handling and output nodes',
      6: 'Test workflow and finalize configuration'
    };

    return guidance[step] || 'Continue building your workflow';
  }

  /**
   * Infer category from workflow name
   */
  inferCategory(workflowName) {
    const categoryMap = {
      slack: 'communication',
      email: 'communication',
      api: 'data',
      http: 'data',
      webhook: 'data',
      validation: 'validation',
      content: 'content',
      seo: 'seo',
      social: 'social'
    };

    const lowerName = workflowName.toLowerCase();
    for (const [keyword, category] of Object.entries(categoryMap)) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }

    return 'utilities';
  }

  /**
   * Generate initial tags from workflow name
   */
  generateInitialTags(workflowName) {
    const tags = [];
    const commonTags = {
      slack: ['slack', 'communication', 'notification'],
      email: ['email', 'communication', 'notification'],
      api: ['api', 'integration', 'data'],
      http: ['http', 'request', 'api'],
      webhook: ['webhook', 'trigger', 'integration'],
      data: ['data', 'processing', 'transformation'],
      validation: ['validation', 'check', 'verify']
    };

    const lowerName = workflowName.toLowerCase();
    for (const [keyword, keywordTags] of Object.entries(commonTags)) {
      if (lowerName.includes(keyword)) {
        tags.push(...keywordTags);
      }
    }

    // Add automation tag
    tags.push('automation');

    // Remove duplicates
    return [...new Set(tags)];
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return {
      workflowName: this.currentSession.workflowName,
      currentStep: this.currentSession.currentStep,
      progress: Math.round((this.currentSession.currentStep / this.currentSession.estimatedSteps) * 100),
      elapsedTime: Date.now() - this.currentSession.startTime,
      validationCount: this.currentSession.validationCount,
      tokensUsed: this.currentSession.tokensUsed,
      estimatedCost: this.estimateCost(this.currentSession.tokensUsed)
    };
  }

  /**
   * Estimate cost based on tokens (rough calculation)
   */
  estimateCost(tokens) {
    // Rough estimate: $0.01 per 1000 tokens
    return (tokens / 1000) * 0.01;
  }

  /**
   * Enhanced CLI interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const validator = new EnhancedClaudeValidator();

    if (command === 'session') {
      const subCommand = args[1];
      
      if (subCommand === 'start') {
        const [workflowName, userIntent] = args.slice(2);
        
        if (!workflowName) {
          console.error('Usage: node enhanced-claude-validator.js session start <workflow-name> [user-intent]');
          process.exit(1);
        }

        try {
          const result = await validator.startWorkflowSession(workflowName, {
            userIntent: userIntent || `Create ${workflowName} workflow`
          });

          console.log(`\n🚀 ${result.message}`);
          
          if (result.type === 'resume') {
            console.log('\n📋 Next Steps:');
            result.nextSteps.forEach((step, i) => {
              console.log(`  ${i + 1}. [${step.priority?.toUpperCase()}] ${step.message}`);
            });
          } else {
            console.log('\n💡 Getting Started:');
            result.suggestions.forEach((suggestion, i) => {
              console.log(`  ${i + 1}. ${suggestion.description}`);
            });
          }

        } catch (error) {
          console.error('❌ Failed to start session:', error.message);
          process.exit(1);
        }

      } else if (subCommand === 'stats') {
        if (!validator.currentSession.workflowName) {
          console.log('❌ No active session');
          process.exit(1);
        }

        const stats = validator.getSessionStats();
        console.log('\n📊 Session Statistics:');
        console.log(`   Workflow: ${stats.workflowName}`);
        console.log(`   Step: ${stats.currentStep} (${stats.progress}% complete)`);
        console.log(`   Elapsed: ${Math.round(stats.elapsedTime / 1000)}s`);
        console.log(`   Validations: ${stats.validationCount}`);
        console.log(`   Tokens Used: ${stats.tokensUsed}`);
        console.log(`   Estimated Cost: $${stats.estimatedCost.toFixed(4)}`);

      } else if (subCommand === 'checkpoint') {
        const label = args.slice(2).join(' ') || 'Manual checkpoint';
        
        if (!validator.currentSession.workflowName) {
          console.log('❌ No active session');
          process.exit(1);
        }

        const result = await validator.saveCheckpoint(label);
        if (result.success) {
          console.log(`✅ Checkpoint created: ${label}`);
        } else {
          console.log(`❌ Failed to create checkpoint: ${result.error}`);
        }

      } else {
        console.log('Session commands:');
        console.log('  session start <workflow-name> [user-intent]');
        console.log('  session stats');
        console.log('  session checkpoint [label]');
      }

    } else if (command === 'validate-enhanced') {
      const workflowFile = args[1];
      
      if (!workflowFile) {
        console.error('Usage: node enhanced-claude-validator.js validate-enhanced <workflow-file>');
        process.exit(1);
      }

      try {
        const workflow = JSON.parse(await fs.readFile(workflowFile, 'utf8'));
        
        // Auto-start session if needed
        if (!validator.currentSession.workflowName) {
          const workflowName = workflow.workflow_meta?.id || path.basename(workflowFile, '.json');
          await validator.startWorkflowSession(workflowName);
        }

        const result = await validator.validateWithContext(workflow);
        
        console.log('\n🔍 Enhanced Validation Results:');
        console.log(`✅ Valid: ${result.valid ? 'Yes' : 'No'}`);
        console.log(`🚦 Can Proceed: ${result.canProceed ? 'Yes' : 'No'}`);
        console.log(`📊 Session: Step ${result.session.currentStep} (${result.session.progress}%)`);
        console.log(`⏱️  Duration: ${result.duration}ms`);
        console.log(`💰 Tokens: ${result.session.estimatedTokens} (+${result.session.tokensUsed} total)`);
        
        if (result.autoSaved) {
          console.log('💾 Progress auto-saved');
        }

        if (result.issues.length > 0) {
          console.log('\n❌ Issues:');
          result.issues.forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.severity?.toUpperCase()}] ${issue.message}`);
          });
        }

        if (result.contextualNextSteps.length > 0) {
          console.log('\n📋 Next Steps:');
          result.contextualNextSteps.forEach((step, i) => {
            console.log(`  ${i + 1}. [${step.priority?.toUpperCase()}] ${step.message}`);
          });
        }

      } catch (error) {
        console.error('❌ Enhanced validation failed:', error.message);
        process.exit(1);
      }

    } else {
      console.log('Enhanced Claude Validator with Context Preservation');
      console.log('');
      console.log('Usage:');
      console.log('  session start <workflow-name> [user-intent]');
      console.log('  session stats');
      console.log('  session checkpoint [label]');
      console.log('  validate-enhanced <workflow-file>');
      console.log('');
      console.log('Examples:');
      console.log('  # Start a new workflow session');
      console.log('  node enhanced-claude-validator.js session start "slack-notification" "Send alerts to team"');
      console.log('');
      console.log('  # Validate with context tracking');
      console.log('  node enhanced-claude-validator.js validate-enhanced workflow.json');
      console.log('');
      console.log('  # Create a checkpoint');
      console.log('  node enhanced-claude-validator.js session checkpoint "nodes configured"');
    }
  }
}

// Export for module use
module.exports = {
  EnhancedClaudeValidator,
  startWorkflowSession: async (workflowName, options) => {
    const validator = new EnhancedClaudeValidator();
    return await validator.startWorkflowSession(workflowName, options);
  },
  validateWithContext: async (workflow, stepInfo) => {
    const validator = new EnhancedClaudeValidator();
    return await validator.validateWithContext(workflow, stepInfo);
  }
};

// Run CLI if called directly
if (require.main === module) {
  EnhancedClaudeValidator.runCLI().catch(console.error);
}
