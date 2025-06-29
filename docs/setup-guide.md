# N8N Microflows Setup Guide

Complete setup instructions for the N8N Microflows library with Supabase integration and structured safeguards.

## Phase 1: Repository Setup

### 1. Clone and Initialize

```bash
git clone https://github.com/HameedFarah/n8n-microflows.git
cd n8n-microflows
npm install
```

### 2. Environment Configuration

Copy the environment template:
```bash
cp .env.template .env
```

Configure your environment variables:
```env
# N8N Configuration
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI Configuration (for GPT workflows)
OPENAI_API_KEY=your_openai_api_key

# GitHub Configuration (for automated deployment)
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=HameedFarah
GITHUB_REPO=n8n-microflows

# Slack Configuration (for notification workflows)
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_SIGNING_SECRET=your_slack_signing_secret

# LinkedIn Configuration (for social workflows)
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
```

## Phase 2: Supabase Database Setup

### 1. Database Schema Creation

Run the Supabase setup script:
```bash
# Execute the SQL schema file in your Supabase SQL editor
cat schemas/supabase-setup.sql
```

This creates:
- Workflow metadata tables
- Execution logs
- Vector embeddings for search
- Tenant configuration tables
- Audit trails

### 2. Row Level Security (RLS)

The schema automatically enables RLS for multi-tenant isolation:
- `tenant_id` filtering on all data tables
- Secure audit logging
- GDPR compliance features

### 3. Vector Embeddings Setup

Generate embeddings for workflow discovery:
```bash
npm run generate-embeddings
```

## Phase 3: N8N Configuration

### 1. Install Required Nodes

Install additional N8N community nodes:
```bash
# In your N8N instance
npm install n8n-nodes-supabase
npm install n8n-nodes-openai
npm install n8n-nodes-slack
npm install n8n-nodes-linkedin
```

### 2. Configure Credentials

In N8N, set up these credential types:
- **Supabase**: URL and service role key
- **OpenAI**: API key
- **Slack**: Bot token and app credentials
- **LinkedIn**: OAuth2 client credentials
- **PostgreSQL**: Database connection for direct queries

### 3. Import Workflow Templates

Use the N8N CLI or UI to import workflows:
```bash
# Example: Import a specific workflow
n8n import:workflow --file=microflows/content/generate__gpt__product_review_article.json
```

## Phase 4: Validation and Testing

### 1. Run Validation Scripts

Validate all workflows:
```bash
npm run validate
```

Check naming conventions:
```bash
npm run check-naming
```

Validate documentation:
```bash
npm run check-docs
```

### 2. Test Individual Workflows

Test a specific microflow:
```bash
# Using the N8N MCP validator
node scripts/n8n-mcp-validator.js validate microflows/validation/validate__input__contract_upload.json
```

### 3. Integration Testing

Test workflow chaining:
```bash
npm run test-integration
```

## Phase 5: Advanced Features

### 1. Claude Desktop Self-Learning Module

If using Claude Desktop integration:

```javascript
// Example GitHub integration function
const integration = new GitHubIntegration(token, owner, repo);

// Search for similar workflows
const similar = await integration.searchExistingWorkflows(taskDescription);

// Analyze workflow structure
const analysis = await integration.analyzeWorkflowStructure(workflowId);

// Suggest workflow updates
const suggestions = await integration.suggestWorkflowUpdates(existingId, newRequirements);
```

### 2. Embedding and Discovery System

Generate and update workflow embeddings:
```bash
# Generate embeddings for all workflows
node scripts/generate-embeddings.js

# Find similar workflows
node scripts/find-similar-workflows.js "validate customer input data"
```

### 3. Real-time Validation

Enable real-time validation during workflow creation:
```bash
# Start the validation server
node scripts/validation-server.js
```

## Phase 6: Production Deployment

### 1. GitHub Actions Automation

The repository includes automated workflows:
- **Validation**: Runs on all PRs
- **Embedding Generation**: Updates search index
- **Catalog Updates**: Maintains documentation
- **Security Scanning**: Checks for vulnerabilities

### 2. Monitoring and Logging

Configure Supabase logging:
```sql
-- Enable execution logging
INSERT INTO execution_logs (workflow_id, status, execution_time_ms, tenant_id)
VALUES ('workflow_id', 'success', 1500, 'tenant_123');
```

### 3. Error Handling Framework

Implement structured error responses:
```javascript
// Example error handling in workflows
const errorHandler = {
  VALIDATION_ERROR: {
    user_message: "The workflow configuration is invalid",
    debug_info: "Detailed technical error for developers",
    suggested_fix: "Actionable steps to resolve",
    retry_recommended: true
  }
};
```

## Usage Examples

### 1. Basic Workflow Execution

```bash
# Trigger a validation workflow
curl -X POST http://localhost:5678/webhook/validate-contract \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://example.com/contract.pdf",
    "tenant_id": "tenant_123",
    "contract_type": "NDA"
  }'
```

### 2. Workflow Chaining

```javascript
// Chain multiple workflows
const result1 = await executeWorkflow('validate__input__contract_upload', inputData);
const result2 = await executeWorkflow('store__legal__contract_database', result1.output);
const result3 = await executeWorkflow('post__slack__team_notification', {
  channel: '#legal',
  message: `Contract processed: ${result2.contract_id}`
});
```

### 3. AI-Powered Workflow Selection

```javascript
// Use GPT to select appropriate workflow
const intent = await executeWorkflow('classify__gpt__task_intent', {
  task_description: "I need to validate customer data and send notifications",
  available_workflows: workflowCatalog
});

const selectedWorkflow = intent.output.suggested_flows[0];
```

## Troubleshooting

### Common Issues

1. **Schema Validation Errors**
   - Check workflow follows naming convention: `[function]__[tool]__[output]`
   - Ensure all required fields are present
   - Validate JSON syntax

2. **Supabase Connection Issues**
   - Verify service role key has correct permissions
   - Check RLS policies for tenant isolation
   - Ensure tables exist and are accessible

3. **N8N Integration Problems**
   - Confirm all required nodes are installed
   - Check credential configuration
   - Verify webhook endpoints are accessible

4. **Embedding Generation Failures**
   - Ensure OpenAI API key is valid
   - Check rate limits
   - Verify workflow content is properly formatted

### Debug Commands

```bash
# Check repository health
node scripts/github-integration.js health

# Validate specific workflow
node scripts/validate-workflow.js microflows/path/to/workflow.json

# Test Supabase connection
node scripts/supabase-integration.js test-connection

# Generate embeddings for single workflow
node scripts/generate-embeddings.js --single microflows/content/workflow.json
```

## Success Metrics

Track these metrics for system health:

- **Workflow Reuse Rate**: % of new workflows that reuse existing components
- **Validation Success Rate**: % of workflows passing all checks on first try  
- **Discovery Accuracy**: % of relevant workflows found by similarity search
- **Error Resolution Time**: Average time to resolve workflow issues
- **Documentation Completeness**: % of workflows with full documentation

## Next Steps

1. **Expand Workflow Library**: Add more microflows for your specific use cases
2. **Custom Node Development**: Create organization-specific N8N nodes
3. **Advanced AI Integration**: Implement workflow auto-generation
4. **Multi-Environment Setup**: Configure dev/staging/prod environments
5. **Performance Optimization**: Monitor and optimize workflow execution times

## Support

- **Documentation**: Check the `/docs` directory for detailed guides
- **Issues**: Report problems via GitHub Issues
- **Examples**: See workflow examples in each category directory
- **Community**: Join discussions for best practices and tips

The repository is now fully configured and ready for your AI-generated workflow system! 🚀
