#!/usr/bin/env node

/**
 * Comprehensive Test Runner for N8N Microflows
 * Tests validation, integration, and end-to-end functionality
 */

const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');

const globAsync = promisify(glob);

class TestRunner {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };
        this.verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
        this.filter = process.argv.find(arg => arg.startsWith('--filter='))?.split('=')[1];
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const symbols = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            debug: '🔍'
        };

        if (level === 'debug' && !this.verbose) return;

        console.log(`${symbols[level]} [${timestamp}] ${message}`);
    }

    async runTests() {
        this.log('Starting comprehensive test suite...', 'info');

        const testSuites = [
            { name: 'Schema Validation', fn: () => this.testSchemaValidation() },
            { name: 'Workflow Structure', fn: () => this.testWorkflowStructure() },
            { name: 'Naming Conventions', fn: () => this.testNamingConventions() },
            { name: 'Documentation Completeness', fn: () => this.testDocumentation() },
            { name: 'Integration Tests', fn: () => this.testIntegrations() },
            { name: 'Performance Tests', fn: () => this.testPerformance() },
            { name: 'Security Tests', fn: () => this.testSecurity() },
            { name: 'End-to-End Tests', fn: () => this.testE2E() }
        ];

        for (const suite of testSuites) {
            if (this.filter && !suite.name.toLowerCase().includes(this.filter.toLowerCase())) {
                this.log(`Skipping ${suite.name} (filtered)`, 'warning');
                this.testResults.skipped++;
                continue;
            }

            this.log(`Running ${suite.name} tests...`, 'info');
            
            try {
                const result = await suite.fn();
                if (result) {
                    this.log(`${suite.name} passed`, 'success');
                    this.testResults.passed++;
                } else {
                    this.log(`${suite.name} failed`, 'error');
                    this.testResults.failed++;
                }
                
                this.testResults.tests.push({
                    name: suite.name,
                    status: result ? 'passed' : 'failed',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                this.log(`${suite.name} error: ${error.message}`, 'error');
                this.testResults.failed++;
                this.testResults.tests.push({
                    name: suite.name,
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        await this.generateReport();
        return this.testResults.failed === 0;
    }

    async testSchemaValidation() {
        this.log('Testing JSON schema validation...', 'debug');
        
        try {
            // Get all workflow files
            const workflowFiles = await globAsync('microflows/**/*.json');
            
            if (workflowFiles.length === 0) {
                this.log('No workflow files found for validation', 'warning');
                return true; // Pass if no files to validate
            }

            let validationErrors = 0;

            for (const file of workflowFiles) {
                try {
                    const content = await fs.readFile(file, 'utf8');
                    const workflow = JSON.parse(content);
                    
                    // Basic structure validation
                    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
                        this.log(`${file}: Missing or invalid nodes array`, 'error');
                        validationErrors++;
                    }

                    if (!workflow.connections || typeof workflow.connections !== 'object') {
                        this.log(`${file}: Missing or invalid connections object`, 'error');
                        validationErrors++;
                    }

                    this.log(`${file}: Schema validation passed`, 'debug');
                } catch (parseError) {
                    this.log(`${file}: JSON parse error - ${parseError.message}`, 'error');
                    validationErrors++;
                }
            }

            return validationErrors === 0;
        } catch (error) {
            this.log(`Schema validation setup error: ${error.message}`, 'error');
            return false;
        }
    }

    async testWorkflowStructure() {
        this.log('Testing workflow structure integrity...', 'debug');
        
        const workflowFiles = await globAsync('microflows/**/*.json');
        let structureErrors = 0;

        for (const file of workflowFiles) {
            try {
                const content = await fs.readFile(file, 'utf8');
                const workflow = JSON.parse(content);

                // Test node references in connections
                const nodeIds = new Set(workflow.nodes.map(node => node.id));
                
                for (const [sourceId, connections] of Object.entries(workflow.connections || {})) {
                    if (!nodeIds.has(sourceId)) {
                        this.log(`${file}: Connection references non-existent source node: ${sourceId}`, 'error');
                        structureErrors++;
                    }

                    for (const [outputIndex, targets] of Object.entries(connections)) {
                        for (const target of targets || []) {
                            if (!nodeIds.has(target.node)) {
                                this.log(`${file}: Connection references non-existent target node: ${target.node}`, 'error');
                                structureErrors++;
                            }
                        }
                    }
                }

                // Test for orphaned nodes (nodes with no connections)
                const connectedNodes = new Set();
                Object.keys(workflow.connections || {}).forEach(id => connectedNodes.add(id));
                Object.values(workflow.connections || {}).forEach(outputs => {
                    Object.values(outputs).forEach(targets => {
                        targets?.forEach(target => connectedNodes.add(target.node));
                    });
                });

                const orphanedNodes = workflow.nodes.filter(node => 
                    !connectedNodes.has(node.id) && 
                    node.type !== 'n8n-nodes-base.manualTrigger'
                );

                if (orphanedNodes.length > 0) {
                    this.log(`${file}: Found ${orphanedNodes.length} orphaned nodes`, 'warning');
                }

                this.log(`${file}: Structure validation passed`, 'debug');
            } catch (error) {
                this.log(`${file}: Structure validation error - ${error.message}`, 'error');
                structureErrors++;
            }
        }

        return structureErrors === 0;
    }

    async testNamingConventions() {
        this.log('Testing naming conventions...', 'debug');
        
        // Test workflow file naming
        const workflowFiles = await globAsync('microflows/**/*.json');
        let namingErrors = 0;

        const validNamePattern = /^[a-z0-9-]+\.json$/;

        for (const file of workflowFiles) {
            const filename = path.basename(file);
            
            if (!validNamePattern.test(filename)) {
                this.log(`${file}: Invalid filename format (should be kebab-case)`, 'error');
                namingErrors++;
            }

            // Test workflow content naming
            try {
                const content = await fs.readFile(file, 'utf8');
                const workflow = JSON.parse(content);

                if (workflow.name && !/^[A-Z][a-zA-Z0-9\s-]*$/.test(workflow.name)) {
                    this.log(`${file}: Invalid workflow name format`, 'warning');
                }

                this.log(`${file}: Naming convention passed`, 'debug');
            } catch (parseError) {
                // Already caught in schema validation
            }
        }

        return namingErrors === 0;
    }

    async testDocumentation() {
        this.log('Testing documentation completeness...', 'debug');
        
        let docErrors = 0;

        // Check required documentation files
        const requiredDocs = [
            'README.md',
            'docs/setup-guide.md',
            'docs/integration-guide.md',
            'docs/naming-conventions.md',
            'docs/workflow-catalog.md'
        ];

        for (const docFile of requiredDocs) {
            try {
                await fs.access(docFile);
                const content = await fs.readFile(docFile, 'utf8');
                
                if (content.length < 100) {
                    this.log(`${docFile}: Documentation appears incomplete (too short)`, 'warning');
                }

                this.log(`${docFile}: Documentation exists`, 'debug');
            } catch (error) {
                this.log(`${docFile}: Missing required documentation`, 'error');
                docErrors++;
            }
        }

        // Check workflow documentation
        const workflowFiles = await globAsync('microflows/**/*.json');
        
        for (const file of workflowFiles) {
            try {
                const content = await fs.readFile(file, 'utf8');
                const workflow = JSON.parse(content);

                if (!workflow.meta?.description) {
                    this.log(`${file}: Missing workflow description`, 'warning');
                }

                if (!workflow.meta?.tags || workflow.meta.tags.length === 0) {
                    this.log(`${file}: Missing workflow tags`, 'warning');
                }
            } catch (error) {
                // Already handled in other tests
            }
        }

        return docErrors === 0;
    }

    async testIntegrations() {
        this.log('Testing integrations...', 'debug');
        
        let integrationErrors = 0;

        // Test script integrations
        const scripts = [
            'validate-workflow.js',
            'check-naming.js',
            'check-documentation.js',
            'update-catalog.js',
            'setup-supabase.js'
        ];

        for (const script of scripts) {
            try {
                const scriptPath = path.join('scripts', script);
                await fs.access(scriptPath);
                this.log(`${script}: Script exists`, 'debug');
            } catch (error) {
                this.log(`${script}: Script not found`, 'error');
                integrationErrors++;
            }
        }

        // Test environment variable handling
        const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
        
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                this.log(`Missing environment variable: ${envVar}`, 'warning');
            }
        }

        return integrationErrors === 0;
    }

    async testPerformance() {
        this.log('Testing performance characteristics...', 'debug');
        
        const startTime = Date.now();
        
        try {
            // Test validation performance
            const workflowFiles = await globAsync('microflows/**/*.json');
            
            if (workflowFiles.length > 0) {
                const validationStart = Date.now();
                
                for (const file of workflowFiles) {
                    const content = await fs.readFile(file, 'utf8');
                    JSON.parse(content); // Basic parse performance
                }
                
                const validationTime = Date.now() - validationStart;
                const avgTime = validationTime / workflowFiles.length;
                
                this.log(`Validation performance: ${avgTime.toFixed(2)}ms per workflow`, 'debug');
                
                if (avgTime > 1000) {
                    this.log('Validation performance is slow (>1000ms per workflow)', 'warning');
                }
            }

            const totalTime = Date.now() - startTime;
            this.log(`Performance test completed in ${totalTime}ms`, 'debug');
            
            return totalTime < 30000; // Should complete within 30 seconds
        } catch (error) {
            this.log(`Performance test error: ${error.message}`, 'error');
            return false;
        }
    }

    async testSecurity() {
        this.log('Testing security characteristics...', 'debug');
        
        let securityIssues = 0;

        // Test for sensitive data in workflows
        const workflowFiles = await globAsync('microflows/**/*.json');
        const sensitivePatterns = [
            /password/i,
            /secret/i,
            /api[_-]?key/i,
            /token/i,
            /credential/i
        ];

        for (const file of workflowFiles) {
            try {
                const content = await fs.readFile(file, 'utf8');
                
                for (const pattern of sensitivePatterns) {
                    if (pattern.test(content)) {
                        this.log(`${file}: Potential sensitive data detected`, 'warning');
                        break;
                    }
                }

                // Check for hardcoded values that look suspicious
                const workflow = JSON.parse(content);
                for (const node of workflow.nodes || []) {
                    if (node.parameters) {
                        const paramStr = JSON.stringify(node.parameters);
                        if (paramStr.includes('http://') && !paramStr.includes('localhost')) {
                            this.log(`${file}: HTTP (non-HTTPS) endpoint detected in ${node.name}`, 'warning');
                        }
                    }
                }

                this.log(`${file}: Security scan passed`, 'debug');
            } catch (error) {
                this.log(`${file}: Security scan error - ${error.message}`, 'error');
                securityIssues++;
            }
        }

        return securityIssues === 0;
    }

    async testE2E() {
        this.log('Testing end-to-end functionality...', 'debug');
        
        try {
            // Test the complete validation pipeline
            const { execSync } = require('child_process');
            
            // Test npm scripts exist and can run
            const scripts = ['validate', 'check-naming', 'check-docs'];
            
            for (const script of scripts) {
                try {
                    execSync(`npm run ${script} --silent`, { 
                        cwd: process.cwd(),
                        timeout: 10000 
                    });
                    this.log(`npm run ${script}: Executed successfully`, 'debug');
                } catch (error) {
                    this.log(`npm run ${script}: Failed - ${error.message}`, 'error');
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.log(`E2E test error: ${error.message}`, 'error');
            return false;
        }
    }

    async generateReport() {
        this.log('Generating test report...', 'info');
        
        const report = {
            summary: {
                total: this.testResults.passed + this.testResults.failed + this.testResults.skipped,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                skipped: this.testResults.skipped,
                successRate: this.testResults.passed / (this.testResults.passed + this.testResults.failed) * 100
            },
            timestamp: new Date().toISOString(),
            tests: this.testResults.tests
        };

        // Write detailed report
        try {
            await fs.writeFile(
                'test-report.json', 
                JSON.stringify(report, null, 2)
            );
            this.log('Detailed report saved to test-report.json', 'info');
        } catch (error) {
            this.log(`Failed to save report: ${error.message}`, 'error');
        }

        // Print summary
        console.log('\n📊 Test Summary:');
        console.log(`   Total Tests: ${report.summary.total}`);
        console.log(`   Passed: ${report.summary.passed} ✅`);
        console.log(`   Failed: ${report.summary.failed} ❌`);
        console.log(`   Skipped: ${report.summary.skipped} ⚠️`);
        console.log(`   Success Rate: ${report.summary.successRate.toFixed(1)}%`);
        
        if (report.summary.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults.tests
                .filter(test => test.status === 'failed' || test.status === 'error')
                .forEach(test => {
                    console.log(`   - ${test.name}: ${test.error || 'Failed'}`);
                });
        }
    }
}

// Main execution
async function main() {
    const runner = new TestRunner();
    const success = await runner.runTests();
    
    process.exit(success ? 0 : 1);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TestRunner;
