const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Check Documentation Completeness Script
 * Validates that all workflows have complete documentation
 */

// Find all workflow files
const workflowFiles = glob.sync('microflows/**/*.json');

let errors = 0;
const requiredDocFields = [
  'workflow_meta.goal',
  'inputs.schema', 
  'outputs.success',
  'outputs.error',
  'implementation.n8n_nodes',
  'example.input',
  'example.output',
  'reuse_info'
];

console.log('🔍 Checking documentation completeness...\n');

workflowFiles.forEach(file => {
  try {
    const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Check if all required fields exist
    const missingFields = [];
    requiredDocFields.forEach(field => {
      const fieldPath = field.split('.');
      let current = workflow;
      
      for (const key of fieldPath) {
        if (!current || !current.hasOwnProperty(key)) {
          missingFields.push(field);
          break;
        }
        current = current[key];
      }
    });
    
    if (missingFields.length > 0) {
      console.error(`❌ ${file}: Missing documentation fields:`);
      missingFields.forEach(field => {
        console.error(`   - ${field}`);
      });
      errors++;
    } else {
      // Check if documentation is meaningful (not just placeholders)
      const warnings = [];
      
      if (workflow.workflow_meta?.goal?.length < 20) {
        warnings.push('Goal description is too short (< 20 characters)');
      }
      
      if (!workflow.example?.explanation) {
        warnings.push('Missing example explanation');
      }
      
      if (workflow.implementation?.n8n_nodes?.length === 0) {
        warnings.push('No N8N nodes documented');
      }
      
      if (warnings.length > 0) {
        console.warn(`⚠️  ${file}: Documentation warnings:`);
        warnings.forEach(warning => {
          console.warn(`   - ${warning}`);
        });
      } else {
        console.log(`✅ ${file}: Documentation complete`);
      }
    }
    
  } catch (e) {
    console.error(`❌ ${file}: Invalid JSON - ${e.message}`);
    errors++;
  }
});

// Generate documentation coverage report
const totalFiles = workflowFiles.length;
const completedFiles = totalFiles - errors;
const coverage = totalFiles > 0 ? ((completedFiles / totalFiles) * 100).toFixed(1) : 0;

console.log(`\n📊 Documentation Coverage Report:`);
console.log(`   Total workflows: ${totalFiles}`);
console.log(`   Fully documented: ${completedFiles}`);
console.log(`   Coverage: ${coverage}%`);

if (errors > 0) {
  console.error(`\n❌ ${errors} workflow(s) failed documentation validation`);
  process.exit(1);
} else {
  console.log(`\n✅ All workflows passed documentation validation`);
}
