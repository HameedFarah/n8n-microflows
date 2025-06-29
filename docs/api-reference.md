# API Documentation

## Overview

The N8N Microflows API provides programmatic access to workflow validation, discovery, and management capabilities. This documentation covers all available endpoints, authentication methods, and integration patterns.

## Base URL

```
https://your-domain.com/api/v1
```

## Authentication

All API requests require authentication using one of the following methods:

### API Key Authentication
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     https://your-domain.com/api/v1/workflows
```

### JWT Token Authentication
```bash
curl -H "Authorization: JWT YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     https://your-domain.com/api/v1/workflows
```

## Endpoints

### Workflow Management

#### `GET /workflows`

Retrieve a list of available workflows with optional filtering and pagination.

**Parameters:**
- `category` (string, optional): Filter by workflow category
- `complexity` (string, optional): Filter by complexity level (`simple`, `medium`, `complex`)
- `tags` (array, optional): Filter by tags
- `page` (integer, optional): Page number for pagination (default: 1)
- `limit` (integer, optional): Number of results per page (default: 20, max: 100)
- `reuse_potential` (string, optional): Filter by reuse potential (`high`, `medium`, `low`)

**Response:**
```json
{
  "workflows": [
    {
      "id": "slack-notification-basic",
      "name": "Basic Slack Notification",
      "category": "communication",
      "complexity": "simple",
      "reuse_potential": "high",
      "tags": ["slack", "notification", "communication"],
      "description": "Send a simple notification to a Slack channel",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-20T14:45:00Z",
      "node_count": 3,
      "estimated_runtime": "< 1 minute"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  },
  "filters_applied": {
    "category": "communication",
    "complexity": "simple"
  }
}
```

**Example Request:**
```bash
curl "https://your-domain.com/api/v1/workflows?category=communication&complexity=simple&limit=10" \
     -H "Authorization: Bearer YOUR_API_KEY"
```

#### `GET /workflows/{workflow_id}`

Retrieve detailed information about a specific workflow.

**Parameters:**
- `workflow_id` (string, required): Unique workflow identifier
- `include_definition` (boolean, optional): Include full workflow JSON (default: false)
- `include_metadata` (boolean, optional): Include extended metadata (default: true)

**Response:**
```json
{
  "id": "slack-notification-basic",
  "name": "Basic Slack Notification",
  "category": "communication",
  "complexity": "simple",
  "reuse_potential": "high",
  "tags": ["slack", "notification", "communication"],
  "description": "Send a simple notification to a Slack channel",
  "documentation": {
    "setup_instructions": "1. Configure Slack credentials...",
    "prerequisites": ["Slack workspace access", "Bot token"],
    "use_cases": ["Alert notifications", "Status updates"]
  },
  "configuration": {
    "required_credentials": ["slack"],
    "required_parameters": ["channel", "message"],
    "optional_parameters": ["username", "icon_emoji"]
  },
  "metrics": {
    "usage_count": 127,
    "success_rate": 98.5,
    "avg_execution_time": "1.2s"
  },
  "definition": {
    "nodes": [...],
    "connections": {...}
  }
}
```

#### `POST /workflows/{workflow_id}/validate`

Validate a workflow configuration before deployment.

**Request Body:**
```json
{
  "workflow_definition": {
    "nodes": [...],
    "connections": {...}
  },
  "configuration": {
    "slack_channel": "#general",
    "message": "Hello world"
  },
  "validation_level": "strict"
}
```

**Response:**
```json
{
  "valid": true,
  "validation_id": "val_abc123",
  "timestamp": "2024-01-20T15:30:00Z",
  "checks_performed": [
    {
      "type": "schema_validation",
      "status": "passed",
      "message": "Workflow structure is valid"
    },
    {
      "type": "naming_convention",
      "status": "passed",
      "message": "All naming conventions followed"
    },
    {
      "type": "dependency_check",
      "status": "passed",
      "message": "All required dependencies available"
    }
  ],
  "warnings": [
    {
      "type": "performance",
      "message": "Consider adding error handling for network timeouts",
      "severity": "low"
    }
  ],
  "suggestions": [
    {
      "type": "optimization",
      "message": "Add retry logic for improved reliability",
      "recommended_changes": [...]
    }
  ]
}
```

### Workflow Discovery

#### `POST /workflows/search`

Search for workflows using natural language queries or similarity matching.

**Request Body:**
```json
{
  "query": "send email when form submitted",
  "search_type": "semantic",
  "max_results": 10,
  "similarity_threshold": 0.75,
  "filters": {
    "category": ["communication", "automation"],
    "complexity": ["simple", "medium"]
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "workflow_id": "email-form-notification",
      "similarity_score": 0.92,
      "match_reasons": [
        "Form submission trigger",
        "Email notification action",
        "Data processing logic"
      ],
      "workflow_summary": {
        "name": "Form Submission Email Notification",
        "description": "Automatically send email notifications when forms are submitted",
        "category": "communication",
        "complexity": "medium"
      }
    }
  ],
  "search_metadata": {
    "query_processed": "send email when form submitted",
    "search_time_ms": 45,
    "total_workflows_searched": 156
  }
}
```

#### `GET /workflows/similar/{workflow_id}`

Find workflows similar to a given workflow.

**Parameters:**
- `workflow_id` (string, required): Reference workflow ID
- `limit` (integer, optional): Number of results (default: 5, max: 20)
- `threshold` (float, optional): Similarity threshold (default: 0.7)

**Response:**
```json
{
  "reference_workflow": {
    "id": "slack-notification-basic",
    "name": "Basic Slack Notification"
  },
  "similar_workflows": [
    {
      "id": "discord-notification",
      "name": "Discord Channel Notification",
      "similarity_score": 0.85,
      "common_patterns": [
        "Message formatting",
        "Channel selection",
        "Error handling"
      ]
    }
  ]
}
```

### Configuration Management

#### `GET /tenants/{tenant_id}/configurations`

Retrieve tenant-specific workflow configurations.

**Parameters:**
- `tenant_id` (string, required): Tenant identifier
- `workflow_id` (string, optional): Filter by specific workflow

**Response:**
```json
{
  "tenant_id": "tenant_123",
  "configurations": [
    {
      "workflow_id": "slack-notification-basic",
      "enabled": true,
      "custom_config": {
        "default_channel": "#notifications",
        "rate_limit": "10/minute",
        "retry_attempts": 3
      },
      "last_updated": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### `PUT /tenants/{tenant_id}/configurations/{workflow_id}`

Update tenant-specific workflow configuration.

**Request Body:**
```json
{
  "enabled": true,
  "config": {
    "default_channel": "#alerts",
    "rate_limit": "20/minute",
    "retry_attempts": 5,
    "timeout_seconds": 30
  }
}
```

### Analytics and Monitoring

#### `GET /analytics/usage`

Retrieve workflow usage analytics.

**Parameters:**
- `workflow_id` (string, optional): Filter by workflow
- `tenant_id` (string, optional): Filter by tenant
- `start_date` (string, optional): Start date (ISO 8601)
- `end_date` (string, optional): End date (ISO 8601)
- `granularity` (string, optional): Data granularity (`hour`, `day`, `week`, `month`)

**Response:**
```json
{
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "metrics": {
    "total_executions": 1247,
    "success_rate": 97.8,
    "avg_execution_time": "2.1s",
    "error_rate": 2.2
  },
  "usage_by_day": [
    {
      "date": "2024-01-01",
      "executions": 45,
      "success_rate": 98.0
    }
  ],
  "top_workflows": [
    {
      "workflow_id": "slack-notification-basic",
      "executions": 234,
      "success_rate": 99.1
    }
  ]
}
```

#### `GET /analytics/performance`

Retrieve performance metrics for workflows.

**Response:**
```json
{
  "performance_summary": {
    "avg_execution_time": "1.8s",
    "95th_percentile": "4.2s",
    "99th_percentile": "8.1s"
  },
  "workflow_performance": [
    {
      "workflow_id": "slack-notification-basic",
      "avg_time": "1.2s",
      "success_rate": 99.1,
      "error_types": [
        {
          "type": "network_timeout",
          "count": 3,
          "percentage": 1.2
        }
      ]
    }
  ]
}
```

### Health and Status

#### `GET /health`

Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T15:30:00Z",
  "version": "1.0.0",
  "components": {
    "database": "healthy",
    "cache": "healthy",
    "external_apis": "healthy"
  },
  "uptime": "23d 14h 32m"
}
```

#### `GET /status`

Get detailed system status.

**Response:**
```json
{
  "api_version": "1.0.0",
  "total_workflows": 156,
  "active_tenants": 23,
  "system_load": {
    "cpu_usage": "12%",
    "memory_usage": "45%",
    "disk_usage": "23%"
  },
  "recent_activity": {
    "validations_last_hour": 45,
    "searches_last_hour": 128,
    "errors_last_hour": 2
  }
}
```

## Error Handling

The API uses standard HTTP status codes and returns detailed error information:

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Workflow validation failed",
    "details": {
      "validation_errors": [
        {
          "field": "nodes[0].parameters.channel",
          "message": "Channel parameter is required",
          "code": "REQUIRED_FIELD_MISSING"
        }
      ]
    },
    "request_id": "req_abc123",
    "timestamp": "2024-01-20T15:30:00Z"
  }
}
```

### Common Error Codes

| Status Code | Error Code | Description |
|------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Request format or parameters are invalid |
| 401 | `UNAUTHORIZED` | Authentication required or invalid |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 422 | `VALIDATION_FAILED` | Request validation failed |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default limits**: 1000 requests per hour per API key
- **Burst limit**: 10 requests per second
- **Search endpoints**: 100 requests per hour per API key

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 956
X-RateLimit-Reset: 1642694400
```

## Webhooks

Configure webhooks to receive real-time notifications:

### Webhook Events

- `workflow.validation.completed` - Workflow validation finished
- `workflow.execution.started` - Workflow execution began
- `workflow.execution.completed` - Workflow execution finished
- `workflow.execution.failed` - Workflow execution failed
- `tenant.configuration.updated` - Tenant configuration changed

### Webhook Payload Example
```json
{
  "event": "workflow.validation.completed",
  "timestamp": "2024-01-20T15:30:00Z",
  "data": {
    "validation_id": "val_abc123",
    "workflow_id": "slack-notification-basic",
    "tenant_id": "tenant_123",
    "result": "passed",
    "details": {...}
  }
}
```

## SDKs and Libraries

Official SDKs are available for popular programming languages:

- **JavaScript/Node.js**: `npm install @n8n/microflows-sdk`
- **Python**: `pip install n8n-microflows-sdk`
- **Go**: `go get github.com/n8n-io/microflows-sdk-go`

### SDK Example (JavaScript)
```javascript
import { MicroflowsClient } from '@n8n/microflows-sdk';

const client = new MicroflowsClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://your-domain.com/api/v1'
});

// Search for workflows
const results = await client.workflows.search({
  query: 'send email notification',
  maxResults: 5
});

// Validate a workflow
const validation = await client.workflows.validate('workflow-id', {
  configuration: { channel: '#general' }
});
```

## Best Practices

1. **Caching**: Implement client-side caching for workflow definitions
2. **Error Handling**: Always handle API errors gracefully
3. **Rate Limiting**: Implement exponential backoff for rate limit responses
4. **Security**: Never expose API keys in client-side code
5. **Pagination**: Use pagination for large result sets
6. **Webhooks**: Use webhooks for real-time updates instead of polling

## Support

- **Documentation**: [https://docs.n8n-microflows.com](https://docs.n8n-microflows.com)
- **GitHub Issues**: [https://github.com/HameedFarah/n8n-microflows/issues](https://github.com/HameedFarah/n8n-microflows/issues)
- **Discord Community**: [https://discord.gg/n8n-microflows](https://discord.gg/n8n-microflows)
- **Email Support**: support@n8n-microflows.com
