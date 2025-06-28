// scripts/check-naming.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');

class NamingValidator {
    constructor() {
        this.approvedPrefixes = [
            'get', 'post', 'store', 'validate', 'transform', 'enrich',
            'summarize', 'classify', 'route', 'build', 'create',
            'generate', 'retry', 'utils'
        ];
        
        this.namingPattern = /^[a-z]+__[a-z]+__[a-z_]+$/;
        this.categories = ['content', 'validation', 'communication', 'data', 'seo', 'social', 'utilities'];
    }

    validateNaming(workflowPath) {
        const results = {
            file: workflowPath,
            valid: true,
            errors: [],
            warnings: []
        };

        try {
            const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
            const workflowId = workflow.workflow_meta?.id;
            
            if (!workflowId) {
                results.valid = false;
                results.errors.push({
                    type: 'MISSING_ID',
                    message: 'Missing workflow_meta.id field',
                    severity: 'error'
                });
                return results;
            }
            
            // Check naming pattern
            if (!this.namingPattern.test(workflowId)) {
                results.valid = false;
                results.errors.push({
                    type: 'INVALID_FORMAT',
                    message: `ID "${workflowId}" doesn't follow [function]__[tool]__[output] pattern`,
                    severity: 'error'
                });
            }
            
            // Check function prefix
            const functionPrefix = workflowId.split('__')[0];
            if (!this.approvedPrefixes.includes(functionPrefix)) {
                results.valid = false;
                results.errors.push({
                    type: 'INVALID_PREFIX',
                    message: `Function prefix "${functionPrefix}" not in approved list: ${this.approvedPrefixes.join(', ')}`,
                    severity: 'error'
                });
            }
            
            // Check file name matches workflow ID
            const expectedFileName = `${workflowId}.json`;
            const actualFileName = path.basename(workflowPath);
            if (actualFileName !== expectedFileName) {
                results.valid = false;
                results.errors.push({
                    type: 'FILE_NAME_MISMATCH',
                    message: `File name should be "${expectedFileName}", found "${actualFileName}"`,
                    severity: 'error'
                });
            }
            
            // Check category alignment
            const category = workflow.workflow_meta?.category;
            const pathCategory = workflowPath.split('/')[1]; // microflows/[category]/file.json
            
            if (category !== pathCategory) {
                results.warnings.push({
                    type: 'CATEGORY_MISMATCH',
                    message: `Workflow category "${category}" doesn't match directory "${pathCategory}"`,
                    severity: 'warning'
                });
            }
            
            // Check if category is valid
            if (!this.categories.includes(category)) {
                results.valid = false;
                results.errors.push({
                    type: 'INVALID_CATEGORY',
                    message: `Category "${category}" not in valid categories: ${this.categories.join(', ')}`,
                    severity: 'error'
                });
            }
            
            // Check tool name makes sense
            const toolName = workflowId.split('__')[1];
            this.validateToolName(toolName, workflow, results);
            
            // Check output description
            const outputName = workflowId.split('__')[2];
            this.validateOutputName(outputName, workflow, results);
            
        } catch (error) {
            results.valid = false;
            results.errors.push({
                type: 'PARSE_ERROR',
                message: `Invalid JSON: ${error.message}`,
                severity: 'error'
            });
        }

        return results;
    }

    validateToolName(toolName, workflow, results) {
        const implementation = workflow.implementation;
        
        // Common tool mappings
        const toolMappings = {
            'gpt': ['openai', 'chatgpt', 'gpt-4', 'gpt-3.5'],
            'supabase': ['supabase', 'postgres', 'database'],
            'slack': ['slack'],
            'email': ['email', 'smtp', 'gmail'],
            'http': ['http', 'api', 'rest'],
            'webhook': ['webhook'],
            'code': ['code', 'javascript', 'python'],
            'schema': ['ajv', 'jsonschema', 'validation']
        };
        
        // Check if tool name aligns with implementation
        if (implementation && implementation.n8n_nodes) {
            const nodeTypes = implementation.n8n_nodes.map(node => node.type.toLowerCase());
            const hasMatchingNode = toolMappings[toolName]?.some(mapping => 
                nodeTypes.some(nodeType => nodeType.includes(mapping))
            );
            
            if (!hasMatchingNode) {
                results.warnings.push({
                    type: 'TOOL_MISMATCH',
                    message: `Tool name "${toolName}" doesn't align with node types: ${nodeTypes.join(', ')}`,
                    severity: 'warning'
                });
            }
        }
    }

    validateOutputName(outputName, workflow, results) {
        // Check if output name is descriptive
        if (outputName.length < 3) {
            results.warnings.push({
                type: 'OUTPUT_TOO_SHORT',
                message: `Output name "${outputName}" should be more descriptive`,
                severity: 'warning'
            });
        }
        
        // Check for common anti-patterns
        const antiPatterns = ['data', 'result', 'output', 'response'];
        if (antiPatterns.includes(outputName)) {
            results.warnings.push({
                type: 'GENERIC_OUTPUT_NAME',
                message: `Output name "${outputName}" is too generic, be more specific`,
                severity: 'warning'
            });
        }
    }

    validateAll() {
        const workflowFiles = glob.sync('microflows/**/*.json');
        const results = {
            total: workflowFiles.length,
            passed: 0,
            failed: 0,
            warnings: 0,
            details: []
        };

        console.log(`🏷️  Validating naming conventions for ${workflowFiles.length} workflow(s)...\n`);

        workflowFiles.forEach(file => {
            const result = this.validateNaming(file);
            results.details.push(result);

            if (result.valid && result.errors.length === 0) {
                results.passed++;
                console.log(`✅ ${file}: NAMING PASSED ${result.warnings.length > 0 ? `(${result.warnings.length} warnings)` : ''}`);
            } else {
                results.failed++;
                console.log(`❌ ${file}: NAMING FAILED (${result.errors.length} errors, ${result.warnings.length} warnings)`);
                
                result.errors.forEach(error => {
                    console.log(`   🔴 ${error.type}: ${error.message}`);
                });
            }

            if (result.warnings.length > 0) {
                results.warnings += result.warnings.length;
                result.warnings.forEach(warning => {
                    console.log(`   🟡 ${warning.type}: ${warning.message}`);
                });
            }
        });

        console.log(`\n📊 Naming Validation Summary:`);
        console.log(`   Total: ${results.total}`);
        console.log(`   Passed: ${results.passed}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Warnings: ${results.warnings}`);

        return results.failed === 0;
    }

    // Generate naming suggestions
    generateSuggestions(description, category, tool) {
        const suggestions = [];
        
        // Function prefix suggestions based on description
        if (description.toLowerCase().includes('create') || description.toLowerCase().includes('generate')) {
            suggestions.push(`generate__${tool}__${this.sanitizeName(description)}`);
        }
        if (description.toLowerCase().includes('validate') || description.toLowerCase().includes('check')) {
            suggestions.push(`validate__${tool}__${this.sanitizeName(description)}`);
        }
        if (description.toLowerCase().includes('get') || description.toLowerCase().includes('fetch')) {
            suggestions.push(`get__${tool}__${this.sanitizeName(description)}`);
        }
        
        return suggestions;
    }
    
    sanitizeName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .substring(0, 20);
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new NamingValidator();
    const success = validator.validateAll();
    process.exit(success ? 0 : 1);
}

module.exports = NamingValidator;