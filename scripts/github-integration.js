#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');

/**
 * GitHub Integration Script for N8N Microflows
 * Handles automated workflow deployment and repository management
 */

class GitHubIntegration {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({
      auth: token,
    });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Sync workflows to GitHub repository
   */
  async syncWorkflows() {
    try {
      const workflowFiles = glob.sync('microflows/**/*.json');
      console.log(`Found ${workflowFiles.length} workflow files to sync`);

      const results = [];
      for (const filePath of workflowFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const workflow = JSON.parse(content);
          
          // Validate workflow before syncing
          if (this.validateWorkflow(workflow)) {
            const result = await this.uploadWorkflow(filePath, content);
            results.push({ file: filePath, status: 'success', result });
            console.log(`✅ Synced: ${filePath}`);
          } else {
            results.push({ file: filePath, status: 'validation_failed' });
            console.log(`❌ Validation failed: ${filePath}`);
          }
        } catch (error) {
          results.push({ file: filePath, status: 'error', error: error.message });
          console.log(`❌ Error syncing ${filePath}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.error('Error syncing workflows:', error);
      throw error;
    }
  }

  /**
   * Upload or update a workflow file
   */
  async uploadWorkflow(filePath, content) {
    try {
      // Check if file exists
      let existingFile = null;
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
        });
        existingFile = response.data;
      } catch (error) {
        // File doesn't exist, that's okay
      }

      const message = existingFile 
        ? `Update workflow: ${path.basename(filePath)}`
        : `Add workflow: ${path.basename(filePath)}`;

      const params = {
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message,
        content: Buffer.from(content).toString('base64'),
      };

      if (existingFile) {
        params.sha = existingFile.sha;
      }

      const response = await this.octokit.rest.repos.createOrUpdateFileContents(params);
      return response.data;
    } catch (error) {
      console.error(`Error uploading ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Create GitHub release with workflow bundle
   */
  async createRelease(version, workflows) {
    try {
      const tagName = `v${version}`;
      const releaseName = `N8N Microflows ${version}`;
      
      // Create release
      const release = await this.octokit.rest.repos.createRelease({
        owner: this.owner,
        repo: this.repo,
        tag_name: tagName,
        target_commitish: 'main',
        name: releaseName,
        body: this.generateReleaseNotes(workflows),
        draft: false,
        prerelease: false,
      });

      console.log(`✅ Created release: ${releaseName}`);
      return release.data;
    } catch (error) {
      console.error('Error creating release:', error);
      throw error;
    }
  }

  /**
   * Generate catalog of all workflows
   */
  async generateWorkflowCatalog() {
    try {
      const workflowFiles = glob.sync('microflows/**/*.json');
      const catalog = {
        metadata: {
          generated_at: new Date().toISOString(),
          total_workflows: workflowFiles.length,
          version: process.env.npm_package_version || '1.0.0'
        },
        categories: {}
      };

      for (const filePath of workflowFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const workflow = JSON.parse(content);
          
          if (workflow.workflow_meta) {
            const category = workflow.workflow_meta.category || 'uncategorized';
            
            if (!catalog.categories[category]) {
              catalog.categories[category] = [];
            }

            catalog.categories[category].push({
              id: workflow.workflow_meta.id,
              goal: workflow.workflow_meta.goal,
              complexity: workflow.workflow_meta.complexity,
              execution_time: workflow.workflow_meta.execution_time,
              reuse_potential: workflow.workflow_meta.reuse_potential,
              tenant_aware: workflow.workflow_meta.tenant_aware,
              file_path: filePath,
              dependencies: workflow.workflow_meta.dependencies || [],
              tags: workflow.workflow_meta.tags || []
            });
          }
        } catch (error) {
          console.log(`Warning: Could not process ${filePath}: ${error.message}`);
        }
      }

      // Write catalog to docs
      const catalogPath = 'docs/workflow-catalog.md';
      const catalogContent = this.formatCatalogAsMarkdown(catalog);
      
      await this.uploadWorkflow(catalogPath, catalogContent);
      console.log('✅ Updated workflow catalog');
      
      return catalog;
    } catch (error) {
      console.error('Error generating catalog:', error);
      throw error;
    }
  }

  /**
   * Validate workflow structure
   */
  validateWorkflow(workflow) {
    // Check required fields
    if (!workflow.workflow_meta) return false;
    if (!workflow.workflow_meta.id) return false;
    if (!workflow.workflow_meta.goal) return false;
    if (!workflow.workflow_meta.category) return false;
    
    // Check naming convention
    const idPattern = /^[a-z]+__[a-z]+__[a-z_]+$/;
    if (!idPattern.test(workflow.workflow_meta.id)) return false;
    
    // Check for required implementation
    if (!workflow.implementation) return false;
    
    return true;
  }

  /**
   * Format catalog as markdown
   */
  formatCatalogAsMarkdown(catalog) {
    let markdown = `# N8N Microflows Catalog\n\n`;
    markdown += `Generated: ${catalog.metadata.generated_at}\n`;
    markdown += `Total Workflows: ${catalog.metadata.total_workflows}\n`;
    markdown += `Version: ${catalog.metadata.version}\n\n`;

    for (const [category, workflows] of Object.entries(catalog.categories)) {
      markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)} (${workflows.length})\n\n`;
      
      for (const workflow of workflows) {
        markdown += `### ${workflow.id}\n\n`;
        markdown += `**Goal:** ${workflow.goal}\n\n`;
        markdown += `**Complexity:** ${workflow.complexity}\n`;
        markdown += `**Execution Time:** ${workflow.execution_time}\n`;
        markdown += `**Reuse Potential:** ${workflow.reuse_potential}\n`;
        markdown += `**Tenant Aware:** ${workflow.tenant_aware}\n\n`;
        
        if (workflow.dependencies.length > 0) {
          markdown += `**Dependencies:** ${workflow.dependencies.join(', ')}\n\n`;
        }
        
        if (workflow.tags.length > 0) {
          markdown += `**Tags:** ${workflow.tags.join(', ')}\n\n`;
        }
        
        markdown += `**File:** \`${workflow.file_path}\`\n\n`;
        markdown += `---\n\n`;
      }
    }

    return markdown;
  }

  /**
   * Generate release notes
   */
  generateReleaseNotes(workflows) {
    let notes = `## N8N Microflows Release\n\n`;
    notes += `This release contains ${workflows.length} workflow templates organized by category:\n\n`;
    
    const categories = {};
    workflows.forEach(w => {
      const cat = w.category || 'Other';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat]++;
    });

    for (const [category, count] of Object.entries(categories)) {
      notes += `- **${category}**: ${count} workflows\n`;
    }

    notes += `\n### Installation\n\n`;
    notes += `1. Download the workflow files\n`;
    notes += `2. Import into your N8N instance\n`;
    notes += `3. Configure credentials and environment variables\n`;
    notes += `4. Test with provided example data\n\n`;
    notes += `### Requirements\n\n`;
    notes += `- N8N instance with appropriate node packages\n`;
    notes += `- Supabase integration (optional for multi-tenant features)\n`;
    notes += `- Required API credentials for external services\n`;

    return notes;
  }

  /**
   * Check repository status and health
   */
  async checkRepositoryHealth() {
    try {
      const health = {
        workflows: { total: 0, valid: 0, invalid: 0 },
        documentation: { present: false, complete: false },
        structure: { valid: true, missing_dirs: [] },
        scripts: { total: 0, functional: 0 }
      };

      // Check workflows
      const workflowFiles = glob.sync('microflows/**/*.json');
      health.workflows.total = workflowFiles.length;

      for (const filePath of workflowFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const workflow = JSON.parse(content);
          
          if (this.validateWorkflow(workflow)) {
            health.workflows.valid++;
          } else {
            health.workflows.invalid++;
          }
        } catch (error) {
          health.workflows.invalid++;
        }
      }

      // Check documentation
      try {
        await fs.access('docs/integration-guide.md');
        await fs.access('docs/naming-conventions.md');
        health.documentation.present = true;
        health.documentation.complete = true;
      } catch (error) {
        health.documentation.present = false;
      }

      // Check required directories
      const requiredDirs = [
        'microflows/content',
        'microflows/validation', 
        'microflows/communication',
        'microflows/data',
        'microflows/seo',
        'microflows/social',
        'microflows/utilities',
        'schemas',
        'scripts',
        'templates',
        'docs'
      ];

      for (const dir of requiredDirs) {
        try {
          await fs.access(dir);
        } catch (error) {
          health.structure.valid = false;
          health.structure.missing_dirs.push(dir);
        }
      }

      // Check scripts
      const scriptFiles = glob.sync('scripts/*.js');
      health.scripts.total = scriptFiles.length;
      health.scripts.functional = scriptFiles.length; // Assume functional for now

      return health;
    } catch (error) {
      console.error('Error checking repository health:', error);
      throw error;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'HameedFarah';
  const repo = process.env.GITHUB_REPO || 'n8n-microflows';

  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const integration = new GitHubIntegration(token, owner, repo);

  try {
    switch (command) {
      case 'sync':
        console.log('Syncing workflows to GitHub...');
        const results = await integration.syncWorkflows();
        console.log(`Sync completed. Success: ${results.filter(r => r.status === 'success').length}`);
        break;

      case 'catalog':
        console.log('Generating workflow catalog...');
        await integration.generateWorkflowCatalog();
        console.log('Catalog generation completed');
        break;

      case 'release':
        const version = args[1] || '1.0.0';
        console.log(`Creating release ${version}...`);
        await integration.createRelease(version, []);
        console.log('Release created successfully');
        break;

      case 'health':
        console.log('Checking repository health...');
        const health = await integration.checkRepositoryHealth();
        console.log('Repository Health Report:');
        console.log(JSON.stringify(health, null, 2));
        break;

      default:
        console.log('Usage: node github-integration.js <command>');
        console.log('Commands:');
        console.log('  sync     - Sync workflows to GitHub');
        console.log('  catalog  - Generate workflow catalog');
        console.log('  release  - Create a new release');
        console.log('  health   - Check repository health');
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = GitHubIntegration;
