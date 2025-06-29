#!/usr/bin/env node

/**
 * N8N Microflows Migration Tool
 * Handles workflow migrations, version upgrades, and schema changes
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { execSync } = require('child_process');

class MigrationTool {
  constructor() {
    this.migrations = [
      {
        version: '1.0.0',
        description: 'Initial version',
        migrate: (workflow) => workflow
      },
      {
        version: '1.1.0', 
        description: 'Add documentation and metadata fields',
        migrate: this.migrateTo_1_1_0.bind(this)
      },
      {
        version: '1.2.0',
        description: 'Update node schema and add error handling',
        migrate: this.migrateTo_1_2_0.bind(this)
      },
      {
        version: '2.0.0',
        description: 'Major schema upgrade with new features',
        migrate: this.migrateTo_2_0_0.bind(this)
      }
    ];
    
    this.currentVersion = '2.0.0';
  }

  async run() {
    console.log(chalk.cyan('🔄 N8N Microflows Migration Tool\n'));
    
    const action = await this.selectAction();
    
    switch (action) {
      case 'migrate-all':
        await this.migrateAllWorkflows();
        break;
      case 'migrate-specific':
        await this.migrateSpecificWorkflow();
        break;
      case 'check-versions':
        await this.checkWorkflowVersions();
        break;
      case 'create-migration':
        await this.createNewMigration();
        break;
      case 'backup':
        await this.createBackup();
        break;
      default:
        console.log('Invalid action selected');
    }
  }

  async selectAction() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Migrate all workflows', value: 'migrate-all' },
          { name: 'Migrate specific workflow', value: 'migrate-specific' },
          { name: 'Check workflow versions', value: 'check-versions' },
          { name: 'Create new migration', value: 'create-migration' },
          { name: 'Create backup', value: 'backup' }
        ]
      }
    ]);
    return action;
  }

  async migrateAllWorkflows() {
    const spinner = ora('Finding workflows...').start();
    
    try {
      // Create backup first
      const backupPath = await this.createBackupInternal();
      spinner.text = `Backup created at ${backupPath}`;
      
      const workflowFiles = glob.sync('microflows/**/*.json');
      spinner.text = `Found ${workflowFiles.length} workflows`;
      
      let migrated = 0;
      let errors = [];
      
      for (const file of workflowFiles) {
        try {
          spinner.text = `Migrating ${path.basename(file)}...`;
          
          const result = await this.migrateWorkflow(file);
          if (result.migrated) {
            migrated++;
          }
        } catch (error) {
          errors.push({ file, error: error.message });
        }
      }
      
      spinner.succeed(`Migration completed: ${migrated} workflows updated`);
      
      if (errors.length > 0) {
        console.log(chalk.yellow('\nErrors encountered:'));
        errors.forEach(({ file, error }) => {
          console.log(`  ${chalk.red('✗')} ${file}: ${error}`);
        });
      }
      
    } catch (error) {
      spinner.fail(`Migration failed: ${error.message}`);
    }
  }

  async migrateSpecificWorkflow() {
    const workflowFiles = glob.sync('microflows/**/*.json');
    
    const { selectedFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFile',
        message: 'Select workflow to migrate:',
        choices: workflowFiles.map(file => ({
          name: `${path.basename(file)} (${path.dirname(file)})`,
          value: file
        }))
      }
    ]);
    
    const spinner = ora(`Migrating ${selectedFile}...`).start();
    
    try {
      const result = await this.migrateWorkflow(selectedFile);
      
      if (result.migrated) {
        spinner.succeed(`Successfully migrated ${selectedFile}`);
        console.log(`  From: ${result.fromVersion} → To: ${result.toVersion}`);
      } else {
        spinner.info(`${selectedFile} is already up to date (${result.currentVersion})`);
      }
      
    } catch (error) {
      spinner.fail(`Migration failed: ${error.message}`);
    }
  }

  async migrateWorkflow(filePath) {
    const workflow = await fs.readJson(filePath);
    const currentVersion = workflow.version || '1.0.0';
    
    // Check if migration is needed
    if (this.compareVersions(currentVersion, this.currentVersion) >= 0) {
      return {
        migrated: false,
        currentVersion,
        fromVersion: currentVersion,
        toVersion: this.currentVersion
      };
    }
    
    let migratedWorkflow = { ...workflow };
    let fromVersion = currentVersion;
    
    // Apply all needed migrations in order
    for (const migration of this.migrations) {
      if (this.compareVersions(migration.version, currentVersion) > 0 &&
          this.compareVersions(migration.version, this.currentVersion) <= 0) {
        migratedWorkflow = migration.migrate(migratedWorkflow);
        migratedWorkflow.version = migration.version;
        migratedWorkflow.updated_at = new Date().toISOString();
      }
    }
    
    // Save migrated workflow
    await fs.writeJson(filePath, migratedWorkflow, { spaces: 2 });
    
    return {
      migrated: true,
      fromVersion,
      toVersion: this.currentVersion
    };
  }

  async checkWorkflowVersions() {
    const spinner = ora('Checking workflow versions...').start();
    
    try {
      const workflowFiles = glob.sync('microflows/**/*.json');
      const versionCounts = {};
      const outdatedWorkflows = [];
      
      for (const file of workflowFiles) {
        const workflow = await fs.readJson(file);
        const version = workflow.version || '1.0.0';
        
        versionCounts[version] = (versionCounts[version] || 0) + 1;
        
        if (this.compareVersions(version, this.currentVersion) < 0) {
          outdatedWorkflows.push({ file, version });
        }
      }
      
      spinner.stop();
      
      console.log(chalk.cyan('\n=== Workflow Version Report ===\n'));
      
      console.log(chalk.blue('Version Distribution:'));
      Object.entries(versionCounts).forEach(([version, count]) => {
        const status = version === this.currentVersion ? 
          chalk.green('(current)') : 
          chalk.yellow('(outdated)');
        console.log(`  ${version}: ${count} workflows ${status}`);
      });
      
      if (outdatedWorkflows.length > 0) {
        console.log(chalk.yellow(`\nOutdated Workflows (${outdatedWorkflows.length}):`));
        outdatedWorkflows.forEach(({ file, version }) => {
          console.log(`  ${chalk.yellow('⚠')} ${file} (v${version})`);
        });
        
        const { shouldMigrate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldMigrate',
            message: 'Would you like to migrate all outdated workflows now?',
            default: false
          }
        ]);
        
        if (shouldMigrate) {
          await this.migrateAllWorkflows();
        }
      } else {
        console.log(chalk.green('\n✓ All workflows are up to date!'));
      }
      
    } catch (error) {
      spinner.fail(`Version check failed: ${error.message}`);
    }
  }

  async createNewMigration() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'version',
        message: 'Enter new version number:',
        validate: (input) => {
          const versionRegex = /^\d+\.\d+\.\d+$/;
          return versionRegex.test(input) || 'Please enter a valid semantic version (e.g., 2.1.0)';
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Enter migration description:',
        validate: (input) => input.length > 0 || 'Description cannot be empty'
      }
    ]);
    
    const migrationTemplate = `
// Migration to version ${answers.version}
// ${answers.description}

migrateTo_${answers.version.replace(/\./g, '_')}(workflow) {
  // Add your migration logic here
  const migratedWorkflow = { ...workflow };
  
  // Example migration tasks:
  // 1. Add new required fields
  // 2. Update node configurations
  // 3. Transform data structures
  // 4. Update schema versions
  
  // Update version
  migratedWorkflow.version = '${answers.version}';
  migratedWorkflow.updated_at = new Date().toISOString();
  
  return migratedWorkflow;
}
`;
    
    const migrationFile = path.join(__dirname, `migration_${answers.version}.js`);
    await fs.writeFile(migrationFile, migrationTemplate);
    
    console.log(chalk.green(`\n✓ Migration template created: ${migrationFile}`));
    console.log(chalk.cyan('Next steps:'));
    console.log('1. Implement the migration logic in the generated file');
    console.log('2. Add the migration to the migrations array in this tool');
    console.log('3. Test the migration on a backup copy');
  }

  async createBackup() {
    const spinner = ora('Creating backup...').start();
    
    try {
      const backupPath = await this.createBackupInternal();
      spinner.succeed(`Backup created: ${backupPath}`);
    } catch (error) {
      spinner.fail(`Backup failed: ${error.message}`);
    }
  }

  async createBackupInternal() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', `backup_${timestamp}`);
    
    await fs.ensureDir(backupDir);
    await fs.copy(path.join(__dirname, '..', 'microflows'), path.join(backupDir, 'microflows'));
    await fs.copy(path.join(__dirname, '..', 'schemas'), path.join(backupDir, 'schemas'));
    await fs.copy(path.join(__dirname, '..', 'templates'), path.join(backupDir, 'templates'));
    
    // Create backup manifest
    const manifest = {
      created_at: new Date().toISOString(),
      version: this.currentVersion,
      files_count: glob.sync('microflows/**/*.json').length,
      description: 'Automated backup before migration'
    };
    
    await fs.writeJson(path.join(backupDir, 'manifest.json'), manifest, { spaces: 2 });
    
    return backupDir;
  }

  // Migration functions for each version

  migrateTo_1_1_0(workflow) {
    const migrated = { ...workflow };
    
    // Add documentation field if missing
    if (!migrated.documentation) {
      migrated.documentation = {
        description: migrated.description || '',
        setup_instructions: [],
        required_credentials: [],
        environment_variables: []
      };
    }
    
    // Add metadata fields
    if (!migrated.created_at) {
      migrated.created_at = new Date().toISOString();
    }
    
    if (!migrated.tags) {
      migrated.tags = [];
    }
    
    if (!migrated.reuse_potential) {
      migrated.reuse_potential = 'medium';
    }
    
    return migrated;
  }

  migrateTo_1_2_0(workflow) {
    const migrated = { ...workflow };
    
    // Add error handling to settings
    if (!migrated.settings) {
      migrated.settings = {};
    }
    
    if (!migrated.settings.errorWorkflow) {
      migrated.settings.errorWorkflow = {
        id: 'error_handler_workflow'
      };
    }
    
    // Update node configurations for better error handling
    if (migrated.nodes) {
      migrated.nodes = migrated.nodes.map(node => {
        if (!node.continueOnFail && this.isFailureProneNode(node.type)) {
          return { ...node, continueOnFail: true };
        }
        return node;
      });
    }
    
    return migrated;
  }

  migrateTo_2_0_0(workflow) {
    const migrated = { ...workflow };
    
    // Major schema changes for v2.0.0
    
    // 1. Add new complexity field
    if (!migrated.complexity) {
      migrated.complexity = this.calculateComplexity(migrated);
    }
    
    // 2. Update node schema to new format
    if (migrated.nodes) {
      migrated.nodes = migrated.nodes.map(node => {
        // Update webhook nodes to new authentication format
        if (node.type === 'n8n-nodes-base.webhook') {
          if (!node.parameters.authentication) {
            node.parameters.authentication = 'none';
          }
        }
        
        // Update HTTP request nodes to new format
        if (node.type === 'n8n-nodes-base.httpRequest') {
          if (!node.parameters.options) {
            node.parameters.options = {};
          }
        }
        
        return node;
      });
    }
    
    // 3. Add new metadata structure
    if (!migrated.meta) {
      migrated.meta = {
        templateCredsSetupCompleted: false,
        instanceId: 'migrated'
      };
    }
    
    // 4. Update settings structure
    if (migrated.settings) {
      migrated.settings.executionOrder = migrated.settings.executionOrder || 'v1';
      migrated.settings.saveManualExecutions = migrated.settings.saveManualExecutions !== false;
    }
    
    return migrated;
  }

  // Utility functions

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part < v2part) return -1;
      if (v1part > v2part) return 1;
    }
    
    return 0;
  }

  isFailureProneNode(nodeType) {
    const failureProneTypes = [
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.gmail',
      'n8n-nodes-base.slack',
      'n8n-nodes-base.supabase'
    ];
    
    return failureProneTypes.includes(nodeType);
  }

  calculateComplexity(workflow) {
    const nodeCount = workflow.nodes?.length || 0;
    const connectionCount = Object.values(workflow.connections || {}).flat().flat().length;
    
    if (nodeCount <= 3 && connectionCount <= 2) return 'simple';
    if (nodeCount <= 8 && connectionCount <= 10) return 'medium';
    return 'complex';
  }
}

// CLI execution
if (require.main === module) {
  const migrationTool = new MigrationTool();
  migrationTool.run().catch(error => {
    console.error(chalk.red('Migration tool failed:', error.message));
    process.exit(1);
  });
}

module.exports = MigrationTool;
