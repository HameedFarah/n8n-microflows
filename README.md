# N8N Microflows Library

A modular, reusable N8N workflow library with AI-generated microflows, structured naming conventions, and Supabase integration for multi-tenant automation systems.

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/HameedFarah/n8n-microflows.git
   cd n8n-microflows
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.template .env
   # Edit .env with your API keys
   ```

4. **Setup Supabase database**
   ```bash
   npm run setup-supabase
   ```

5. **Validate existing workflows**
   ```bash
   npm run validate-all
   ```

## 📁 Repository Structure

```
n8n-microflows/
├── .github/workflows/       # GitHub Actions for CI/CD
├── microflows/             # Categorized workflow definitions
│   ├── content/           # Content creation workflows
│   ├── validation/        # Input validation workflows  
│   ├── communication/     # Slack, email, notifications
│   ├── data/             # Database operations, API calls
│   ├── seo/              # SEO research, optimization
│   ├── social/           # Social media posting
│   └── utilities/        # Shared utility workflows
├── schemas/               # JSON schemas for validation
├── templates/            # Workflow and node templates
├── scripts/              # Automation and validation scripts
└── docs/                 # Documentation and catalogs
```

## 🏷️ Naming Convention

All workflows follow: `[function]__[tool]__[output]`

**Function Prefixes:** get, post, store, validate, transform, enrich, summarize, classify, route, build, create, generate, retry, utils

**Examples:**
- `generate__gpt__product_review_article`
- `validate__input__contract_upload`
- `enrich__gpt__with_prompt_template`

## 📋 Categories

- **content/**: Content creation, summarization
- **validation/**: Input validation, format checking  
- **communication/**: Slack, email, notifications
- **data/**: Database operations, API calls
- **seo/**: SEO research, optimization
- **social/**: Social media posting
- **utilities/**: Shared utility functions

## 🔧 Available Scripts

```bash
# Validation
npm run validate          # Validate JSON schemas
npm run check-naming      # Check naming conventions
npm run check-docs        # Validate documentation completeness
npm run validate-all      # Run all validations

# Utilities
npm run update-catalog    # Generate workflow catalog
npm run generate-embeddings  # Create vector embeddings for search
npm run setup-supabase    # Initialize database tables
npm run test             # Run test suite
```

## 📝 Creating New Workflows

1. **Use the template**
   ```bash
   cp templates/microflow-template.json microflows/[category]/[workflow_id].json
   ```

2. **Follow the naming convention**
   - File name must match workflow ID
   - Use approved function prefixes
   - Include proper category

3. **Complete all required fields**
   - Workflow metadata
   - Input/output schemas
   - Implementation details
   - Realistic examples
   - Reuse information

4. **Validate before committing**
   ```bash
   npm run validate-all
   ```

## 🏗️ Workflow Structure

Each workflow must include:

### Metadata
```json
{
  "workflow_meta": {
    "id": "validate__input__contract_upload",
    "goal": "Validate uploaded contract files for required fields and format",
    "category": "validation",
    "complexity": "medium",
    "execution_time": "3-5 seconds",
    "reuse_potential": "high",
    "tenant_aware": "yes",
    "dependencies": ["supabase"],
    "tags": ["validation", "contract", "upload"]
  }
}
```

### Implementation Details
```json
{
  "implementation": {
    "primary_approach": "code",
    "n8n_nodes": [
      {
        "type": "Code",
        "purpose": "Validate file format and extract data",
        "parameters": {"mode": "runOnceForEachItem"},
        "error_handling": "Return structured error response"
      }
    ],
    "supabase_tables": ["execution_logs"]
  }
}
```

## 🔍 Workflow Discovery

### Using Embeddings Search
```bash
# Generate embeddings for all workflows
npm run generate-embeddings

# Search for similar workflows
node scripts/generate-embeddings.js search "validate user input data"
```

### Using the Catalog
```bash
# Generate workflow catalog
npm run update-catalog

# View generated catalog
cat docs/workflow-catalog.md
```

## 🏢 Multi-Tenant Support

All workflows support tenant isolation:

1. **Required Fields**: Every workflow must include `tenant_id` in inputs
2. **Database Isolation**: Supabase RLS policies enforce tenant separation
3. **Configuration**: Per-tenant settings via `tenant_workflow_configs` table

## 🔐 Security & Best Practices

### Tenant Isolation
- Always include `tenant_id` in workflow inputs
- Use Supabase RLS for database access control
- Validate tenant permissions in workflow logic

### Error Handling
- Provide specific error codes and messages
- Include retry recommendations
- Log errors to `execution_logs` table

## 🧪 Testing

### Validation Pipeline
GitHub Actions automatically validates:
- JSON schema compliance
- Naming convention adherence
- Documentation completeness
- Code quality checks

### Manual Testing
```bash
# Run full test suite
npm test

# Test specific workflow
node scripts/validate-workflow.js microflows/content/generate__gpt__article.json
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Follow naming conventions**
4. **Add comprehensive documentation**
5. **Ensure all tests pass**
6. **Submit a pull request**

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Generated via ChatGPT → Claude → GitHub automation system.
