# 🚀 N8N Microflows Deployment Guide

## Quick Start

### Prerequisites
- Node.js 16+ and npm 8+
- Docker and Docker Compose (for containerized deployment)
- Git

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/HameedFarah/n8n-microflows.git
cd n8n-microflows

# Install dependencies
npm install

# Make CLI executable (Unix/Linux/Mac)
chmod +x scripts/cli.js

# Link CLI globally (optional)
npm link
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.template .env

# Edit environment variables
vim .env
```

Required environment variables:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
GITHUB_TOKEN=your_github_token
```

### 3. Database Setup

```bash
# Initialize Supabase database
npm run setup-supabase

# Generate embeddings for existing workflows
npm run generate-embeddings
```

## CLI Usage

### Basic Commands

```bash
# Create a new workflow
n8n-microflows create --template slack --name "team-notifications"

# List all workflows
n8n-microflows list

# Validate workflows
n8n-microflows validate

# Search workflows using AI
n8n-microflows search "send email notifications"

# Get workflow information
n8n-microflows info team-notifications

# Check system health
n8n-microflows health

# Deploy workflows
n8n-microflows deploy --env production

# Migrate workflows to new version
n8n-microflows migrate
```

### Advanced Commands

```bash
# Sync with external systems
n8n-microflows sync --github --supabase

# Run comprehensive validation
npm run validate-all

# Start development mode
npm run dev

# Run tests
npm test
```

## Docker Deployment

### Development Environment

```bash
# Build and run development environment
docker-compose up -d

# View logs
docker-compose logs -f n8n-microflows

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Build production image
docker build -t n8n-microflows:latest .

# Run production stack
docker-compose -f docker-compose.yml up -d

# Scale services (if needed)
docker-compose up --scale n8n-microflows=3 -d
```

### Environment Configuration

Create a `.env` file for Docker:

```env
# Database
POSTGRES_DB=n8n
POSTGRES_USER=n8n
POSTGRES_PASSWORD=secure_password

# N8N Configuration
N8N_AUTH_USER=admin
N8N_AUTH_PASSWORD=secure_password
N8N_HOST=localhost
N8N_WEBHOOK_URL=http://localhost:5678

# Monitoring
GRAFANA_PASSWORD=admin

# Application
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
```

## Workflow Templates

### Using Built-in Templates

The system includes several ready-to-use templates:

1. **Email Marketing Campaign** (`templates/workflows/email-marketing-campaign.json`)
   - Automated email campaigns with personalization
   - Analytics tracking and subscriber management
   - Suitable for marketing teams

2. **Lead Generation & CRM** (`templates/workflows/lead-generation-crm.json`)
   - Lead capture with data enrichment
   - Scoring and routing to sales teams
   - CRM integration ready

3. **Social Media Automation** (`templates/workflows/social-media-automation.json`)
   - Multi-platform posting (Twitter, LinkedIn, Facebook)
   - Content scheduling and analytics
   - AI content generation integration

### Creating Custom Templates

```bash
# Create a new workflow from template
n8n-microflows create --template email --name "welcome-series"

# Customize the generated workflow
vim microflows/communication/send__email__welcome_series.json

# Validate your changes
n8n-microflows validate --file microflows/communication/send__email__welcome_series.json
```

## Migration and Upgrades

### Workflow Migration

```bash
# Check current versions
node scripts/migration-tool.js

# Migrate all workflows
npm run migrate

# Migrate specific workflow
node scripts/migration-tool.js migrate-specific
```

### Version Upgrade Process

1. **Backup existing workflows**
   ```bash
   node scripts/migration-tool.js backup
   ```

2. **Check compatibility**
   ```bash
   node scripts/migration-tool.js check-versions
   ```

3. **Run migration**
   ```bash
   node scripts/migration-tool.js migrate-all
   ```

4. **Validate results**
   ```bash
   npm run validate-all
   ```

## Monitoring and Analytics

### Health Monitoring

```bash
# Check system health
n8n-microflows health

# Run comprehensive diagnostics
npm run test:integration
```

### Grafana Dashboard

Access monitoring dashboard at `http://localhost:3001` (default credentials: admin/admin)

### Key Metrics

- Workflow execution success rate
- Validation pass rate
- System resource usage
- Error frequency and types

## Production Considerations

### Security

1. **Environment Variables**
   - Never commit `.env` files
   - Use secure passwords
   - Rotate API keys regularly

2. **Network Security**
   - Use HTTPS in production
   - Implement proper firewall rules
   - Enable rate limiting

3. **Access Control**
   - Set up proper user authentication
   - Use role-based access control
   - Audit access logs

### Performance

1. **Database Optimization**
   - Enable connection pooling
   - Set up read replicas for analytics
   - Regular maintenance and backups

2. **Caching**
   - Redis for session management
   - Cache workflow validation results
   - CDN for static assets

3. **Scaling**
   - Horizontal scaling with Docker Swarm/Kubernetes
   - Load balancing for high availability
   - Auto-scaling based on CPU/memory usage

### Backup Strategy

```bash
# Daily automated backups
0 2 * * * cd /path/to/n8n-microflows && node scripts/migration-tool.js backup

# Database backups
0 3 * * * docker exec n8n-postgres pg_dump -U n8n n8n > /backups/db_$(date +%Y%m%d).sql
```

## Troubleshooting

### Common Issues

1. **Installation Problems**
   ```bash
   # Clear npm cache
   npm cache clean --force
   
   # Reinstall dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Validation Errors**
   ```bash
   # Check specific workflow
   n8n-microflows validate --file path/to/workflow.json
   
   # Auto-fix common issues
   npm run fix-common-issues
   ```

3. **Database Connection Issues**
   ```bash
   # Test Supabase connection
   npm run setup-supabase
   
   # Check environment variables
   echo $SUPABASE_URL
   ```

4. **Docker Issues**
   ```bash
   # Rebuild containers
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Getting Help

- Check the [GitHub Issues](https://github.com/HameedFarah/n8n-microflows/issues)
- Review the comprehensive documentation in `/docs`
- Run system diagnostics: `n8n-microflows health`

## Advanced Configuration

### Custom Validation Rules

Edit `schemas/workflow-schema.json` to add custom validation rules:

```json
{
  "properties": {
    "custom_field": {
      "type": "string",
      "pattern": "^[a-z_]+$"
    }
  }
}
```

### AI Integration

Configure Claude integration in `.env`:
```env
CLAUDE_API_KEY=your_claude_key
ENABLE_AI_VALIDATION=true
AI_CONFIDENCE_THRESHOLD=0.8
```

### Custom Templates

Add your own templates to `templates/workflows/`:

```json
{
  "name": "Custom Template",
  "category": "custom",
  "description": "Your custom workflow template",
  "version": "1.0.0",
  "nodes": [...]
}
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Workflow

```bash
# Setup development environment
npm run dev

# Run tests during development
npm run test:watch

# Format code before committing
npm run format

# Lint code
npm run lint
```

---

## Next Steps

Your n8n-microflows system is now ready! Here are some recommended next steps:

1. **Explore Templates**: Start with the built-in workflow templates
2. **Set Up Monitoring**: Configure Grafana dashboards for your workflows
3. **Create Custom Workflows**: Use the CLI to generate new workflows
4. **Enable AI Features**: Set up Claude integration for intelligent validation
5. **Production Deployment**: Use Docker Compose for scalable deployment

For more detailed information, check the comprehensive documentation in the `/docs` directory.
