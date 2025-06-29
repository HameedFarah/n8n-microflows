# Troubleshooting Guide

## Overview

This guide helps you diagnose and resolve common issues with the N8N Microflows system. Issues are organized by category with step-by-step solutions.

## Quick Diagnostic Tools

### System Health Check
```bash
# Check all system components
npm run test -- --filter=integration

# Check specific component
npm run test -- --filter=security
npm run test -- --filter=performance
```

### Validation Issues
```bash
# Validate specific workflow
npm run validate -- microflows/communication/slack-notification.json

# Validate all workflows
npm run validate-all

# Check naming conventions
npm run check-naming
```

## Common Issues

### 1. Workflow Validation Failures

#### **Problem**: Schema validation fails
```
Error: Workflow validation failed - Invalid node structure
```

**Diagnosis:**
```bash
# Check the specific workflow structure
node scripts/validate-workflow.js microflows/your-workflow.json --verbose
```

**Solutions:**

1. **Check JSON syntax**:
   ```bash
   # Validate JSON format
   cat microflows/your-workflow.json | jq .
   ```

2. **Verify required fields**:
   ```json
   {
     "nodes": [],           // Required: Must be array
     "connections": {},     // Required: Must be object
     "meta": {             // Recommended
       "description": "...",
       "tags": [...]
     }
   }
   ```

3. **Common schema issues**:
   - Missing `nodes` array
   - Invalid `connections` object structure
   - Incorrect node ID references
   - Missing required node parameters

#### **Problem**: Node connection validation fails
```
Error: Connection references non-existent node: xyz123
```

**Solutions:**

1. **Check node IDs match connections**:
   ```javascript
   // In your workflow JSON, verify:
   {
     "nodes": [
       { "id": "node1", "type": "..." },
       { "id": "node2", "type": "..." }
     ],
     "connections": {
       "node1": {                    // Must match node ID
         "main": [
           [{ "node": "node2" }]     // Must reference existing node
         ]
       }
     }
   }
   ```

2. **Use validation script**:
   ```bash
   node scripts/validation-pipeline-integration.js --file your-workflow.json
   ```

### 2. Naming Convention Issues

#### **Problem**: Naming convention violations
```
Error: Workflow name doesn't follow naming convention
```

**Solutions:**

1. **File naming**:
   - Use kebab-case: `slack-notification-basic.json` ✅
   - Avoid spaces: `slack notification.json` ❌
   - Avoid uppercase: `SlackNotification.json` ❌

2. **Workflow naming**:
   ```json
   {
     "name": "Slack Notification Basic",  // ✅ Title Case
     "meta": {
       "description": "Send basic slack notifications"  // ✅ Sentence case
     }
   }
   ```

3. **Check naming rules**:
   ```bash
   npm run check-naming -- --fix  # Auto-fix where possible
   ```

### 3. GitHub Actions CI/CD Issues

#### **Problem**: GitHub Actions workflow fails
```
Error: npm run validate failed with exit code 1
```

**Diagnosis:**

1. **Check workflow logs**:
   - Go to GitHub Actions tab
   - Click on failed workflow
   - Expand failed step logs

2. **Local reproduction**:
   ```bash
   # Run the same commands locally
   npm ci
   npm run validate
   npm run check-naming
   npm run check-docs
   ```

**Solutions:**

1. **Common CI fixes**:
   ```bash
   # Update package-lock.json
   rm package-lock.json node_modules -rf
   npm install
   git add package-lock.json
   git commit -m "Update dependencies"
   ```

2. **Environment variables**:
   ```yaml
   # In GitHub secrets, add:
   SUPABASE_URL: your_supabase_url
   SUPABASE_ANON_KEY: your_anon_key
   OPENAI_API_KEY: your_openai_key  # For embeddings
   ```

#### **Problem**: Security scan failures
```
Error: Potential hardcoded credentials found
```

**Solutions:**

1. **Remove hardcoded values**:
   ```json
   // ❌ Bad
   {
     "parameters": {
       "token": "xoxb-your-slack-token"
     }
   }
   
   // ✅ Good
   {
     "parameters": {
       "token": "={{$credentials.slack.token}}"
     }
   }
   ```

2. **Use environment variables**:
   ```json
   {
     "parameters": {
       "apiKey": "={{$env.API_KEY}}"
     }
   }
   ```

### 4. Supabase Integration Issues

#### **Problem**: Database connection fails
```
Error: Failed to connect to Supabase
```

**Diagnosis:**
```bash
# Test Supabase connection
node scripts/setup-supabase.js --test-only
```

**Solutions:**

1. **Check environment variables**:
   ```bash
   # Verify .env file
   cat .env
   # Should contain:
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key
   SUPABASE_ANON_KEY=your_anon_key
   ```

2. **Verify Supabase setup**:
   ```bash
   # Reset and recreate database
   npm run setup-supabase
   ```

3. **Check database schema**:
   ```sql
   -- Verify tables exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

#### **Problem**: Vector embedding generation fails
```
Error: OpenAI API call failed
```

**Solutions:**

1. **Check OpenAI API key**:
   ```bash
   # Test API key
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
        https://api.openai.com/v1/models
   ```

2. **Regenerate embeddings**:
   ```bash
   npm run generate-embeddings -- --force-refresh
   ```

### 5. Performance Issues

#### **Problem**: Slow validation performance
```
Warning: Validation taking longer than expected
```

**Diagnosis:**
```bash
# Run performance benchmarks
npm run test -- --filter=performance --verbose
```

**Solutions:**

1. **Optimize workflow files**:
   ```bash
   # Check file sizes
   find microflows/ -name "*.json" -exec wc -c {} + | sort -n
   
   # Compress large workflows
   node scripts/optimize-workflows.js
   ```

2. **Cache improvements**:
   ```bash
   # Clear and rebuild cache
   rm -rf node_modules/.cache
   npm run validate -- --rebuild-cache
   ```

### 6. Claude Integration Issues

#### **Problem**: Claude validation fails
```
Error: Claude real-time validation timeout
```

**Solutions:**

1. **Check Claude MCP connection**:
   ```bash
   # Test MCP tools
   node scripts/claude-real-time-validator.js --test-connection
   ```

2. **Adjust timeout settings**:
   ```javascript
   // In claude-real-time-validator.js
   const VALIDATION_TIMEOUT = 30000; // Increase timeout
   ```

3. **Fallback validation**:
   ```bash
   # Use local validation instead
   npm run validate -- --no-claude-integration
   ```

### 7. N8N MCP Tools Issues

#### **Problem**: MCP tools not responding
```
Error: N8N MCP tools connection failed
```

**Solutions:**

1. **Check MCP server status**:
   ```bash
   # Verify MCP server is running
   curl http://localhost:3000/health
   ```

2. **Restart MCP tools**:
   ```bash
   # Restart the MCP tools server
   npm run mcp:restart
   ```

3. **Update MCP configuration**:
   ```json
   // In package.json MCP config
   {
     "mcp": {
       "tools": {
         "n8n": {
           "enabled": true,
           "endpoint": "http://localhost:3000"
         }
       }
     }
   }
   ```

## Advanced Debugging

### Enable Debug Logging

1. **Environment variable**:
   ```bash
   export DEBUG=n8n-microflows:*
   npm run validate
   ```

2. **Script-specific debugging**:
   ```bash
   node scripts/validate-workflow.js --debug --verbose
   ```

### Memory and Resource Issues

1. **Increase Node.js memory**:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run validate-all
   ```

2. **Monitor resource usage**:
   ```bash
   # Monitor during validation
   top -p $(pgrep -f "node.*validate")
   ```

### Database Debugging

1. **Enable SQL logging**:
   ```javascript
   // In supabase-integration.js
   const supabase = createClient(url, key, {
     db: { schema: 'public' },
     global: { headers: { 'x-debug-sql': 'true' } }
   });
   ```

2. **Query performance analysis**:
   ```sql
   -- Check slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   ```

## Error Code Reference

| Error Code | Description | Solution |
|------------|-------------|----------|
| `VALIDATION_001` | Invalid JSON syntax | Check JSON with `jq` or JSON validator |
| `VALIDATION_002` | Missing required field | Add required fields to workflow |
| `VALIDATION_003` | Invalid node reference | Fix node ID references in connections |
| `NAMING_001` | Invalid filename format | Use kebab-case naming |
| `NAMING_002` | Invalid workflow name | Use Title Case for workflow names |
| `DB_001` | Database connection failed | Check Supabase credentials |
| `DB_002` | Query timeout | Optimize query or increase timeout |
| `API_001` | API rate limit exceeded | Implement rate limiting and retry logic |
| `API_002` | Authentication failed | Check API keys and permissions |
| `CLAUDE_001` | Claude integration timeout | Increase timeout or use local validation |
| `MCP_001` | MCP tools unavailable | Restart MCP server |

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide**
2. **Run diagnostic commands**:
   ```bash
   npm run test -- --verbose
   npm run validate -- --debug
   ```
3. **Check system requirements**:
   - Node.js 16+ ✅
   - npm 8+ ✅
   - Sufficient disk space (>1GB) ✅

### Information to Include

When reporting issues, include:

1. **Error message** (full stack trace)
2. **System information**:
   ```bash
   node --version
   npm --version
   cat package.json | jq '.version'
   ```
3. **Steps to reproduce**
4. **Expected vs actual behavior**
5. **Environment details** (OS, CI/CD system, etc.)

### Support Channels

- **GitHub Issues**: [Create issue](https://github.com/HameedFarah/n8n-microflows/issues/new)
- **Documentation**: [Read docs](./setup-guide.md)
- **Discord Community**: [Join discussion](https://discord.gg/n8n-microflows)

### Self-Service Tools

1. **Auto-fix common issues**:
   ```bash
   npm run fix-common-issues
   ```

2. **System health check**:
   ```bash
   npm run health-check
   ```

3. **Reset to clean state**:
   ```bash
   npm run reset-environment
   ```

## Prevention Tips

### Development Best Practices

1. **Always validate locally** before pushing:
   ```bash
   npm run validate-all && git push
   ```

2. **Use pre-commit hooks**:
   ```bash
   npm install --save-dev husky
   npx husky add .husky/pre-commit "npm run validate-all"
   ```

3. **Keep dependencies updated**:
   ```bash
   npm audit fix
   npm update
   ```

### Monitoring and Alerts

1. **Set up health monitoring**:
   ```bash
   # Add to crontab
   0 */6 * * * cd /path/to/project && npm run health-check
   ```

2. **GitHub Actions notifications**:
   - Enable email notifications for failed builds
   - Set up Slack integration for CI/CD alerts

3. **Database monitoring**:
   - Monitor Supabase usage and performance
   - Set up alerts for quota limits

## Frequently Asked Questions

### Q: Can I run the system without Supabase?
A: Yes, set `SUPABASE_ENABLED=false` in your environment. The system will use local file storage for metadata.

### Q: How do I migrate from old workflow format?
A: Use the migration script:
```bash
node scripts/migrate-workflows.js --from-version=1.0 --to-version=2.0
```

### Q: Can I disable specific validation checks?
A: Yes, configure in `.n8n-microflows.config.js`:
```javascript
module.exports = {
  validation: {
    skipNamingCheck: true,
    skipSchemaValidation: false
  }
};
```

### Q: How do I add custom validation rules?
A: Create custom validators in `scripts/custom-validators/`:
```javascript
// scripts/custom-validators/my-validator.js
module.exports = {
  name: 'my-custom-rule',
  validate: (workflow) => {
    // Your validation logic
    return { valid: true, errors: [] };
  }
};
```
