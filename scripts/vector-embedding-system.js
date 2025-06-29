/**
 * Enhanced Vector Embedding System
 * Provides comprehensive embedding generation and similarity search for workflow discovery
 */

const fs = require('fs').promises;
const path = require('path');

class VectorEmbeddingSystem {
    constructor() {
        this.embeddingDimension = 384; // Using sentence-transformers compatible dimension
        this.model = 'all-MiniLM-L6-v2'; // Lightweight sentence transformer model
        this.cacheDir = path.join(process.cwd(), '.cache', 'embeddings');
        this.embeddingCache = new Map();
        this.similarityThreshold = 0.75;
        
        this.initializeCache();
    }

    async initializeCache() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.warn('Failed to create embedding cache directory:', error);
        }
    }

    /**
     * Generate embeddings for workflow discovery and similarity search
     * @param {Array} workflows - Array of workflow objects to process
     * @returns {Promise<Array>} - Array of workflows with embeddings
     */
    async generateWorkflowEmbeddings(workflows = []) {
        console.log(`Generating embeddings for ${workflows.length} workflows...`);
        
        const processedWorkflows = [];
        
        for (const workflow of workflows) {
            try {
                const embedding = await this.createWorkflowEmbedding(workflow);
                
                processedWorkflows.push({
                    ...workflow,
                    embedding,
                    embeddings: {
                        combined: embedding,
                        goal: await this.createEmbedding(workflow.workflow_meta?.goal || ''),
                        description: await this.createEmbedding(this.buildWorkflowDescription(workflow)),
                        tags: await this.createEmbedding(workflow.workflow_meta?.tags?.join(' ') || ''),
                        category: await this.createEmbedding(workflow.workflow_meta?.category || '')
                    },
                    searchableText: this.createSearchableText(workflow),
                    lastEmbeddingUpdate: new Date().toISOString()
                });
                
                // Cache the embedding
                await this.cacheEmbedding(workflow.workflow_meta?.id, embedding);
                
            } catch (error) {
                console.error(`Failed to generate embedding for workflow ${workflow.workflow_meta?.id}:`, error);
                processedWorkflows.push(workflow); // Add without embedding
            }
        }
        
        console.log(`Successfully generated embeddings for ${processedWorkflows.length} workflows`);
        return processedWorkflows;
    }

    /**
     * Create comprehensive embedding for a workflow
     * @param {Object} workflow - Workflow object
     * @returns {Promise<Array>} - Embedding vector
     */
    async createWorkflowEmbedding(workflow) {
        // Check cache first
        const cachedEmbedding = await this.getCachedEmbedding(workflow.workflow_meta?.id);
        if (cachedEmbedding) {
            return cachedEmbedding;
        }

        // Combine multiple fields for rich semantic representation
        const textComponents = [
            workflow.workflow_meta?.goal || '',
            workflow.workflow_meta?.category || '',
            workflow.workflow_meta?.tags?.join(' ') || '',
            this.extractNodePurposes(workflow),
            this.extractWorkflowIntent(workflow),
            this.buildWorkflowDescription(workflow)
        ].filter(Boolean);

        const combinedText = textComponents.join(' ');
        return await this.createEmbedding(combinedText);
    }

    /**
     * Create embedding using local sentence transformer simulation
     * @param {string} text - Text to embed
     * @returns {Promise<Array>} - Embedding vector
     */
    async createEmbedding(text) {
        if (!text || text.trim() === '') {
            return Array(this.embeddingDimension).fill(0);
        }

        // Simulate sentence transformer embedding
        // In production, this would call actual embedding service (OpenAI, Hugging Face, etc.)
        const normalizedText = text.toLowerCase().trim();
        
        // Simple hash-based embedding simulation
        const words = this.tokenizeText(normalizedText);
        const embedding = Array(this.embeddingDimension).fill(0);
        
        // Create embedding based on word positions and frequencies
        words.forEach((word, index) => {
            const wordHash = this.hashString(word);
            const position = wordHash % this.embeddingDimension;
            const weight = 1 / (index + 1); // Give more weight to earlier words
            
            embedding[position] += weight;
            
            // Add some neighboring positions for semantic richness
            if (position > 0) embedding[position - 1] += weight * 0.5;
            if (position < this.embeddingDimension - 1) embedding[position + 1] += weight * 0.5;
        });
        
        // Normalize the embedding
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= magnitude;
            }
        }
        
        return embedding;
    }

    /**
     * Find reusable workflows using similarity search
     * @param {string} userRequest - User's request or description
     * @param {number} threshold - Similarity threshold (default: 0.75)
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Array>} - Array of similar workflows with scores
     */
    async findReusableWorkflows(userRequest, threshold = 0.75, limit = 10) {
        console.log(`Searching for workflows similar to: "${userRequest}"`);
        
        // Generate embedding for user request
        const queryEmbedding = await this.createEmbedding(userRequest);
        
        // Load all workflow embeddings
        const allWorkflows = await this.loadAllWorkflowEmbeddings();
        
        // Calculate similarities
        const similarities = [];
        
        for (const workflow of allWorkflows) {
            if (!workflow.embedding) continue;
            
            const similarity = this.calculateCosineSimilarity(queryEmbedding, workflow.embedding);
            
            if (similarity >= threshold) {
                similarities.push({
                    ...workflow,
                    similarity,
                    matchType: this.determineMatchType(similarity),
                    reuseRecommendation: this.generateReuseRecommendation(workflow, similarity)
                });
            }
        }
        
        // Sort by similarity and complexity (prefer simpler workflows)
        similarities.sort((a, b) => {
            const simDiff = b.similarity - a.similarity;
            if (Math.abs(simDiff) < 0.05) {
                // If similarities are close, prefer simpler workflows
                const complexityWeight = {
                    'simple': 0.1,
                    'medium': 0.05,
                    'complex': 0
                };
                return (complexityWeight[a.workflow_meta?.complexity] || 0) - 
                       (complexityWeight[b.workflow_meta?.complexity] || 0);
            }
            return simDiff;
        });
        
        const results = similarities.slice(0, limit);
        
        console.log(`Found ${results.length} similar workflows with threshold ${threshold}`);
        return results;
    }

    /**
     * Create searchable text representation of workflow
     * @param {Object} workflow - Workflow object
     * @returns {string} - Searchable text
     */
    createSearchableText(workflow) {
        const components = [
            workflow.workflow_meta?.goal,
            workflow.workflow_meta?.category,
            workflow.workflow_meta?.tags?.join(' '),
            this.extractNodeTypes(workflow).join(' '),
            this.extractNodePurposes(workflow),
            workflow.example?.explanation
        ].filter(Boolean);
        
        return components.join(' ').toLowerCase();
    }

    /**
     * Build comprehensive description of workflow
     * @param {Object} workflow - Workflow object
     * @returns {string} - Workflow description
     */
    buildWorkflowDescription(workflow) {
        const parts = [];
        
        if (workflow.workflow_meta?.goal) {
            parts.push(`Goal: ${workflow.workflow_meta.goal}`);
        }
        
        if (workflow.workflow_meta?.category) {
            parts.push(`Category: ${workflow.workflow_meta.category}`);
        }
        
        const nodeTypes = this.extractNodeTypes(workflow);
        if (nodeTypes.length > 0) {
            parts.push(`Uses: ${nodeTypes.join(', ')}`);
        }
        
        const purposes = this.extractNodePurposes(workflow);
        if (purposes) {
            parts.push(`Functions: ${purposes}`);
        }
        
        if (workflow.example?.explanation) {
            parts.push(`Example: ${workflow.example.explanation}`);
        }
        
        return parts.join('. ');
    }

    /**
     * Extract node types from workflow
     * @param {Object} workflow - Workflow object
     * @returns {Array} - Array of node types
     */
    extractNodeTypes(workflow) {
        const nodeTypes = new Set();
        
        if (workflow.implementation?.n8n_nodes) {
            workflow.implementation.n8n_nodes.forEach(node => {
                if (node.type) {
                    nodeTypes.add(node.type);
                }
            });
        }
        
        return Array.from(nodeTypes);
    }

    /**
     * Extract node purposes from workflow
     * @param {Object} workflow - Workflow object
     * @returns {string} - Combined node purposes
     */
    extractNodePurposes(workflow) {
        const purposes = [];
        
        if (workflow.implementation?.n8n_nodes) {
            workflow.implementation.n8n_nodes.forEach(node => {
                if (node.purpose) {
                    purposes.push(node.purpose);
                }
            });
        }
        
        return purposes.join(' ');
    }

    /**
     * Extract workflow intent from structure
     * @param {Object} workflow - Workflow object
     * @returns {string} - Workflow intent
     */
    extractWorkflowIntent(workflow) {
        const intents = [];
        
        // Determine intent from node types and configuration
        const nodeTypes = this.extractNodeTypes(workflow);
        
        if (nodeTypes.includes('Webhook')) {
            intents.push('webhook processing');
        }
        
        if (nodeTypes.includes('HTTP Request') || nodeTypes.includes('API')) {
            intents.push('API integration');
        }
        
        if (nodeTypes.includes('OpenAI') || nodeTypes.includes('Anthropic')) {
            intents.push('AI processing');
        }
        
        if (nodeTypes.includes('Gmail') || nodeTypes.includes('Email')) {
            intents.push('email automation');
        }
        
        if (nodeTypes.includes('Slack') || nodeTypes.includes('Discord')) {
            intents.push('messaging automation');
        }
        
        if (nodeTypes.includes('Code')) {
            intents.push('data processing');
        }
        
        return intents.join(' ');
    }

    /**
     * Calculate cosine similarity between two embeddings
     * @param {Array} embedding1 - First embedding vector
     * @param {Array} embedding2 - Second embedding vector
     * @returns {number} - Similarity score (0-1)
     */
    calculateCosineSimilarity(embedding1, embedding2) {
        if (embedding1.length !== embedding2.length) {
            throw new Error('Embedding dimensions must match');
        }
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }
        
        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        
        if (magnitude === 0) return 0;
        
        return dotProduct / magnitude;
    }

    /**
     * Determine type of match based on similarity score
     * @param {number} similarity - Similarity score
     * @returns {string} - Match type
     */
    determineMatchType(similarity) {
        if (similarity >= 0.9) return 'exact';
        if (similarity >= 0.8) return 'high';
        if (similarity >= 0.7) return 'medium';
        return 'low';
    }

    /**
     * Generate reuse recommendation based on workflow and similarity
     * @param {Object} workflow - Workflow object
     * @param {number} similarity - Similarity score
     * @returns {Object} - Reuse recommendation
     */
    generateReuseRecommendation(workflow, similarity) {
        const recommendation = {
            action: 'unknown',
            confidence: similarity,
            reasoning: '',
            modifications: []
        };
        
        if (similarity >= 0.9) {
            recommendation.action = 'use_directly';
            recommendation.reasoning = 'Very high similarity - workflow can be used with minimal or no changes';
        } else if (similarity >= 0.8) {
            recommendation.action = 'minor_modifications';
            recommendation.reasoning = 'High similarity - workflow needs minor parameter adjustments';
            recommendation.modifications = ['Update input parameters', 'Adjust output format if needed'];
        } else if (similarity >= 0.7) {
            recommendation.action = 'moderate_modifications';
            recommendation.reasoning = 'Good similarity - workflow structure is reusable with modifications';
            recommendation.modifications = ['Customize business logic', 'Update API endpoints', 'Modify data transformations'];
        } else {
            recommendation.action = 'use_as_reference';
            recommendation.reasoning = 'Some similarity - workflow can serve as a reference or starting point';
            recommendation.modifications = ['Significant customization needed', 'Use workflow pattern as template'];
        }
        
        return recommendation;
    }

    /**
     * Tokenize text for embedding generation
     * @param {string} text - Text to tokenize
     * @returns {Array} - Array of tokens
     */
    tokenizeText(text) {
        // Simple tokenization - in production, use proper NLP tokenizer
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .slice(0, 100); // Limit tokens for performance
    }

    /**
     * Generate hash for string
     * @param {string} str - String to hash
     * @returns {number} - Hash value
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Cache embedding to disk
     * @param {string} workflowId - Workflow ID
     * @param {Array} embedding - Embedding vector
     */
    async cacheEmbedding(workflowId, embedding) {
        if (!workflowId) return;
        
        try {
            const cacheFile = path.join(this.cacheDir, `${workflowId}.json`);
            await fs.writeFile(cacheFile, JSON.stringify({
                workflowId,
                embedding,
                timestamp: new Date().toISOString()
            }));
            
            this.embeddingCache.set(workflowId, embedding);
        } catch (error) {
            console.warn(`Failed to cache embedding for ${workflowId}:`, error);
        }
    }

    /**
     * Get cached embedding from disk
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Array|null>} - Cached embedding or null
     */
    async getCachedEmbedding(workflowId) {
        if (!workflowId) return null;
        
        // Check memory cache first
        if (this.embeddingCache.has(workflowId)) {
            return this.embeddingCache.get(workflowId);
        }
        
        try {
            const cacheFile = path.join(this.cacheDir, `${workflowId}.json`);
            const cacheData = await fs.readFile(cacheFile, 'utf8');
            const cached = JSON.parse(cacheData);
            
            // Check if cache is recent (within 7 days)
            const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            
            if (cacheAge < maxAge) {
                this.embeddingCache.set(workflowId, cached.embedding);
                return cached.embedding;
            }
        } catch (error) {
            // Cache miss or error - will generate new embedding
        }
        
        return null;
    }

    /**
     * Load all workflow embeddings from repository
     * @returns {Promise<Array>} - Array of workflows with embeddings
     */
    async loadAllWorkflowEmbeddings() {
        const workflowsWithEmbeddings = [];
        const microflowsDir = path.join(process.cwd(), 'microflows');
        
        try {
            const categories = await fs.readdir(microflowsDir);
            
            for (const category of categories) {
                const categoryPath = path.join(microflowsDir, category);
                const stat = await fs.stat(categoryPath);
                
                if (stat.isDirectory()) {
                    const files = await fs.readdir(categoryPath);
                    const jsonFiles = files.filter(file => file.endsWith('.json'));
                    
                    for (const file of jsonFiles) {
                        try {
                            const filePath = path.join(categoryPath, file);
                            const content = await fs.readFile(filePath, 'utf8');
                            const workflow = JSON.parse(content);
                            
                            if (workflow.workflow_meta?.id) {
                                const embedding = await this.createWorkflowEmbedding(workflow);
                                workflowsWithEmbeddings.push({
                                    ...workflow,
                                    embedding,
                                    filePath
                                });
                            }
                        } catch (error) {
                            console.warn(`Failed to load workflow from ${file}:`, error.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load workflows for embedding:', error);
        }
        
        return workflowsWithEmbeddings;
    }

    /**
     * Update embeddings for all workflows
     * @param {boolean} forceUpdate - Force update even if cached embeddings exist
     * @returns {Promise<Object>} - Update statistics
     */
    async updateAllEmbeddings(forceUpdate = false) {
        console.log('Updating embeddings for all workflows...');
        
        const workflows = await this.loadAllWorkflowEmbeddings();
        const stats = {
            total: workflows.length,
            updated: 0,
            cached: 0,
            errors: 0
        };
        
        for (const workflow of workflows) {
            try {
                if (forceUpdate || !await this.getCachedEmbedding(workflow.workflow_meta?.id)) {
                    await this.createWorkflowEmbedding(workflow);
                    stats.updated++;
                } else {
                    stats.cached++;
                }
            } catch (error) {
                console.error(`Failed to update embedding for ${workflow.workflow_meta?.id}:`, error);
                stats.errors++;
            }
        }
        
        console.log(`Embedding update complete:`, stats);
        return stats;
    }

    /**
     * Search workflows by category with similarity ranking
     * @param {string} category - Category to search in
     * @param {string} query - Search query
     * @param {number} limit - Maximum results
     * @returns {Promise<Array>} - Ranked workflows in category
     */
    async searchByCategory(category, query, limit = 5) {
        const queryEmbedding = await this.createEmbedding(query);
        const allWorkflows = await this.loadAllWorkflowEmbeddings();
        
        const categoryWorkflows = allWorkflows.filter(w => 
            w.workflow_meta?.category === category
        );
        
        const similarities = categoryWorkflows.map(workflow => ({
            ...workflow,
            similarity: this.calculateCosineSimilarity(queryEmbedding, workflow.embedding)
        }));
        
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    /**
     * Get embedding statistics and health metrics
     * @returns {Promise<Object>} - Embedding system statistics
     */
    async getEmbeddingStats() {
        const allWorkflows = await this.loadAllWorkflowEmbeddings();
        const categories = {};
        
        allWorkflows.forEach(workflow => {
            const category = workflow.workflow_meta?.category || 'unknown';
            categories[category] = (categories[category] || 0) + 1;
        });
        
        return {
            totalWorkflows: allWorkflows.length,
            workflowsByCategory: categories,
            embeddingDimension: this.embeddingDimension,
            model: this.model,
            cacheHits: this.embeddingCache.size,
            lastUpdated: new Date().toISOString()
        };
    }
}

module.exports = { VectorEmbeddingSystem };

// Export instance for direct use
module.exports.embeddingSystem = new VectorEmbeddingSystem();
