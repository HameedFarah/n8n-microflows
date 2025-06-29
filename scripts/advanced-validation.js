// scripts/advanced-validation.js
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

class WorkflowValidator {
    constructor() {
        this.ajv = new Ajv({ 
            allErrors: true, 
            verbose: true,
            strict: false 
        });
        addFormats(this.ajv);
        
        // Load workflow schema
        const schemaPath = path.join(__dirname, '../schemas/complete-workflow-schema.json');
        this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        this.validate = this.ajv.compile(this.schema);
        
        this.errors = [];
        this.warnings = [];
    }

    validateWorkflow(workflowPath) {
        const results = {
            file: workflowPath,
            valid: true,
            errors: [],
            warnings: [],
            performance: {}
        };

        try {
            const startTime = Date.now();
            const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
            
            // 1. JSON Schema Validation
            const schemaValid = this.validate(workflow);
            if (!schemaValid) {
                results.valid = false;
                results.errors.push(...this.formatValidationErrors(this.validate.errors));
            }

            // 2. Business Logic Validation
            this.validateBusinessRules(workflow, results);

            // 3. Security Validation
            this.validateSecurity(workflow, results);

            // 4. Performance Validation
            this.validatePerformance(workflow, results);

            // 5. Tenant Isolation Validation
            this.validateTenantIsolation(workflow, results);

            // 6. Documentation Completeness
            this.validateDocumentation(workflow, results);

            results.performance.validation_time_ms = Date.now() - startTime;

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

    formatValidationErrors(errors) {
        return errors.map(error => ({
            type: 'SCHEMA_VALIDATION',
            path: error.instancePath,
            message: error.message,
            value: error.data,
            severity: 'error'
        }));
    }

    validateBusinessRules(workflow, results) {
        const meta = workflow.workflow_meta;
        
        // Check function prefix alignment
        const approvedPrefixes = [
            'get', 'post', 'store', 'validate', 'transform', 'enrich',
            'summarize', 'classify', 'route', 'build', 'create',
            'generate', 'retry', 'utils'
        ];
        
        const functionPrefix = meta.id.split('__')[0];
        if (!approvedPrefixes.includes(functionPrefix)) {
            results.errors.push({
                type: 'BUSINESS_RULE',
                message: `Function prefix "${functionPrefix}" not in approved list`,
                severity: 'error'
            });
        }

        // Check complexity vs node count alignment
        const nodeCount = workflow.implementation.n8n_nodes.length;
        const complexity = meta.complexity;
        
        if (complexity === 'simple' && nodeCount > 3) {
            results.warnings.push({
                type: 'COMPLEXITY_MISMATCH',
                message: `Simple workflows should have ≤3 nodes, found ${nodeCount}`,
                severity: 'warning'
            });
        } else if (complexity === 'medium' && (nodeCount < 3 || nodeCount > 8)) {
            results.warnings.push({
                type: 'COMPLEXITY_MISMATCH',
                message: `Medium workflows should have 3-8 nodes, found ${nodeCount}`,
                severity: 'warning'
            });
        } else if (complexity === 'complex' && nodeCount < 8) {
            results.warnings.push({
                type: 'COMPLEXITY_MISMATCH',
                message: `Complex workflows should have >8 nodes, found ${nodeCount}`,
                severity: 'warning'
            });
        }

        // Check reuse potential vs dependencies
        if (meta.reuse_potential === 'high' && meta.dependencies.length > 2) {
            results.warnings.push({
                type: 'REUSE_CONCERN',
                message: 'High reuse potential workflows should minimize dependencies',
                severity: 'warning'
            });
        }
    }

    validateSecurity(workflow, results) {
        const implementation = workflow.implementation;
        
        // Check for hardcoded credentials
        const workflowString = JSON.stringify(workflow);
        const suspiciousPatterns = [
            /password\s*[:=]\s*['"]/i,
            /api[_-]?key\s*[:=]\s*['"]/i,
            /secret\s*[:=]\s*['"]/i,
            /token\s*[:=]\s*['"]/i
        ];

        suspiciousPatterns.forEach(pattern => {
            if (pattern.test(workflowString)) {
                results.errors.push({
                    type: 'SECURITY_VIOLATION',
                    message: 'Potential hardcoded credentials detected',
                    severity: 'error'
                });
            }
        });

        // Check for proper error handling
        implementation.n8n_nodes.forEach((node, index) => {
            if (!node.error_handling || !node.error_handling.strategy) {
                results.errors.push({
                    type: 'SECURITY_VIOLATION',
                    message: `Node ${index} missing error handling strategy`,
                    severity: 'error'
                });
            }
        });

        // Check tenant isolation if required
        if (workflow.workflow_meta.tenant_aware === 'yes') {
            if (!workflow.inputs.tenant_isolation || !workflow.inputs.tenant_isolation.required) {
                results.errors.push({
                    type: 'SECURITY_VIOLATION',
                    message: 'Tenant-aware workflow missing tenant isolation configuration',
                    severity: 'error'
                });
            }
        }
    }

    validatePerformance(workflow, results) {
        const implementation = workflow.implementation;
        
        // Check timeouts
        implementation.n8n_nodes.forEach((node, index) => {
            if (!node.timeout) {
                results.warnings.push({
                    type: 'PERFORMANCE_CONCERN',
                    message: `Node ${index} missing timeout configuration`,
                    severity: 'warning'
                });
            } else if (node.timeout > 30000) {
                results.warnings.push({
                    type: 'PERFORMANCE_CONCERN',
                    message: `Node ${index} timeout >30s may impact user experience`,
                    severity: 'warning'
                });
            }
        });

        // Check for performance configuration
        if (!implementation.performance) {
            results.warnings.push({
                type: 'PERFORMANCE_CONCERN',
                message: 'Missing performance configuration',
                severity: 'warning'
            });
        }
    }

    validateTenantIsolation(workflow, results) {
        if (workflow.workflow_meta.tenant_aware === 'yes') {
            const supabaseConfig = workflow.supabase_config;
            
            // Check RLS policies
            if (!supabaseConfig.rls_policies || supabaseConfig.rls_policies.length === 0) {
                results.errors.push({
                    type: 'TENANT_ISOLATION',
                    message: 'Tenant-aware workflow missing RLS policies',
                    severity: 'error'
                });
            }

            // Check tenant field in tables
            supabaseConfig.tables.forEach(table => {
                if (!table.tenant_field) {
                    results.errors.push({
                        type: 'TENANT_ISOLATION',
                        message: `Table ${table.name} missing tenant_field`,
                        severity: 'error'
                    });
                }
            });
        }
    }

    validateDocumentation(workflow, results) {
        // Check example completeness
        if (!workflow.example.test_scenarios || workflow.example.test_scenarios.length < 3) {
            results.warnings.push({
                type: 'DOCUMENTATION',
                message: 'Should include at least 3 test scenarios',
                severity: 'warning'
            });
        }

        // Check explanation length
        if (workflow.example.explanation.length < 50) {
            results.warnings.push({
                type: 'DOCUMENTATION',
                message: 'Explanation should be more detailed (>50 characters)',
                severity: 'warning'
            });
        }

        // Check reuse information
        if (!workflow.reuse_info.chaining_examples || workflow.reuse_info.chaining_examples.length === 0) {
            results.warnings.push({
                type: 'DOCUMENTATION',
                message: 'Missing workflow chaining examples',
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

        console.log(`🔍 Validating ${workflowFiles.length} workflow(s)...\n`);

        workflowFiles.forEach(file => {
            const result = this.validateWorkflow(file);
            results.details.push(result);

            if (result.valid && result.errors.length === 0) {
                results.passed++;
                console.log(`✅ ${file}: PASSED ${result.warnings.length > 0 ? `(${result.warnings.length} warnings)` : ''}`);
            } else {
                results.failed++;
                console.log(`❌ ${file}: FAILED (${result.errors.length} errors, ${result.warnings.length} warnings)`);
                
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

        console.log(`\n📊 Validation Summary:`);
        console.log(`   Total: ${results.total}`);
        console.log(`   Passed: ${results.passed}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Warnings: ${results.warnings}`);

        return results.failed === 0;
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new WorkflowValidator();
    const success = validator.validateAll();
    process.exit(success ? 0 : 1);
}

module.exports = WorkflowValidator;