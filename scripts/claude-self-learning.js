/**
 * Claude Desktop Self-Learning Module
 * Provides GitHub integration functions for Claude to check existing workflows,
 * analyze workflow structures, and suggest workflow updates for reusability.
 */

const fs = require('fs').promises;
const path = require('path');
const { createHash } = require('crypto');

class ClaudeSelfLearningModule {
    constructor() {
        this.workflowCache = new Map();
        this.similarityThreshold = 0.8;
    }

    /**
     * Search for existing workflows similar to a task description
     * @param {string} taskDescription - Description of the task needed
     * @returns {Promise<Array>} - Array of potentially reusable workflows
     */
    async searchExistingWorkflows(taskDescription) {
        try {
            // 1. Query GitHub API for similar workflows
            const workflowFiles = await this.getAllWorkflowFiles();
            const workflows = await this.loadWorkflowMetadata(workflowFiles);
            
            // 2. Use vector similarity search on descriptions
            const queryEmbedding = await this.createEmbedding(taskDescription);
            const similar = await this.searchSimilarEmbeddings(queryEmbedding, this.similarityThreshold);
            
            // 3. Return list of potentially reusable workflows
            return similar.filter(workflow => workflow.reuse_potential === "high");
        } catch (error) {
            console.error('Error searching existing workflows:', error);
            return [];
        }
    }

    /**
     * Analyze workflow structure to identify patterns and reusable components
     * @param {string} workflowId - The workflow ID to analyze
     * @returns {Promise<Object>} - Analysis results with patterns and dependencies
     */
    async analyzeWorkflowStructure(workflowId) {
        try {
            // 1. Fetch workflow JSON from GitHub
            const workflowPath = await this.findWorkflowPath(workflowId);
            const workflowData = await this.readWorkflowFile(workflowPath);
            
            // 2. Extract patterns and reusable components
            const analysis = {
                nodeTypes: this.extractNodeTypes(workflowData),
                patterns: this.identifyPatterns(workflowData),
                dependencies: this.analyzeDependencies(workflowData),
                complexity: this.calculateComplexity(workflowData),
                reuseScore: this.calculateReuseScore(workflowData)
            };
            
            // 3. Identify dependencies and relationships
            analysis.relationships = await this.findRelatedWorkflows(workflowData);
            
            return analysis;
        } catch (error) {
            console.error('Error analyzing workflow structure:', error);
            throw error;
        }
    }

    /**
     * Suggest workflow updates vs creating new workflow
     * @param {string} existingId - Existing workflow ID
     * @param {Object} newRequirements - New requirements to compare
     * @returns {Promise<Object>} - Recommendation for modification vs new creation
     */
    async suggestWorkflowUpdates(existingId, newRequirements) {
        try {
            // 1. Compare existing workflow with new needs
            const existing = await this.analyzeWorkflowStructure(existingId);
            const compatibility = this.assessCompatibility(existing, newRequirements);
            
            // 2. Suggest modifications vs creating new workflow
            const recommendation = {
                action: compatibility.score > 0.7 ? 'modify' : 'create_new',
                modifications: compatibility.score > 0.7 ? compatibility.suggestions : [],
                reasoning: compatibility.reasoning,
                backwardCompatibility: compatibility.backwardCompatible,
                estimatedEffort: this.estimateModificationEffort(compatibility)
            };
            
            // 3. Ensure backward compatibility
            if (recommendation.action === 'modify') {
                recommendation.compatibilityPlan = await this.createCompatibilityPlan(existingId, newRequirements);
            }
            
            return recommendation;
        } catch (error) {
            console.error('Error suggesting workflow updates:', error);
            throw error;
        }
    }

    // Helper methods for workflow analysis

    async getAllWorkflowFiles() {
        const microflowsDir = path.join(process.cwd(), 'microflows');
        const categories = await fs.readdir(microflowsDir);
        const allFiles = [];

        for (const category of categories) {
            const categoryPath = path.join(microflowsDir, category);
            const stat = await fs.stat(categoryPath);
            
            if (stat.isDirectory()) {
                const files = await fs.readdir(categoryPath);
                const jsonFiles = files.filter(file => file.endsWith('.json'));
                allFiles.push(...jsonFiles.map(file => path.join(categoryPath, file)));
            }
        }

        return allFiles;
    }

    async loadWorkflowMetadata(filePaths) {
        const workflows = [];
        
        for (const filePath of filePaths) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const workflow = JSON.parse(content);
                
                if (workflow.workflow_meta) {
                    workflows.push({
                        id: workflow.workflow_meta.id,
                        path: filePath,
                        metadata: workflow.workflow_meta,
                        reuse_potential: workflow.reuse_info?.reuse_potential || 'medium'
                    });
                }
            } catch (error) {
                console.warn(`Failed to load workflow from ${filePath}:`, error.message);
            }
        }

        return workflows;
    }

    async createEmbedding(text) {
        // Placeholder for actual embedding generation
        // In real implementation, this would call OpenAI or similar service
        const hash = createHash('md5').update(text.toLowerCase()).digest('hex');
        
        // Simple text similarity based on common words
        const words = text.toLowerCase().split(/\s+/);
        const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const meaningfulWords = words.filter(word => !commonWords.includes(word));
        
        return {
            text,
            hash,
            keywords: meaningfulWords.slice(0, 10),
            wordCount: words.length
        };
    }

    async searchSimilarEmbeddings(queryEmbedding, threshold) {
        const workflows = await this.getAllWorkflowFiles();
        const workflowData = await this.loadWorkflowMetadata(workflows);
        const similarities = [];

        for (const workflow of workflowData) {
            const workflowText = `${workflow.metadata.goal} ${workflow.metadata.category} ${workflow.metadata.tags?.join(' ') || ''}`;
            const workflowEmbedding = await this.createEmbedding(workflowText);
            
            const similarity = this.calculateSimilarity(queryEmbedding, workflowEmbedding);
            
            if (similarity >= threshold) {
                similarities.push({
                    ...workflow,
                    similarity,
                    matchedKeywords: this.getMatchedKeywords(queryEmbedding, workflowEmbedding)
                });
            }
        }

        return similarities.sort((a, b) => b.similarity - a.similarity);
    }

    calculateSimilarity(embedding1, embedding2) {
        const keywords1 = new Set(embedding1.keywords);
        const keywords2 = new Set(embedding2.keywords);
        
        const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
        const union = new Set([...keywords1, ...keywords2]);
        
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    getMatchedKeywords(embedding1, embedding2) {
        const keywords1 = new Set(embedding1.keywords);
        const keywords2 = new Set(embedding2.keywords);
        
        return [...keywords1].filter(x => keywords2.has(x));
    }

    extractNodeTypes(workflowData) {
        const nodeTypes = new Set();
        
        if (workflowData.implementation?.n8n_nodes) {
            workflowData.implementation.n8n_nodes.forEach(node => {
                nodeTypes.add(node.type);
            });
        }
        
        return Array.from(nodeTypes);
    }

    identifyPatterns(workflowData) {
        const patterns = [];
        
        // Identify common patterns
        const nodeTypes = this.extractNodeTypes(workflowData);
        
        if (nodeTypes.includes('Code') && nodeTypes.includes('HTTP Request')) {
            patterns.push('api_processing');
        }
        
        if (nodeTypes.includes('Webhook') && nodeTypes.includes('Code')) {
            patterns.push('webhook_handler');
        }
        
        if (nodeTypes.includes('OpenAI') || nodeTypes.includes('Anthropic')) {
            patterns.push('ai_enhanced');
        }
        
        return patterns;
    }

    analyzeDependencies(workflowData) {
        const dependencies = {
            external_services: [],
            internal_workflows: [],
            required_credentials: []
        };
        
        if (workflowData.workflow_meta?.dependencies) {
            dependencies.external_services = workflowData.workflow_meta.dependencies;
        }
        
        if (workflowData.implementation?.n8n_nodes) {
            workflowData.implementation.n8n_nodes.forEach(node => {
                if (node.credentials) {
                    dependencies.required_credentials.push(node.credentials);
                }
            });
        }
        
        return dependencies;
    }

    calculateComplexity(workflowData) {
        const nodeCount = workflowData.implementation?.n8n_nodes?.length || 0;
        const hasAI = this.identifyPatterns(workflowData).includes('ai_enhanced');
        const hasAPI = this.identifyPatterns(workflowData).includes('api_processing');
        
        let complexity = 'simple';
        
        if (nodeCount > 10 || hasAI) {
            complexity = 'complex';
        } else if (nodeCount > 5 || hasAPI) {
            complexity = 'medium';
        }
        
        return complexity;
    }

    calculateReuseScore(workflowData) {
        let score = 0.5; // Base score
        
        // Higher score for well-documented workflows
        if (workflowData.workflow_meta?.goal) score += 0.1;
        if (workflowData.example) score += 0.1;
        
        // Higher score for parameterized workflows
        if (workflowData.inputs?.schema?.properties) {
            const paramCount = Object.keys(workflowData.inputs.schema.properties).length;
            score += Math.min(paramCount * 0.05, 0.2);
        }
        
        // Lower score for hardcoded values
        const nodeCount = workflowData.implementation?.n8n_nodes?.length || 0;
        if (nodeCount > 15) score -= 0.1; // Very complex workflows harder to reuse
        
        return Math.max(0, Math.min(1, score));
    }

    assessCompatibility(existing, newRequirements) {
        const compatibility = {
            score: 0,
            suggestions: [],
            reasoning: '',
            backwardCompatible: true
        };
        
        // Compare node types
        const existingNodes = new Set(existing.nodeTypes);
        const requiredNodes = new Set(newRequirements.nodeTypes || []);
        
        const commonNodes = new Set([...existingNodes].filter(x => requiredNodes.has(x)));
        const nodeCompatibility = commonNodes.size / Math.max(existingNodes.size, requiredNodes.size);
        
        compatibility.score = nodeCompatibility;
        
        if (nodeCompatibility > 0.7) {
            compatibility.reasoning = 'High node type compatibility, modification recommended';
            compatibility.suggestions.push('Add missing node types');
            compatibility.suggestions.push('Parameterize hardcoded values');
        } else {
            compatibility.reasoning = 'Low compatibility, new workflow recommended';
            compatibility.backwardCompatible = false;
        }
        
        return compatibility;
    }

    estimateModificationEffort(compatibility) {
        if (compatibility.score > 0.9) return 'low';
        if (compatibility.score > 0.7) return 'medium';
        return 'high';
    }

    async createCompatibilityPlan(existingId, newRequirements) {
        return {
            versionStrategy: 'create_v2',
            migrationPath: [
                'Create backup of existing workflow',
                'Add new parameters with defaults',
                'Test backward compatibility',
                'Update documentation'
            ],
            testingRequired: true,
            rollbackPlan: 'Keep v1 available for 6 months'
        };
    }

    async findRelatedWorkflows(workflowData) {
        // Find workflows that share common patterns or dependencies
        const patterns = this.identifyPatterns(workflowData);
        const allWorkflows = await this.getAllWorkflowFiles();
        const related = [];
        
        for (const filePath of allWorkflows.slice(0, 10)) { // Limit for performance
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const otherWorkflow = JSON.parse(content);
                const otherPatterns = this.identifyPatterns(otherWorkflow);
                
                const commonPatterns = patterns.filter(p => otherPatterns.includes(p));
                if (commonPatterns.length > 0) {
                    related.push({
                        id: otherWorkflow.workflow_meta?.id,
                        path: filePath,
                        commonPatterns
                    });
                }
            } catch (error) {
                // Skip problematic files
            }
        }
        
        return related;
    }

    async findWorkflowPath(workflowId) {
        const allFiles = await this.getAllWorkflowFiles();
        
        for (const filePath of allFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const workflow = JSON.parse(content);
                
                if (workflow.workflow_meta?.id === workflowId) {
                    return filePath;
                }
            } catch (error) {
                continue;
            }
        }
        
        throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    async readWorkflowFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    }
}

module.exports = { ClaudeSelfLearningModule };

// Export instance for direct use
module.exports.claudeLearning = new ClaudeSelfLearningModule();
