# Integration Guide

## Overview

This guide explains how to integrate N8N microflows into your applications and automation systems.

## N8N Setup

### 1. Import Workflows

```bash
# Method 1: Copy JSON directly
cp microflows/content/generate__gpt__article.json ~/n8n/workflows/

# Method 2: Use N8N import feature
# 1. Open N8N web interface
# 2. Click "Import from file"
# 3. Select the JSON file
# 4. Configure credentials
```

### 2. Configure Credentials

Required credentials for microflows:

#### Supabase
```json
{
  "name": "Supabase API",
  "type": "supabaseApi",
  "data": {
    "host": "your-project.supabase.co",
    "serviceRole": "your-service-role-key"
  }
}
```

#### OpenAI
```json
{
  "name": "OpenAI API",
  "type": "openAiApi", 
  "data": {
    "apiKey": "sk-your-openai-key"
  }
}
```

#### Slack (if using communication workflows)
```json
{
  "name": "Slack API",
  "type": "slackApi",
  "data": {
    "accessToken": "xoxb-your-bot-token"
  }
}
```

### 3. Environment Variables

Set these in your N8N environment:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI Configuration  
OPENAI_API_KEY=sk-your-openai-key

# Tenant Configuration
DEFAULT_TENANT_ID=your-default-tenant
```

## API Integration

### Webhook Triggers

Most microflows can be triggered via webhooks:

```javascript
// Example: Trigger content generation
const response = await fetch('https://your-n8n.com/webhook/generate-article', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tenant_id: 'your-tenant-id',
    topic: 'AI automation trends',
    target_audience: 'developers',
    word_count: 1000
  })
});

const result = await response.json();
console.log('Generated article:', result);
```

### Direct N8N API

```javascript
// Using N8N API directly
const n8nApi = 'https://your-n8n.com/api/v1';
const apiKey = 'your-n8n-api-key';

// Execute workflow
const execution = await fetch(`${n8nApi}/workflows/workflow-id/execute`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    data: {
      tenant_id: 'your-tenant-id',
      // ... other inputs
    }
  })
});
```

## Chaining Workflows

### Sequential Execution

```javascript
// Chain multiple workflows
async function executeWorkflowChain(initialData) {
  // Step 1: Validate input
  const validation = await executeWorkflow('validate__input__user_data', {
    ...initialData,
    tenant_id: 'tenant-123'
  });
  
  if (validation.status !== 'success') {
    throw new Error('Validation failed: ' + validation.error.message);
  }
  
  // Step 2: Process data
  const processed = await executeWorkflow('transform__code__normalize_data', {
    data: validation.result,
    tenant_id: 'tenant-123'
  });
  
  // Step 3: Store result
  const stored = await executeWorkflow('store__supabase__processed_data', {
    data: processed.result,
    tenant_id: 'tenant-123'
  });
  
  return stored.result;
}
```

### Parallel Execution

```javascript
// Execute multiple workflows in parallel
async function parallelProcessing(data) {
  const promises = [
    executeWorkflow('generate__gpt__summary', data),
    executeWorkflow('classify__gpt__content_type', data),
    executeWorkflow('extract__code__keywords', data)
  ];
  
  const [summary, classification, keywords] = await Promise.all(promises);
  
  return {
    summary: summary.result,
    category: classification.result.category,
    keywords: keywords.result
  };
}
```

## Multi-Tenant Configuration

### Database Setup

```sql
-- Enable RLS for tenant isolation
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_workflow_configs ENABLE ROW LEVEL SECURITY;

-- Create tenant-specific policies
CREATE POLICY tenant_isolation_logs ON execution_logs 
  FOR ALL USING (tenant_id = current_setting('app.current_tenant'));

CREATE POLICY tenant_isolation_configs ON tenant_workflow_configs 
  FOR ALL USING (tenant_id = current_setting('app.current_tenant'));
```

### Runtime Configuration

```javascript
// Set tenant context before workflow execution
function setTenantContext(tenantId) {
  // This would be implemented in your N8N environment
  process.env.CURRENT_TENANT = tenantId;
}

// Execute workflow with tenant context
async function executeWithTenant(workflowId, data, tenantId) {
  setTenantContext(tenantId);
  
  const result = await executeWorkflow(workflowId, {
    ...data,
    tenant_id: tenantId
  });
  
  return result;
}
```

## Error Handling

### Structured Error Responses

All microflows return structured error responses:

```javascript
function handleWorkflowError(error) {
  switch (error.error_code) {
    case 'VALIDATION_FAILED':
      // Handle validation errors
      console.log('Input validation failed:', error.message);
      break;
      
    case 'API_RATE_LIMIT':
      // Handle rate limiting
      if (error.retry_suggested) {
        setTimeout(() => retryWorkflow(), 5000);
      }
      break;
      
    case 'INSUFFICIENT_CREDITS':
      // Handle billing issues
      notifyBillingTeam(error.message);
      break;
      
    default:
      // Handle unknown errors
      console.error('Workflow error:', error);
  }
}
```

### Retry Logic

```javascript
async function executeWithRetry(workflowId, data, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeWorkflow(workflowId, data);
      
      if (result.status === 'success') {
        return result;
      }
      
      if (!result.error.retry_suggested || attempt === maxRetries) {
        throw new Error(result.error.message);
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
}
```

## Monitoring & Analytics

### Execution Tracking

```javascript
// Monitor workflow executions
async function getWorkflowMetrics(workflowId, tenantId, timeRange) {
  const { data } = await supabase
    .from('execution_logs')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('tenant_id', tenantId)
    .gte('created_at', timeRange.start)
    .lte('created_at', timeRange.end);
    
  return {
    total_executions: data.length,
    success_rate: data.filter(e => e.status === 'success').length / data.length,
    avg_execution_time: data.reduce((acc, e) => acc + e.execution_time_ms, 0) / data.length,
    error_types: data
      .filter(e => e.status === 'error')
      .map(e => e.error_details.error_code)
  };
}
```

### Performance Monitoring

```javascript
// Track performance metrics
function trackExecution(workflowId, tenantId, startTime) {
  const executionTime = Date.now() - startTime;
  
  // Log to your monitoring system
  metrics.increment('workflow.executions', {
    workflow_id: workflowId,
    tenant_id: tenantId
  });
  
  metrics.timing('workflow.execution_time', executionTime, {
    workflow_id: workflowId,
    tenant_id: tenantId
  });
}
```

## Best Practices

### Input Validation

```javascript
// Always validate inputs before execution
function validateWorkflowInput(workflowId, data) {
  const schema = getWorkflowSchema(workflowId);
  const validation = validateJson(data, schema.inputs.schema);
  
  if (!validation.valid) {
    throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
  }
  
  return validation.data;
}
```

### Resource Management

```javascript
// Implement rate limiting
const rateLimiter = new Map();

function checkRateLimit(tenantId, workflowId) {
  const key = `${tenantId}:${workflowId}`;
  const now = Date.now();
  const window = 60000; // 1 minute
  const limit = 100; // requests per minute
  
  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, { count: 0, resetTime: now + window });
  }
  
  const limiter = rateLimiter.get(key);
  
  if (now > limiter.resetTime) {
    limiter.count = 0;
    limiter.resetTime = now + window;
  }
  
  if (limiter.count >= limit) {
    throw new Error('Rate limit exceeded');
  }
  
  limiter.count++;
}
```

### Security

```javascript
// Validate tenant access
function validateTenantAccess(tenantId, workflowId) {
  // Check if tenant has access to this workflow
  const hasAccess = checkTenantPermissions(tenantId, workflowId);
  
  if (!hasAccess) {
    throw new Error('Unauthorized access to workflow');
  }
}

// Sanitize inputs
function sanitizeInput(data) {
  // Remove potentially dangerous content
  return sanitizeHtml(JSON.stringify(data));
}
```

This integration guide provides the foundation for successfully implementing N8N microflows in your systems. Adapt the examples to your specific technology stack and requirements.
