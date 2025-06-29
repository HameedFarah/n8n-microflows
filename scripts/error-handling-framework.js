/**
 * Enhanced Error Handling Framework
 * Provides structured error responses and natural language debugging for N8N workflows
 */

const fs = require('fs').promises;
const path = require('path');

class ErrorHandlingFramework {
    constructor() {
        this.errorCategories = {
            'VALIDATION_ERROR': {
                userMessage: 'The workflow configuration is invalid',
                debugInfo: 'Detailed technical error for developers',
                suggestedFix: 'Actionable steps to resolve',
                retryRecommended: true
            },
            'DEPENDENCY_ERROR': {
                userMessage: 'Required service unavailable',
                debugInfo: 'Which dependency failed and why',
                suggestedFix: 'Alternative workflows or manual steps',
                retryRecommended: false
            },
            'AUTHENTICATION_ERROR': {
                userMessage: 'Authentication failed',
                debugInfo: 'Credential or permission issue details',
                suggestedFix: 'Check credentials and permissions',
                retryRecommended: true
            },
            'RATE_LIMIT_ERROR': {
                userMessage: 'Too many requests',
                debugInfo: 'API rate limit exceeded',
                suggestedFix: 'Wait and retry automatically',
                retryRecommended: true
            },
            'DATA_FORMAT_ERROR': {
                userMessage: 'Invalid data format',
                debugInfo: 'Expected vs actual data structure',
                suggestedFix: 'Validate input data format',
                retryRecommended: false
            },
            'NETWORK_ERROR': {
                userMessage: 'Network connection failed',
                debugInfo: 'Connection timeout or unreachable service',
                suggestedFix: 'Check network connectivity',
                retryRecommended: true
            }
        };

        this.errorPatterns = {
            'Missing required field': 'VALIDATION_ERROR',
            'API rate limit exceeded': 'RATE_LIMIT_ERROR',
            'Authentication failed': 'AUTHENTICATION_ERROR',
            'Connection timeout': 'NETWORK_ERROR',
            'Invalid JSON schema': 'DATA_FORMAT_ERROR',
            'Service unavailable': 'DEPENDENCY_ERROR'
        };
    }

    /**
     * Generate user-friendly error message from technical error
     * @param {string} technicalError - Raw technical error message
     * @param {Object} workflowContext - Context about the workflow and execution
     * @returns {Object} - Structured error response
     */
    generateUserFriendlyError(technicalError, workflowContext = {}) {
        const errorType = this.categorizeError(technicalError);
        const category = this.errorCategories[errorType];
        
        const userFriendlyResponse = {
            userMessage: this.contextualizeMessage(category.userMessage, workflowContext),
            technicalDetails: this.sanitizeTechnicalError(technicalError),
            suggestedActions: this.generateSuggestedActions(errorType, technicalError, workflowContext),
            retryRecommended: category.retryRecommended,
            errorCode: errorType,
            timestamp: new Date().toISOString(),
            workflowId: workflowContext.workflowId || 'unknown',
            nodeId: workflowContext.nodeId || 'unknown'
        };

        return userFriendlyResponse;
    }

    /**
     * Convert technical errors to user-friendly explanations
     * @param {string} technicalError - Raw error message
     * @param {Object} workflowContext - Workflow execution context
     * @returns {Object} - Natural language explanation
     */
    generateNaturalLanguageExplanation(technicalError, workflowContext) {
        const errorPatterns = {
            'Missing required field': {
                explanation: 'The workflow needs additional information to run properly.',
                analogy: 'Think of it like a form where some required fields are empty.',
                nextSteps: ['Check the workflow inputs', 'Provide the missing information', 'Try running again']
            },
            'API rate limit exceeded': {
                explanation: 'Too many requests were sent too quickly to the external service.',
                analogy: 'Like calling someone too many times - they stopped answering for a while.',
                nextSteps: ['Wait a few minutes', 'The workflow will retry automatically', 'Consider adding delays between requests']
            },
            'Invalid JSON schema': {
                explanation: 'The data format doesn\'t match what the workflow expects.',
                analogy: 'Like trying to put a square peg in a round hole - the shapes don\'t match.',
                nextSteps: ['Check your input data format', 'Compare with the expected format', 'Adjust your data structure']
            },
            'Authentication failed': {
                explanation: 'The workflow couldn\'t verify its identity with the external service.',
                analogy: 'Like being asked for ID at a club but showing an expired license.',
                nextSteps: ['Check your API credentials', 'Verify permissions are correct', 'Update any expired tokens']
            },
            'Connection timeout': {
                explanation: 'The external service took too long to respond.',
                analogy: 'Like calling someone and they never pick up the phone.',
                nextSteps: ['Check if the service is online', 'Try again in a few minutes', 'Contact the service provider if it persists']
            }
        };

        const matchedPattern = Object.keys(errorPatterns).find(pattern => 
            technicalError.toLowerCase().includes(pattern.toLowerCase())
        );

        if (matchedPattern) {
            return {
                ...errorPatterns[matchedPattern],
                originalError: this.sanitizeTechnicalError(technicalError),
                context: this.buildContextualHelp(workflowContext)
            };
        }

        // Fallback for unknown errors
        return {
            explanation: 'Something unexpected happened while running the workflow.',
            analogy: 'Like encountering a roadblock on a familiar route.',
            nextSteps: ['Check the error details below', 'Try running the workflow again', 'Contact support if the issue persists'],
            originalError: this.sanitizeTechnicalError(technicalError),
            context: this.buildContextualHelp(workflowContext)
        };
    }

    /**
     * Categorize error based on content analysis
     * @param {string} errorMessage - Error message to categorize
     * @returns {string} - Error category
     */
    categorizeError(errorMessage) {
        const lowerError = errorMessage.toLowerCase();
        
        for (const [pattern, category] of Object.entries(this.errorPatterns)) {
            if (lowerError.includes(pattern.toLowerCase())) {
                return category;
            }
        }
        
        // Additional heuristic categorization
        if (lowerError.includes('timeout') || lowerError.includes('connection')) {
            return 'NETWORK_ERROR';
        }
        
        if (lowerError.includes('auth') || lowerError.includes('credential') || lowerError.includes('permission')) {
            return 'AUTHENTICATION_ERROR';
        }
        
        if (lowerError.includes('required') || lowerError.includes('missing') || lowerError.includes('invalid')) {
            return 'VALIDATION_ERROR';
        }
        
        if (lowerError.includes('rate') || lowerError.includes('limit') || lowerError.includes('quota')) {
            return 'RATE_LIMIT_ERROR';
        }
        
        if (lowerError.includes('json') || lowerError.includes('format') || lowerError.includes('schema')) {
            return 'DATA_FORMAT_ERROR';
        }
        
        // Default to validation error
        return 'VALIDATION_ERROR';
    }

    /**
     * Remove sensitive information from technical errors
     * @param {string} technicalError - Raw error message
     * @returns {string} - Sanitized error message
     */
    sanitizeTechnicalError(technicalError) {
        let sanitized = technicalError;
        
        // Remove potential API keys, tokens, passwords
        sanitized = sanitized.replace(/([a-zA-Z0-9_-]{20,})/g, '[REDACTED_TOKEN]');
        sanitized = sanitized.replace(/(password|pwd|secret|key)[=:]\s*[^\s,}]+/gi, '$1=[REDACTED]');
        sanitized = sanitized.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
        
        // Remove file paths that might contain usernames
        sanitized = sanitized.replace(/\/[^\/\s]+\/[^\/\s]+\/[^\/\s]+/g, '/[PATH_REDACTED]');
        
        // Limit length to prevent overwhelming users
        if (sanitized.length > 500) {
            sanitized = sanitized.substring(0, 500) + '... [truncated]';
        }
        
        return sanitized;
    }

    /**
     * Generate contextual suggested actions
     * @param {string} errorType - Type of error
     * @param {string} technicalError - Original error message
     * @param {Object} workflowContext - Workflow context
     * @returns {Array} - List of suggested actions
     */
    generateSuggestedActions(errorType, technicalError, workflowContext) {
        const baseActions = this.errorCategories[errorType]?.suggestedFix || 'Check the error details';
        const contextualActions = [];
        
        // Add specific actions based on workflow context
        if (workflowContext.nodeType) {
            contextualActions.push(`Check the ${workflowContext.nodeType} node configuration`);
        }
        
        if (workflowContext.lastSuccessfulNode) {
            contextualActions.push(`Review data from ${workflowContext.lastSuccessfulNode} node`);
        }
        
        // Add error-specific actions
        if (errorType === 'VALIDATION_ERROR') {
            contextualActions.push('Validate input data against the schema');
            contextualActions.push('Check required fields are provided');
        }
        
        if (errorType === 'AUTHENTICATION_ERROR') {
            contextualActions.push('Verify API credentials are current');
            contextualActions.push('Check service account permissions');
        }
        
        if (errorType === 'RATE_LIMIT_ERROR') {
            contextualActions.push('The workflow will retry automatically');
            contextualActions.push('Consider implementing exponential backoff');
        }
        
        if (errorType === 'DEPENDENCY_ERROR') {
            contextualActions.push('Check if the external service is operational');
            contextualActions.push('Look for alternative workflows or manual processes');
        }
        
        return [baseActions, ...contextualActions].filter(Boolean);
    }

    /**
     * Add context to error messages
     * @param {string} baseMessage - Base error message
     * @param {Object} workflowContext - Workflow execution context
     * @returns {string} - Contextualized message
     */
    contextualizeMessage(baseMessage, workflowContext) {
        let contextualMessage = baseMessage;
        
        if (workflowContext.workflowName) {
            contextualMessage += ` in workflow "${workflowContext.workflowName}"`;
        }
        
        if (workflowContext.stepName) {
            contextualMessage += ` at step "${workflowContext.stepName}"`;
        }
        
        return contextualMessage;
    }

    /**
     * Build contextual help based on workflow context
     * @param {Object} workflowContext - Workflow execution context
     * @returns {Object} - Contextual help information
     */
    buildContextualHelp(workflowContext) {
        const help = {
            workflowInfo: {},
            debugging: {},
            resources: []
        };
        
        if (workflowContext.workflowId) {
            help.workflowInfo.id = workflowContext.workflowId;
            help.resources.push(`Check workflow documentation for ${workflowContext.workflowId}`);
        }
        
        if (workflowContext.nodeType) {
            help.debugging.nodeType = workflowContext.nodeType;
            help.resources.push(`Review ${workflowContext.nodeType} node documentation`);
        }
        
        if (workflowContext.executionId) {
            help.debugging.executionId = workflowContext.executionId;
            help.resources.push('Check execution logs for more details');
        }
        
        // Add relevant documentation links
        help.resources.push('Visit the N8N documentation for troubleshooting');
        help.resources.push('Check the microflows repository for similar issues');
        
        return help;
    }

    /**
     * Log structured error for debugging and monitoring
     * @param {Object} errorResponse - Structured error response
     * @param {Object} workflowContext - Workflow context
     */
    async logStructuredError(errorResponse, workflowContext) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            errorCode: errorResponse.errorCode,
            workflowId: workflowContext.workflowId,
            nodeId: workflowContext.nodeId,
            executionId: workflowContext.executionId,
            userMessage: errorResponse.userMessage,
            technicalDetails: errorResponse.technicalDetails,
            context: workflowContext,
            retryRecommended: errorResponse.retryRecommended
        };
        
        // Log to console for development
        console.error('Workflow Error:', JSON.stringify(logEntry, null, 2));
        
        // In production, this would send to monitoring systems
        // await this.sendToMonitoring(logEntry);
    }

    /**
     * Generate debugging suggestions based on error patterns
     * @param {string} errorType - Type of error
     * @param {Object} workflowContext - Workflow context
     * @returns {Array} - List of debugging suggestions
     */
    generateDebuggingSuggestions(errorType, workflowContext) {
        const suggestions = [];
        
        switch (errorType) {
            case 'VALIDATION_ERROR':
                suggestions.push('Use the workflow validation tool to check configuration');
                suggestions.push('Review input schema requirements');
                suggestions.push('Test with minimal valid input data');
                break;
                
            case 'AUTHENTICATION_ERROR':
                suggestions.push('Test credentials independently');
                suggestions.push('Check credential expiration dates');
                suggestions.push('Verify service account permissions');
                break;
                
            case 'RATE_LIMIT_ERROR':
                suggestions.push('Monitor API usage in service dashboard');
                suggestions.push('Implement exponential backoff strategy');
                suggestions.push('Consider upgrading service plan if needed');
                break;
                
            case 'DEPENDENCY_ERROR':
                suggestions.push('Check service status pages');
                suggestions.push('Test connectivity to dependencies');
                suggestions.push('Have fallback workflows ready');
                break;
                
            case 'DATA_FORMAT_ERROR':
                suggestions.push('Validate data against expected schema');
                suggestions.push('Check data transformation steps');
                suggestions.push('Use debugging nodes to inspect data flow');
                break;
                
            case 'NETWORK_ERROR':
                suggestions.push('Check network connectivity');
                suggestions.push('Test with increased timeout values');
                suggestions.push('Monitor for intermittent connectivity issues');
                break;
        }
        
        return suggestions;
    }

    /**
     * Create error recovery workflow
     * @param {string} errorType - Type of error that occurred
     * @param {Object} workflowContext - Original workflow context
     * @returns {Object} - Recovery workflow definition
     */
    createErrorRecoveryWorkflow(errorType, workflowContext) {
        const recoveryWorkflow = {
            workflow_meta: {
                id: `recovery_${errorType.toLowerCase()}_${Date.now()}`,
                goal: `Recover from ${errorType} in workflow ${workflowContext.workflowId}`,
                category: 'utilities',
                complexity: 'simple',
                execution_time: '1-2 seconds',
                reuse_potential: 'high',
                tenant_aware: 'yes'
            },
            implementation: {
                primary_approach: 'code',
                n8n_nodes: []
            }
        };
        
        // Add recovery-specific nodes based on error type
        switch (errorType) {
            case 'RATE_LIMIT_ERROR':
                recoveryWorkflow.implementation.n8n_nodes.push({
                    type: 'Wait',
                    purpose: 'Wait before retry',
                    parameters: {
                        amount: 60,
                        unit: 'seconds'
                    }
                });
                break;
                
            case 'AUTHENTICATION_ERROR':
                recoveryWorkflow.implementation.n8n_nodes.push({
                    type: 'Code',
                    purpose: 'Refresh authentication token',
                    parameters: {
                        mode: 'runOnceForEachItem'
                    }
                });
                break;
                
            case 'NETWORK_ERROR':
                recoveryWorkflow.implementation.n8n_nodes.push({
                    type: 'Code',
                    purpose: 'Implement retry with exponential backoff',
                    parameters: {
                        mode: 'runOnceForEachItem'
                    }
                });
                break;
        }
        
        return recoveryWorkflow;
    }
}

module.exports = { ErrorHandlingFramework };

// Export instance for direct use
module.exports.errorHandler = new ErrorHandlingFramework();
