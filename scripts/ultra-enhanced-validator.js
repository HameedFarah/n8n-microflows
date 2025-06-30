#!/usr/bin/env node

/**
 * Enhanced Claude Validator with Context + Smart Documentation Caching
 * Combines workflow state management with intelligent API call reduction
 */

const { EnhancedClaudeValidator } = require('./enhanced-claude-validator');
const { SmartDocumentationCache } = require('./docs-cache');

class UltraEnhancedValidator extends EnhancedClaudeValidator {
  constructor() {
    super();
    this.docsCache = new SmartDocumentationCache();
    this.cacheStats = {
      sessionsWithCache: 0,
      apiCallsAvoided: 0,
      tokensFromCache: 0
    };
  }

  /**
   * Enhanced node validation with smart documentation caching
   */
  async validateSingleNode(node, index, result) {
    const nodePrefix = `Node ${index}`;
    
    // Run basic validation first
    await super.validateSingleNode(node, index, result);
    
    // Get node documentation from cache if needed
    if (node.type && this.shouldFetchDocumentation(node, result)) {
      try {
        console.log(`📚 Getting cached docs for ${node.type}`);
        
        const docResult = await this.docsCache.getNodeDocumentation(node.type, {
          topic: this.inferDocumentationTopic(node, result),
          tokens: 5000 // Limit documentation size
        });

        if (docResult.source === 'cache') {
          this.cacheStats.apiCallsAvoided++;
          this.cacheStats.tokensFromCache += 2000; // Estimated tokens saved
        }

        if (docResult.data) {
          // Add documentation-based suggestions
          this.addDocumentationSuggestions(node, index, docResult.data, result);
          
          // Update validation result with cache info
          if (!result.cacheInfo) result.cacheInfo = {};
          result.cacheInfo[`node_${index}`] = {
            source: docResult.source,
            nodeType: node.type,
            cached: docResult.source === 'cache'
          };
        }

      } catch (error) {
        console.warn(`Documentation fetch failed for ${node.type}:`, error.message);
      }
    }
  }

  /**
   * Determine if we should fetch documentation for this node
   */
  shouldFetchDocumentation(node, result) {
    // Fetch docs if:
    // 1. Node has configuration issues
    const hasIssues = result.issues.some(issue => 
      issue.nodeIndex === result.issues.indexOf(result.issues.find(i => i.nodeIndex !== undefined))
    );
    
    // 2. Node has missing parameters
    const hasMinimalConfig = !node.parameters || Object.keys(node.parameters).length < 2;
    
    // 3. Node is commonly problematic
    const problematicNodes = [
      'nodes-base.slack',
      'nodes-base.googleSheets', 
      'nodes-base.httpRequest',
      'nodes-base.postgres'
    ];
    const isProblematic = problematicNodes.some(type => node.type.includes(type));

    return hasIssues || hasMinimalConfig || isProblematic;
  }

  /**
   * Infer what documentation topic we need
   */
  inferDocumentationTopic(node, result) {
    const issues = result.issues.filter(issue => issue.nodeIndex !== undefined);
    
    if (issues.some(issue => issue.code?.includes('CREDENTIAL'))) {
      return 'authentication';
    }
    
    if (issues.some(issue => issue.code?.includes('PARAMETER'))) {
      return 'parameters';
    }
    
    if (node.type.includes('slack')) {
      return 'slack-integration';
    }
    
    if (node.type.includes('http')) {
      return 'http-requests';
    }
    
    return 'general';
  }

  /**
   * Add suggestions based on cached documentation
   */
  addDocumentationSuggestions(node, index, documentation, result) {
    const nodePrefix = `Node ${index}`;
    
    // Parameter suggestions from documentation
    if (documentation.parameters) {
      const configuredParams = Object.keys(node.parameters || {});
      const availableParams = Object.keys(documentation.parameters);
      
      const missingImportant = availableParams.filter(param => 
        !configuredParams.includes(param) && 
        documentation.parameters[param].includes('required') // Simple check
      );
      
      missingImportant.forEach(param => {
        result.suggestions.push({
          type: 'documentation',
          source: 'cached_docs',
          message: `${nodePrefix}: Consider configuring ${param}`,
          suggestion: documentation.parameters[param],
          nodeIndex: index
        });
      });
    }

    // Example-based suggestions
    if (documentation.examples && documentation.examples.length > 0) {
      const example = documentation.examples[0]; // Use first example
      
      result.suggestions.push({
        type: 'example',
        source: 'cached_docs',
        message: `${nodePrefix}: Example configuration available`,
        suggestion: `Try: ${example.description}`,
        example: example.configuration,
        nodeIndex: index
      });
    }

    // Credential suggestions
    if (documentation.credentials && documentation.credentials.length > 0) {
      if (!node.credentials || Object.keys(node.credentials).length === 0) {
        result.suggestions.push({
          type: 'security',
          source: 'cached_docs',
          message: `${nodePrefix}: Authentication required`,
          suggestion: `Configure credentials: ${documentation.credentials.join(', ')}`,
          nodeIndex: index
        });
      }
    }
  }

  /**
   * Enhanced session start with documentation prefetching
   */
  async startWorkflowSession(workflowName, options = {}) {
    console.log(`🚀 Starting enhanced session with smart caching: ${workflowName}`);
    
    // Start the session normally
    const sessionResult = await super.startWorkflowSession(workflowName, options);
    
    // Prefetch relevant documentation based on workflow intent
    if (options.userIntent) {
      await this.prefetchRelevantDocs(options.userIntent);
    }
    
    // Track cache usage for this session
    this.cacheStats.sessionsWithCache++;
    
    return {
      ...sessionResult,
      cacheEnabled: true,
      prefetchCompleted: true
    };
  }

  /**
   * Prefetch documentation based on user intent
   */
  async prefetchRelevantDocs(userIntent) {
    const intentLower = userIntent.toLowerCase();
    const nodesToPrefetch = [];
    
    // Infer likely nodes from user intent
    if (intentLower.includes('slack') || intentLower.includes('notification')) {
      nodesToPrefetch.push('nodes-base.slack');
    }
    
    if (intentLower.includes('api') || intentLower.includes('http') || intentLower.includes('request')) {
      nodesToPrefetch.push('nodes-base.httpRequest');
    }
    
    if (intentLower.includes('email') || intentLower.includes('gmail')) {
      nodesToPrefetch.push('nodes-base.gmail');
    }
    
    if (intentLower.includes('sheet') || intentLower.includes('google')) {
      nodesToPrefetch.push('nodes-base.googleSheets');
    }
    
    if (intentLower.includes('database') || intentLower.includes('postgres') || intentLower.includes('sql')) {
      nodesToPrefetch.push('nodes-base.postgres');
    }
    
    if (intentLower.includes('webhook') || intentLower.includes('trigger')) {
      nodesToPrefetch.push('nodes-base.webhook');
    }

    // Always prefetch common nodes
    nodesToPrefetch.push('nodes-base.code', 'nodes-base.if');

    // Remove duplicates
    const uniqueNodes = [...new Set(nodesToPrefetch)];
    
    if (uniqueNodes.length > 0) {
      console.log(`📚 Prefetching docs for ${uniqueNodes.length} relevant nodes...`);
      
      for (const nodeType of uniqueNodes) {
        try {
          await this.docsCache.getNodeDocumentation(nodeType);
          // Small delay to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.warn(`Prefetch failed for ${nodeType}:`, error.message);
        }
      }
      
      console.log(`✅ Prefetch completed for ${uniqueNodes.length} nodes`);
    }
  }

  /**
   * Enhanced validation with cache statistics
   */
  async validateWithContext(partialWorkflow, stepInfo = {}) {
    const result = await super.validateWithContext(partialWorkflow, stepInfo);
    
    // Add cache statistics to result
    const cacheStats = await this.docsCache.getCacheStats();
    result.cacheStats = {
      ...cacheStats,
      sessionCacheUsage: this.cacheStats
    };
    
    return result;
  }

  /**
   * Get enhanced session statistics including cache performance
   */
  getEnhancedSessionStats() {
    const baseStats = this.getSessionStats();
    
    return {
      ...baseStats,
      cachePerformance: {
        apiCallsAvoided: this.cacheStats.apiCallsAvoided,
        tokensFromCache: this.cacheStats.tokensFromCache,
        estimatedSavings: (this.cacheStats.tokensFromCache / 1000) * 0.01
      }
    };
  }

  /**
   * Enhanced CLI interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const validator = new UltraEnhancedValidator();

    if (command === 'session-enhanced') {
      const subCommand = args[1];
      
      if (subCommand === 'start') {
        const [workflowName, userIntent] = args.slice(2);
        
        if (!workflowName) {
          console.error('Usage: node ultra-enhanced-validator.js session-enhanced start <workflow-name> [user-intent]');
          process.exit(1);
        }

        try {
          const result = await validator.startWorkflowSession(workflowName, {
            userIntent: userIntent || `Create ${workflowName} workflow`
          });

          console.log(`\n🚀 ${result.message}`);
          console.log(`📚 Cache enabled: ${result.cacheEnabled}`);
          console.log(`🔄 Prefetch completed: ${result.prefetchCompleted}`);
          
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
          console.error('❌ Failed to start enhanced session:', error.message);
          process.exit(1);
        }

      } else if (subCommand === 'stats') {
        if (!validator.currentSession.workflowName) {
          console.log('❌ No active session');
          process.exit(1);
        }

        const stats = validator.getEnhancedSessionStats();
        const cacheStats = await validator.docsCache.getCacheStats();
        
        console.log('\n📊 Enhanced Session Statistics:');
        console.log(`   Workflow: ${stats.workflowName}`);
        console.log(`   Step: ${stats.currentStep} (${stats.progress}% complete)`);
        console.log(`   Elapsed: ${Math.round(stats.elapsedTime / 1000)}s`);
        console.log(`   Validations: ${stats.validationCount}`);
        console.log(`   Tokens Used: ${stats.tokensUsed}`);
        console.log(`   Estimated Cost: $${stats.estimatedCost.toFixed(4)}`);
        
        console.log('\n📚 Cache Performance:');
        console.log(`   Hit Rate: ${cacheStats.hitRate}`);
        console.log(`   API Calls Avoided: ${stats.cachePerformance.apiCallsAvoided}`);
        console.log(`   Tokens from Cache: ${stats.cachePerformance.tokensFromCache}`);
        console.log(`   Cache Savings: $${stats.cachePerformance.estimatedSavings.toFixed(4)}`);
        console.log(`   Total Cache Size: ${cacheStats.cacheSize}`);

      } else {
        console.log('Enhanced session commands:');
        console.log('  session-enhanced start <workflow-name> [user-intent]');
        console.log('  session-enhanced stats');
      }

    } else if (command === 'validate-ultra') {
      const workflowFile = args[1];
      
      if (!workflowFile) {
        console.error('Usage: node ultra-enhanced-validator.js validate-ultra <workflow-file>');
        process.exit(1);
      }

      try {
        const workflow = JSON.parse(await require('fs').promises.readFile(workflowFile, 'utf8'));
        
        // Auto-start session if needed
        if (!validator.currentSession.workflowName) {
          const workflowName = workflow.workflow_meta?.id || require('path').basename(workflowFile, '.json');
          await validator.startWorkflowSession(workflowName);
        }

        const result = await validator.validateWithContext(workflow);
        
        console.log('\n🔍 Ultra-Enhanced Validation Results:');
        console.log(`✅ Valid: ${result.valid ? 'Yes' : 'No'}`);
        console.log(`🚦 Can Proceed: ${result.canProceed ? 'Yes' : 'No'}`);
        console.log(`📊 Session: Step ${result.session.currentStep} (${result.session.progress}%)`);
        console.log(`⏱️  Duration: ${result.duration}ms`);
        console.log(`💰 Tokens: ${result.session.estimatedTokens} (+${result.session.tokensUsed} total)`);
        
        if (result.cacheStats) {
          console.log(`📚 Cache: ${result.cacheStats.hitRate} hit rate, ${result.cacheStats.entryCount} entries`);
        }
        
        if (result.autoSaved) {
          console.log('💾 Progress auto-saved');
        }

        if (result.cacheInfo) {
          console.log('\n📚 Documentation Cache Usage:');
          Object.entries(result.cacheInfo).forEach(([nodeKey, info]) => {
            console.log(`  ${nodeKey}: ${info.nodeType} (${info.cached ? 'cached' : 'fresh'})`);
          });
        }

        if (result.issues.length > 0) {
          console.log('\n❌ Issues:');
          result.issues.forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.severity?.toUpperCase()}] ${issue.message}`);
            if (issue.source === 'cached_docs') {
              console.log(`     📚 From cached documentation`);
            }
          });
        }

        if (result.suggestions.length > 0) {
          console.log('\n💡 Suggestions:');
          result.suggestions.forEach((suggestion, i) => {
            console.log(`  ${i + 1}. ${suggestion.message}`);
            if (suggestion.source === 'cached_docs') {
              console.log(`     📚 ${suggestion.suggestion}`);
            }
          });
        }

      } catch (error) {
        console.error('❌ Ultra-enhanced validation failed:', error.message);
        process.exit(1);
      }

    } else if (command === 'cache') {
      // Delegate to docs cache CLI
      const cacheArgs = args.slice(1);
      process.argv = ['node', 'docs-cache.js', ...cacheArgs];
      await require('./docs-cache').SmartDocumentationCache.runCLI();

    } else {
      console.log('Ultra-Enhanced Claude Validator with Context + Smart Caching');
      console.log('');
      console.log('Usage:');
      console.log('  session-enhanced start <workflow-name> [user-intent]');
      console.log('  session-enhanced stats');
      console.log('  validate-ultra <workflow-file>');
      console.log('  cache <cache-command> [args...]');
      console.log('');
      console.log('Examples:');
      console.log('  # Start enhanced session with prefetching');
      console.log('  node ultra-enhanced-validator.js session-enhanced start "api-sync" "Sync data from external API"');
      console.log('');
      console.log('  # Validate with cache-enhanced suggestions');
      console.log('  node ultra-enhanced-validator.js validate-ultra workflow.json');
      console.log('');
      console.log('  # Check cache statistics');
      console.log('  node ultra-enhanced-validator.js cache stats');
      console.log('');
      console.log('  # View enhanced session stats');
      console.log('  node ultra-enhanced-validator.js session-enhanced stats');
    }
  }
}

// Export for module use
module.exports = {
  UltraEnhancedValidator,
  startEnhancedSession: async (workflowName, options) => {
    const validator = new UltraEnhancedValidator();
    return await validator.startWorkflowSession(workflowName, options);
  },
  validateWithCaching: async (workflow, stepInfo) => {
    const validator = new UltraEnhancedValidator();
    return await validator.validateWithContext(workflow, stepInfo);
  }
};

// Run CLI if called directly
if (require.main === module) {
  UltraEnhancedValidator.runCLI().catch(console.error);
}
