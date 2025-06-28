const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Update Workflow Catalog Script
 * Generates and updates the workflow catalog documentation
 */

console.log('📋 Generating workflow catalog...\n');

// Find all workflow files
const workflowFiles = glob.sync('microflows/**/*.json');

// Parse all workflows
const workflows = [];
const categories = {};

workflowFiles.forEach(file => {
  try {
    const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (workflow.workflow_meta) {
      workflows.push({
        file: file,
        meta: workflow.workflow_meta,
        inputs: workflow.inputs,
        outputs: workflow.outputs,
        reuse_info: workflow.reuse_info
      });
      
      // Group by category
      const category = workflow.workflow_meta.category || 'uncategorized';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(workflow);
    }
  } catch (e) {
    console.warn(`⚠️  Skipping ${file}: ${e.message}`);
  }
});

// Generate catalog content
let catalogContent = `# N8N Microflows Catalog

*Auto-generated on ${new Date().toISOString()}*

## Overview

Total workflows: **${workflows.length}**

### Categories Summary

`;

// Add category summary
Object.keys(categories).sort().forEach(category => {
  const count = categories[category].length;
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  catalogContent += `- **${categoryName}**: ${count} workflow(s)\n`;
});

catalogContent += `\n---\n\n`;

// Add detailed workflows by category
Object.keys(categories).sort().forEach(category => {
  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
  catalogContent += `## ${categoryName} Workflows\n\n`;
  
  categories[category]
    .sort((a, b) => a.workflow_meta.id.localeCompare(b.workflow_meta.id))
    .forEach(workflow => {
      const meta = workflow.workflow_meta;
      
      catalogContent += `### \`${meta.id}\`\n\n`;
      catalogContent += `**Goal**: ${meta.goal}\n\n`;
      catalogContent += `**Details**:\n`;
      catalogContent += `- Complexity: ${meta.complexity}\n`;
      catalogContent += `- Execution Time: ${meta.execution_time}\n`;
      catalogContent += `- Reuse Potential: ${meta.reuse_potential}\n`;
      catalogContent += `- Tenant Aware: ${meta.tenant_aware}\n`;
      
      if (meta.dependencies && meta.dependencies.length > 0) {
        catalogContent += `- Dependencies: ${meta.dependencies.join(', ')}\n`;
      }
      
      if (meta.tags && meta.tags.length > 0) {
        catalogContent += `- Tags: ${meta.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
      }
      
      catalogContent += `\n`;
    });
  
  catalogContent += `\n`;
});

// Add reuse compatibility matrix
catalogContent += `## Reuse Compatibility Matrix\n\n`;
catalogContent += `| Workflow ID | Compatible With | Input From | Output To |\n`;
catalogContent += `|-------------|----------------|------------|----------|\n`;

workflows.forEach(workflow => {
  const meta = workflow.meta;
  const reuse = workflow.reuse_info || {};
  
  const compatibleWith = reuse.compatible_with ? reuse.compatible_with.join(', ') : 'None';
  const inputFrom = reuse.input_from ? reuse.input_from.join(', ') : 'Manual';
  const outputTo = reuse.output_to ? reuse.output_to.join(', ') : 'Terminal';
  
  catalogContent += `| \`${meta.id}\` | ${compatibleWith} | ${inputFrom} | ${outputTo} |\n`;
});

catalogContent += `\n## Search by Tags\n\n`;

// Create tag index
const tagIndex = {};
workflows.forEach(workflow => {
  const tags = workflow.meta.tags || [];
  tags.forEach(tag => {
    if (!tagIndex[tag]) {
      tagIndex[tag] = [];
    }
    tagIndex[tag].push(workflow.meta.id);
  });
});

Object.keys(tagIndex).sort().forEach(tag => {
  catalogContent += `**${tag}**: ${tagIndex[tag].map(id => `\`${id}\``).join(', ')}\n\n`;
});

// Add usage examples
catalogContent += `## Usage Examples\n\n`;
catalogContent += `### Chaining Workflows\n\n`;
catalogContent += `Workflows can be chained together by matching output formats to input schemas:\n\n`;
catalogContent += `\`\`\`\n`;
catalogContent += `validate__input__user_data → enrich__gpt__with_context → store__supabase__processed_data\n`;
catalogContent += `\`\`\`\n\n`;

catalogContent += `### Integration Patterns\n\n`;
catalogContent += `1. **Validation Chain**: Input validation → Processing → Output validation\n`;
catalogContent += `2. **Data Pipeline**: Extract → Transform → Load (ETL)\n`;
catalogContent += `3. **Content Pipeline**: Generate → Validate → Publish\n`;
catalogContent += `4. **Communication Flow**: Trigger → Process → Notify\n\n`;

// Add footer
catalogContent += `---\n\n`;
catalogContent += `*This catalog is automatically updated when workflows are added or modified.*\n`;

// Ensure docs directory exists
if (!fs.existsSync('docs')) {
  fs.mkdirSync('docs');
}

// Write catalog file
fs.writeFileSync('docs/workflow-catalog.md', catalogContent);

console.log(`✅ Generated workflow catalog with ${workflows.length} workflows`);
console.log(`📁 Saved to: docs/workflow-catalog.md`);

// Generate JSON index for programmatic access
const jsonIndex = {
  generated_at: new Date().toISOString(),
  total_workflows: workflows.length,
  categories: Object.keys(categories).reduce((acc, cat) => {
    acc[cat] = categories[cat].map(w => ({
      id: w.workflow_meta.id,
      goal: w.workflow_meta.goal,
      complexity: w.workflow_meta.complexity,
      reuse_potential: w.workflow_meta.reuse_potential,
      tags: w.workflow_meta.tags || []
    }));
    return acc;
  }, {}),
  tag_index: tagIndex
};

fs.writeFileSync('docs/workflow-index.json', JSON.stringify(jsonIndex, null, 2));
console.log(`📋 Generated JSON index: docs/workflow-index.json`);
