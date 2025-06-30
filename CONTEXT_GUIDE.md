# Context Preservation Quick Start Guide

This guide shows how to use the new context preservation system to never lose workflow progress when switching chats.

## 🚀 Quick Setup (30 seconds)

```bash
# 1. Make sure you have your .env file configured
cp .env.template .env
# Edit .env with your Supabase credentials

# 2. Test the context system
npm run context-list

# 3. Start your first session
npm run session-start "my-slack-workflow" "Send notifications to team"
```

## 💡 How It Works

The context preservation system automatically:
- **Saves progress** every 3 validations or when nodes are added
- **Tracks tokens** used and estimates costs
- **Resumes sessions** from the exact step you left off
- **Works offline** with local fallback storage

## 📋 Basic Commands

### Start a Workflow Session
```bash
# Start a new workflow
npm run session-start "slack-notification" "Send alerts to Slack"

# Or use the enhanced validator directly
node scripts/enhanced-claude-validator.js session start "api-data-sync" "Sync data from external API"
```

### Save & Restore Context
```bash
# Manual save with current state
echo '{"workflow": {"nodes": []}}' > temp.json
npm run context-save "my-workflow" 3 temp.json

# Restore previous session
npm run context-restore "my-workflow"

# List all saved contexts
npm run context-list
```

### Session Management
```bash
# Check current session stats
npm run session-stats

# Create a checkpoint
npm run session-checkpoint "nodes configured"

# Enhanced validation with auto-save
node scripts/enhanced-claude-validator.js validate-enhanced workflow.json
```

## 🔧 Integration with Claude

The enhanced validator integrates seamlessly with your existing Claude workflow:

```bash
# Start a session
npm run session-start "email-automation"

# Claude can now validate with context preservation
# Progress is automatically saved and can be resumed later
```

## 💾 Storage Options

- **Supabase** (primary): Synced across devices and sessions
- **Local** (fallback): Works when offline or Supabase unavailable
- **Dual storage**: Best of both worlds with automatic fallback

## 🎯 What Gets Saved

- **Workflow structure**: Nodes, connections, metadata
- **Validation history**: All validation results and issues
- **User decisions**: Choices made during workflow creation
- **Progress tracking**: Current step, estimated completion
- **Token usage**: Cost tracking and estimation

## 📊 Session Information

Each session tracks:
- Current step (1-6 typically)
- Progress percentage
- Elapsed time
- Validation count
- Tokens used
- Estimated cost

## 🔄 Resume Workflow

When you resume a session, you get:
- **Previous state**: Exact workflow as you left it
- **Context**: What you were working on
- **Next steps**: Guidance on what to do next
- **Issue tracking**: Any validation issues to fix

## ⚡ Quick Examples

### Example 1: Slack Notification Workflow
```bash
# Start session
npm run session-start "send-slack-alert" "Send alert when API fails"

# Work on workflow in Claude...
# Context automatically saved every few validations

# Later, resume from anywhere
npm run context-restore "send-slack-alert"
```

### Example 2: API Integration
```bash
# Start complex workflow
npm run session-start "api-data-processor" "Process webhook data and update database"

# Create checkpoint at key milestone
npm run session-checkpoint "webhook configured"

# Continue working...
npm run session-stats  # Check progress
```

## 🛠️ Troubleshooting

### Context Not Saving?
```bash
# Check Supabase connection
npm run setup-supabase

# Verify local directory
ls -la .n8n-context/

# Test with manual save
echo '{"test": true}' > test.json
npm run context-save "test-workflow" 1 test.json
```

### Session Not Found?
```bash
# List all saved contexts
npm run context-list

# Check if using correct tenant ID
npm run context-restore "workflow-name" "your-tenant-id"
```

## 🎨 Advanced Usage

### Custom Tenant ID
```bash
# Save with specific tenant
node scripts/context-manager.js save "workflow" 2 data.json --tenant custom-tenant

# Restore with tenant
node scripts/context-manager.js restore "workflow" custom-tenant
```

### Integration with Existing Scripts
```javascript
const { EnhancedClaudeValidator } = require('./scripts/enhanced-claude-validator');

const validator = new EnhancedClaudeValidator();
await validator.startWorkflowSession('my-workflow', {
  userIntent: 'Create automated reporting system',
  tenantId: 'my-org',
  estimatedSteps: 8
});
```

## 📈 Benefits

- **Never lose progress** when switching between Claude chats
- **Resume exactly** where you left off
- **Track costs** and token usage automatically
- **Share contexts** across team members (with Supabase)
- **Work offline** with local fallback
- **Auto-save** prevents manual checkpoint management

## 🔮 Next Steps

This is **Phase 1** of the context preservation system. Coming next:

- **Phase 2**: Smart documentation caching (reduce Context7 API calls)
- **Phase 3**: Visual progress tracking and token estimation
- **MCP Server**: Direct integration with Claude Desktop

Ready to never lose workflow progress again? Start your first session:

```bash
npm run session-start "your-workflow-name" "describe what you want to build"
```
