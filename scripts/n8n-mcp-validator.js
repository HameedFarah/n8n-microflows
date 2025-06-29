// scripts/n8n-mcp-validator.js
const { validateNodeOperation, validateNodeMinimal } = require('n8n-mcp');

class N8nMcpValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    async validateWorkflowNodes(workflow) {
        const results = {
            valid: true,
            nodeValidations: [],
            errors: [],
            warnings: []
        };

        for (const node of workflow.implementation.n8n_nodes) {
            const nodeResult = await this.validateSingleNode(node);
            results.nodeValidations.push(nodeResult);
            
            if (!nodeResult.valid) {
                results.valid = false;
                results.errors.push(...nodeResult.errors);
            }
            
            results.warnings.push(...nodeResult.warnings);
        }

        return results;
    }

    async validateSingleNode(node) {
        const result = {
            nodeType: node.type,
            valid: true,
            errors: [],
            warnings: [],
            suggestions: []
        };

        try {
            // Use N8N MCP tools for validation
            const validation = await validateNodeOperation(node.type, {
                ...node.parameters,
                operation: node.operation || 'default'
            });

            if (!validation.valid) {
                result.valid = false;
                result.errors = validation.errors || [];
                result.warnings = validation.warnings || [];
                result.suggestions = validation.suggestions || [];
            }

            // Additional checks for workflow-specific requirements
            this.validateNodeForWorkflow(node, result);

        } catch (error) {
            result.valid = false;
            result.errors.push({
                type: 'MCP_VALIDATION_ERROR',
                message: `Failed to validate node ${node.type}: ${error.message}`,
                severity: 'error'
            });
        }

        return result;
    }

    validateNodeForWorkflow(node, result) {
        // Check timeout configuration
        if (!node.timeout || node.timeout < 1000) {
            result.warnings.push({
                type: 'TIMEOUT_WARNING',
                message: 'Node should have a timeout >= 1000ms',
                severity: 'warning'
            });
        }

        // Check error handling
        if (!node.error_handling || !node.error_handling.strategy) {
            result.errors.push({
                type: 'ERROR_HANDLING_MISSING',
                message: 'Node must have error handling strategy defined',
                severity: 'error'
            });
        }

        // Check credentials for nodes that require them
        const credentialNodes = ['slack', 'gmail', 'openai', 'supabase', 'postgres'];
        if (credentialNodes.some(cred => node.type.toLowerCase().includes(cred))) {
            if (!node.credentials) {
                result.warnings.push({
                    type: 'CREDENTIALS_WARNING',
                    message: `Node ${node.type} should specify credentials`,
                    severity: 'warning'
                });
            }
        }
    }

    async validateWorkflowCompatibility(workflow) {
        const results = {
            compatible: true,
            issues: [],
            recommendations: []
        };

        // Check for node compatibility issues
        const nodeTypes = workflow.implementation.n8n_nodes.map(n => n.type);
        const incompatiblePairs = this.getIncompatibleNodePairs();

        for (const pair of incompatiblePairs) {
            if (nodeTypes.includes(pair.node1) && nodeTypes.includes(pair.node2)) {
                results.compatible = false;
                results.issues.push({
                    type: 'INCOMPATIBLE_NODES',
                    message: `Nodes ${pair.node1} and ${pair.node2} may have compatibility issues: ${pair.reason}`,
                    severity: 'warning'
                });
            }
        }

        // Check workflow flow and connections
        this.validateWorkflowFlow(workflow, results);

        return results;
    }

    getIncompatibleNodePairs() {
        return [
            {
                node1: 'OpenAI',
                node2: 'Wait',
                reason: 'OpenAI API calls should not be followed immediately by Wait nodes without proper error handling'
            },
            {
                node1: 'HTTP Request',
                node2: 'HTTP Request',
                reason: 'Multiple consecutive HTTP requests may cause rate limiting issues'
            },
            {
                node1: 'Supabase',
                node2: 'Postgres',
                reason: 'Using both Supabase and direct Postgres connections may cause conflicts'
            }
        ];
    }

    validateWorkflowFlow(workflow, results) {
        const nodes = workflow.implementation.n8n_nodes;
        
        // Check if workflow has proper start and end nodes
        const hasStartNode = nodes.some(node => 
            ['Webhook', 'Trigger', 'Manual Trigger', 'Schedule Trigger'].includes(node.type)
        );
        
        if (!hasStartNode) {
            results.issues.push({
                type: 'MISSING_START_NODE',
                message: 'Workflow should have a trigger or start node',
                severity: 'warning'
            });
        }

        // Check for proper data flow
        nodes.forEach((node, index) => {
            if (node.type === 'Code' && index === 0) {
                results.recommendations.push({
                    type: 'CODE_NODE_POSITION',
                    message: 'Consider moving Code nodes away from the beginning for better debugging',
                    severity: 'info'
                });
            }
        });
    }

    async validateWorkflowWithMcp(workflowPath) {
        try {
            const workflow = JSON.parse(require('fs').readFileSync(workflowPath, 'utf8'));
            
            // Validate using N8N MCP tools
            const nodeValidation = await this.validateWorkflowNodes(workflow);
            const compatibilityValidation = await this.validateWorkflowCompatibility(workflow);

            return {
                valid: nodeValidation.valid && compatibilityValidation.compatible,
                nodeValidation,
                compatibilityValidation,
                file: workflowPath
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message,
                file: workflowPath
            };
        }
    }

    generateMcpValidationReport(results) {
        const report = {
            summary: {
                totalWorkflows: results.length,
                validWorkflows: results.filter(r => r.valid).length,
                invalidWorkflows: results.filter(r => !r.valid).length
            },
            details: results,
            recommendations: []
        };

        // Generate recommendations based on common issues
        const commonIssues = this.analyzeCommonIssues(results);
        report.recommendations = this.generateRecommendations(commonIssues);

        return report;
    }

    analyzeCommonIssues(results) {
        const issues = {};
        
        results.forEach(result => {
            if (result.nodeValidation) {
                result.nodeValidation.errors.forEach(error => {
                    issues[error.type] = (issues[error.type] || 0) + 1;
                });
            }
        });

        return issues;
    }

    generateRecommendations(commonIssues) {
        const recommendations = [];
        
        if (commonIssues.ERROR_HANDLING_MISSING) {
            recommendations.push({
                issue: 'Missing error handling',
                count: commonIssues.ERROR_HANDLING_MISSING,
                suggestion: 'Add error handling strategies to all nodes with retry, fallback, or fail strategies'
            });
        }

        if (commonIssues.TIMEOUT_WARNING) {
            recommendations.push({
                issue: 'Missing or low timeouts',
                count: commonIssues.TIMEOUT_WARNING,
                suggestion: 'Set appropriate timeouts (>= 1000ms) for all nodes to prevent hanging'
            });
        }

        if (commonIssues.CREDENTIALS_WARNING) {
            recommendations.push({
                issue: 'Missing credentials',
                count: commonIssues.CREDENTIALS_WARNING,
                suggestion: 'Specify credential names for nodes that require authentication'
            });
        }

        return recommendations;
    }
}

module.exports = N8nMcpValidator;