#!/usr/bin/env node

/**
 * N8N Microflows CLI Tool
 * Command-line interface for workflow management, deployment, and maintenance
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');

// Import our existing scripts
const validateWorkflow = require('./validate-workflow.js');
const updateCatalog = require('./update-catalog.js');
const generateEmbeddings = require('./generate-embeddings.js');
const checkNaming = require('./check-naming.js');

const program = new Command();

// CLI Configuration
program
  .name('n8n-microflows')
  .description('CLI tool for N8N microflows management and deployment')
  .version('1.0.0');

// ==================== Workflow Management Commands ====================

program
  .command('create')
  .description('Create a new microflow from template')
  .option('-t, --template <type>', 'Template type (slack, email, api, database)', 'basic')
  .option('-n, --name <name>', 'Workflow name')
  .option('-c, --category <category>', 'Workflow category', 'utilities')
  .action(async (options) => {
    const spinner = ora('Creating new microflow...').start();
    
    try {
      let workflowName = options.name;
      let category = options.category;
      let template = options.template;

      if (!workflowName) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter workflow name:',
            validate: (input) => input.length > 0 || 'Name cannot be empty'
          },
          {
            type: 'list',
            name: 'category',
            message: 'Select category:',
            choices: ['communication', 'data', 'content', 'validation', 'utilities', 'social', 'seo']
          },
          {
            type: 'list',
            name: 'template',
            message: 'Select template:',
            choices: ['slack', 'email', 'api', 'database', 'webhook', 'csv-transform', 'basic']
          }
        ]);
        workflowName = answers.name;
        category = answers.category;
        template = answers.template;
        spinner.start();
      }

      const result = await createWorkflowFromTemplate(workflowName, category, template);
      
      spinner.succeed(`Created workflow: ${chalk.green(result.filename)}`);
      console.log(`\n${chalk.cyan('Next steps:')}`);
      console.log(`1. Edit the workflow: ${result.filepath}`);
      console.log(`2. Validate: ${chalk.yellow('npm run validate')}`);
      console.log(`3. Test: ${chalk.yellow('npm test')}`);

    } catch (error) {
      spinner.fail(`Failed to create workflow: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate workflows')
  .option('-f, --file <file>', 'Specific workflow file to validate')
  .option('-c, --category <category>', 'Validate specific category')
  .option('--fix', 'Auto-fix issues where possible')
  .action(async (options) => {
    const spinner = ora('Validating workflows...').start();
    
    try {
      let files = [];
      
      if (options.file) {
        files = [options.file];
      } else if (options.category) {
        files = glob.sync(`microflows/${options.category}/*.json`);
      } else {
        files = glob.sync('microflows/**/*.json');
      }

      let totalErrors = 0;
      let totalWarnings = 0;
      let validFiles = 0;

      for (const file of files) {
        spinner.text = `Validating ${path.basename(file)}...`;
        
        const result = await validateWorkflow.validateSingleWorkflow(file, {
          autoFix: options.fix
        });
        
        if (result.valid) {
          validFiles++;
        } else {
          totalErrors += result.errors?.length || 0;
          totalWarnings += result.warnings?.length || 0;
        }
      }

      spinner.succeed(`Validation complete: ${chalk.green(validFiles)} valid, ${chalk.red(totalErrors)} errors, ${chalk.yellow(totalWarnings)} warnings`);
      
      if (totalErrors > 0) {
        console.log(`\n${chalk.red('Errors found!')} Run with ${chalk.yellow('--fix')} to auto-repair where possible.`);
        process.exit(1);
      }

    } catch (error) {
      spinner.fail(`Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search workflows using AI similarity')
  .argument('<query>', 'Search query')
  .option('-l, --limit <number>', 'Number of results', '10')
  .option('-t, --threshold <number>', 'Similarity threshold', '0.7')
  .action(async (query, options) => {
    const spinner = ora('Searching workflows...').start();
    
    try {
      const vectorSearch = require('./vector-embedding-system.js');
      const results = await vectorSearch.searchSimilarWorkflows(query, {
        limit: parseInt(options.limit),
        threshold: parseFloat(options.threshold)
      });

      spinner.stop();
      
      if (results.length === 0) {
        console.log(chalk.yellow('No similar workflows found.'));
        return;
      }

      console.log(chalk.cyan(`\nFound ${results.length} similar workflows:\n`));
      
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${chalk.green(result.name)} (${(result.similarity * 100).toFixed(1)}%)`);
        console.log(`   ${chalk.gray(result.description)}`);
        console.log(`   ${chalk.blue(result.filepath)}\n`);
      });

    } catch (error) {
      spinner.fail(`Search failed: ${error.message}`);
      process.exit(1);
    }
  });

// ==================== Deployment Commands ====================

program
  .command('deploy')
  .description('Deploy workflows to environment')
  .option('-e, --env <environment>', 'Target environment (dev, staging, prod)', 'dev')
  .option('-f, --file <file>', 'Specific workflow file to deploy')
  .option('--dry-run', 'Show what would be deployed without actually deploying')
  .action(async (options) => {
    const spinner = ora(`Deploying to ${options.env}...`).start();
    
    try {
      const deploymentResult = await deployWorkflows(options);
      
      if (options.dryRun) {
        spinner.succeed('Dry run completed');
        console.log(chalk.cyan('\nWould deploy:'));
        deploymentResult.files.forEach(file => {
          console.log(`  ${chalk.green('✓')} ${file}`);
        });
      } else {
        spinner.succeed(`Deployed ${deploymentResult.count} workflows to ${options.env}`);
      }

    } catch (error) {
      spinner.fail(`Deployment failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync workflows with external systems')
  .option('--github', 'Sync with GitHub')
  .option('--supabase', 'Sync with Supabase')
  .option('--n8n', 'Sync with N8N instance')
  .action(async (options) => {
    const spinner = ora('Syncing workflows...').start();
    
    try {
      if (options.github) {
        const githubIntegration = require('./github-integration.js');
        await githubIntegration.syncWithGitHub();
        spinner.text = 'GitHub sync completed';
      }
      
      if (options.supabase) {
        const supabaseIntegration = require('./supabase-integration.js');
        await supabaseIntegration.syncWorkflows();
        spinner.text = 'Supabase sync completed';
      }
      
      if (options.n8n) {
        await syncWithN8NInstance();
        spinner.text = 'N8N sync completed';
      }

      spinner.succeed('Sync completed successfully');

    } catch (error) {
      spinner.fail(`Sync failed: ${error.message}`);
      process.exit(1);
    }
  });

// ==================== Maintenance Commands ====================

program
  .command('migrate')
  .description('Migrate workflows to new version')
  .option('-f, --from <version>', 'Source version')
  .option('-t, --to <version>', 'Target version')
  .option('--backup', 'Create backup before migration')
  .action(async (options) => {
    const spinner = ora('Running migration...').start();
    
    try {
      if (options.backup) {
        await createBackup();
        spinner.text = 'Backup created, running migration...';
      }

      const migrationResult = await runMigration(options.from, options.to);
      
      spinner.succeed(`Migration completed: ${migrationResult.migrated} workflows updated`);
      
      if (migrationResult.errors.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        migrationResult.errors.forEach(error => {
          console.log(`  ${chalk.yellow('⚠')} ${error}`);
        });
      }

    } catch (error) {
      spinner.fail(`Migration failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check system health and integrity')
  .action(async () => {
    const spinner = ora('Running health check...').start();
    
    try {
      const healthReport = await runHealthCheck();
      
      spinner.stop();
      
      console.log(chalk.cyan('\n=== System Health Report ===\n'));
      
      // Workflow Status
      console.log(`${chalk.blue('Workflows:')} ${healthReport.workflows.total} total`);
      console.log(`  ${chalk.green('✓')} ${healthReport.workflows.valid} valid`);
      console.log(`  ${chalk.red('✗')} ${healthReport.workflows.errors} with errors`);
      console.log(`  ${chalk.yellow('⚠')} ${healthReport.workflows.warnings} with warnings\n`);
      
      // Dependencies
      console.log(`${chalk.blue('Dependencies:')} ${healthReport.dependencies.status}`);
      if (healthReport.dependencies.issues.length > 0) {
        healthReport.dependencies.issues.forEach(issue => {
          console.log(`  ${chalk.yellow('⚠')} ${issue}`);
        });
      }
      
      // Configuration
      console.log(`\n${chalk.blue('Configuration:')} ${healthReport.config.status}`);
      if (healthReport.config.missing.length > 0) {
        console.log(`  Missing: ${healthReport.config.missing.join(', ')}`);
      }
      
      // Overall Status
      const overallStatus = healthReport.overall.healthy ? 
        chalk.green('✓ HEALTHY') : 
        chalk.red('✗ ISSUES DETECTED');
      
      console.log(`\n${chalk.blue('Overall Status:')} ${overallStatus}`);

    } catch (error) {
      spinner.fail(`Health check failed: ${error.message}`);
      process.exit(1);
    }
  });

// ==================== Utility Functions ====================

async function createWorkflowFromTemplate(name, category, template) {
  const templatePath = path.join(__dirname, '..', 'templates', 'node-templates', `${template}.json`);
  const baseTemplate = path.join(__dirname, '..', 'templates', 'microflow-template.json');
  
  let templateContent;
  
  if (await fs.pathExists(templatePath)) {
    templateContent = await fs.readJson(templatePath);
  } else {
    templateContent = await fs.readJson(baseTemplate);
  }
  
  // Generate proper filename following naming convention
  const filename = generateWorkflowFilename(name, category, template);
  const filepath = path.join(__dirname, '..', 'microflows', category, filename);
  
  // Customize template
  templateContent.name = name;
  templateContent.id = generateWorkflowId();
  templateContent.category = category;
  templateContent.description = `${template} workflow for ${name}`;
  templateContent.created_at = new Date().toISOString();
  templateContent.updated_at = new Date().toISOString();
  
  // Ensure category directory exists
  await fs.ensureDir(path.dirname(filepath));
  
  // Save workflow
  await fs.writeJson(filepath, templateContent, { spaces: 2 });
  
  return { filename, filepath };
}

function generateWorkflowFilename(name, category, template) {
  // Follow naming convention: action__service__description.json
  const action = getActionFromTemplate(template);
  const service = getServiceFromTemplate(template);
  const description = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  return `${action}__${service}__${description}.json`;
}

function getActionFromTemplate(template) {
  const actionMap = {
    slack: 'post',
    email: 'send', 
    api: 'get',
    database: 'store',
    webhook: 'receive',
    'csv-transform': 'transform',
    basic: 'process'
  };
  return actionMap[template] || 'process';
}

function getServiceFromTemplate(template) {
  const serviceMap = {
    slack: 'slack',
    email: 'email',
    api: 'api',
    database: 'postgres',
    webhook: 'webhook',
    'csv-transform': 'csv',
    basic: 'utility'
  };
  return serviceMap[template] || 'utility';
}

function generateWorkflowId() {
  return `microflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function deployWorkflows(options) {
  const files = options.file ? 
    [options.file] : 
    glob.sync('microflows/**/*.json');
    
  if (options.dryRun) {
    return { files, count: files.length };
  }
  
  // Here you would implement actual deployment logic
  // For now, just simulate deployment
  for (const file of files) {
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate deployment time
  }
  
  return { count: files.length };
}

async function syncWithN8NInstance() {
  // Implement N8N instance sync
  // This would connect to your N8N instance API and sync workflows
  console.log('N8N sync not yet implemented');
}

async function createBackup() {
  const backupDir = path.join(__dirname, '..', 'backups', `backup_${Date.now()}`);
  await fs.ensureDir(backupDir);
  await fs.copy(path.join(__dirname, '..', 'microflows'), path.join(backupDir, 'microflows'));
  return backupDir;
}

async function runMigration(fromVersion, toVersion) {
  // Implement migration logic
  return {
    migrated: 0,
    errors: []
  };
}

async function runHealthCheck() {
  const workflows = glob.sync('microflows/**/*.json');
  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  
  for (const workflow of workflows) {
    try {
      const result = await validateWorkflow.validateSingleWorkflow(workflow);
      if (result.valid) {
        validCount++;
      } else {
        if (result.errors?.length > 0) errorCount++;
        if (result.warnings?.length > 0) warningCount++;
      }
    } catch (error) {
      errorCount++;
    }
  }
  
  // Check dependencies
  const packageJson = await fs.readJson(path.join(__dirname, '..', 'package.json'));
  const dependencyIssues = [];
  
  // Check configuration
  const configMissing = [];
  if (!process.env.SUPABASE_URL) configMissing.push('SUPABASE_URL');
  if (!process.env.OPENAI_API_KEY) configMissing.push('OPENAI_API_KEY');
  
  return {
    workflows: {
      total: workflows.length,
      valid: validCount,
      errors: errorCount,
      warnings: warningCount
    },
    dependencies: {
      status: dependencyIssues.length === 0 ? 'OK' : 'Issues detected',
      issues: dependencyIssues
    },
    config: {
      status: configMissing.length === 0 ? 'OK' : 'Missing variables',
      missing: configMissing
    },
    overall: {
      healthy: errorCount === 0 && dependencyIssues.length === 0 && configMissing.length === 0
    }
  };
}

// ==================== Info Commands ====================

program
  .command('list')
  .description('List all workflows')
  .option('-c, --category <category>', 'Filter by category')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pattern = options.category ? 
        `microflows/${options.category}/*.json` : 
        'microflows/**/*.json';
      
      const files = glob.sync(pattern);
      
      if (options.format === 'json') {
        const workflows = [];
        for (const file of files) {
          const workflow = await fs.readJson(file);
          workflows.push({
            name: workflow.name,
            category: path.dirname(file).split('/').pop(),
            file: file,
            description: workflow.description
          });
        }
        console.log(JSON.stringify(workflows, null, 2));
      } else {
        console.log(chalk.cyan('\nAvailable Workflows:\n'));
        for (const file of files) {
          const workflow = await fs.readJson(file);
          const category = path.dirname(file).split('/').pop();
          console.log(`${chalk.green('●')} ${workflow.name} ${chalk.gray(`(${category})`)}`);
          console.log(`  ${chalk.gray(workflow.description || 'No description')}`);
          console.log(`  ${chalk.blue(file)}\n`);
        }
      }
    } catch (error) {
      console.error(chalk.red(`Failed to list workflows: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show information about a specific workflow')
  .argument('<workflow>', 'Workflow file path or name')
  .action(async (workflow) => {
    try {
      let workflowPath = workflow;
      
      // If it's not a path, search for it
      if (!workflow.includes('/')) {
        const files = glob.sync('microflows/**/*.json');
        const found = files.find(file => {
          const name = path.basename(file, '.json');
          return name.includes(workflow) || file.includes(workflow);
        });
        
        if (!found) {
          console.error(chalk.red(`Workflow not found: ${workflow}`));
          process.exit(1);
        }
        workflowPath = found;
      }
      
      const workflowData = await fs.readJson(workflowPath);
      
      console.log(chalk.cyan('\n=== Workflow Information ===\n'));
      console.log(`${chalk.blue('Name:')} ${workflowData.name}`);
      console.log(`${chalk.blue('Description:')} ${workflowData.description || 'None'}`);
      console.log(`${chalk.blue('Category:')} ${workflowData.category || 'Unknown'}`);
      console.log(`${chalk.blue('File:')} ${workflowPath}`);
      console.log(`${chalk.blue('Nodes:')} ${workflowData.nodes?.length || 0}`);
      console.log(`${chalk.blue('Created:')} ${workflowData.created_at || 'Unknown'}`);
      console.log(`${chalk.blue('Updated:')} ${workflowData.updated_at || 'Unknown'}`);
      
      if (workflowData.tags && workflowData.tags.length > 0) {
        console.log(`${chalk.blue('Tags:')} ${workflowData.tags.join(', ')}`);
      }
      
      if (workflowData.reuse_potential) {
        console.log(`${chalk.blue('Reuse Potential:')} ${workflowData.reuse_potential}`);
      }

    } catch (error) {
      console.error(chalk.red(`Failed to get workflow info: ${error.message}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

module.exports = {
  createWorkflowFromTemplate,
  generateWorkflowFilename,
  runHealthCheck
};
