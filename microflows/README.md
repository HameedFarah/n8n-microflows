# Microflows Directory

This directory contains all N8N workflow definitions organized by category.

## Structure

- **content/**: Content creation and management workflows
- **validation/**: Input validation and format checking workflows  
- **communication/**: Slack, email, and notification workflows
- **data/**: Database operations and API integration workflows
- **seo/**: SEO research and optimization workflows
- **social/**: Social media posting and management workflows
- **utilities/**: Shared utility and helper workflows

## File Naming

All workflow files must be named exactly as their workflow ID:
`microflows/[category]/[workflow_id].json`

Example: `microflows/content/generate__gpt__product_review_article.json`

## Workflow Requirements

Each workflow must include:
- Complete metadata following the schema
- Input/output contracts with JSON Schema validation
- Node-level documentation and error handling
- Realistic example usage
- Supabase integration for dynamic configuration
- Tenant isolation where applicable
