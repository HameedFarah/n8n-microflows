# Naming Conventions

## Workflow ID Format

All workflow IDs must follow the exact pattern: `[function]__[tool]__[output]`

### Function Prefixes (Required)

Approved function prefixes:
- `get` - Retrieve or fetch data
- `post` - Send or submit data
- `store` - Save data to storage
- `validate` - Check data validity
- `transform` - Convert data format
- `enrich` - Add information to data
- `summarize` - Create summaries
- `classify` - Categorize content
- `route` - Direct workflow paths
- `build` - Construct complex objects
- `create` - Generate new content
- `generate` - AI-powered creation
- `retry` - Handle retry logic
- `utils` - Utility functions

### Tool Specification

The tool segment indicates the primary technology or service:
- `gpt` - OpenAI GPT models
- `code` - JavaScript/Python code
- `supabase` - Supabase operations
- `http` - HTTP API calls
- `slack` - Slack integration
- `gmail` - Gmail operations
- `sheets` - Google Sheets
- `webhook` - Webhook handling
- `input` - Input validation

### Output Description

The output segment describes what the workflow produces:
- Use snake_case for multi-word outputs
- Be specific and descriptive
- Avoid generic terms like 'data' or 'result'

## Examples

### Good Examples
```
generate__gpt__product_review_article
validate__input__contract_upload
enrich__gpt__with_prompt_template
store__supabase__user_preferences
classify__gpt__task_intent
transform__code__csv_to_json
get__sheets__sales_data
post__slack__notification
```

### Bad Examples
```
process_data              # No double underscores
generate_gpt_article      # Single underscores
GENERATE__GPT__ARTICLE    # Uppercase
generate__chatgpt__text   # Use 'gpt' not 'chatgpt'
do__stuff__things         # Too vague
```

## File Naming

The JSON file name MUST exactly match the workflow ID:

```
microflows/content/generate__gpt__product_review_article.json
microflows/validation/validate__input__contract_upload.json
```

## Validation

The naming convention is automatically validated by:
- `scripts/check-naming.js`
- GitHub Actions on every commit
- Pre-commit hooks (if configured)

## Category Mapping

Workflows are organized into categories:

| Category | Purpose | Example Functions |
|----------|---------|------------------|
| content | Content creation and management | generate, summarize, create |
| validation | Input validation and checking | validate, classify, route |
| communication | Notifications and messaging | post, send, notify |
| data | Database and API operations | store, get, transform |
| seo | SEO research and optimization | analyze, optimize, research |
| social | Social media management | post, schedule, monitor |
| utilities | Shared helper functions | utils, retry, build |

## Common Patterns

### Data Pipeline
```
get__api__user_data
transform__code__normalize_fields
validate__input__required_fields
store__supabase__processed_user
```

### Content Workflow
```
generate__gpt__blog_outline
enrich__gpt__with_seo_keywords
create__gpt__full_article
post__cms__published_content
```

### Communication Flow
```
validate__input__notification_request
transform__code__message_template
post__slack__formatted_message
store__supabase__delivery_log
```

## Migration Guide

If you have existing workflows with different naming:

1. **Identify the function**: What does the workflow do?
2. **Identify the tool**: What's the primary technology?
3. **Identify the output**: What does it produce?
4. **Construct the new ID**: `function__tool__output`
5. **Update the workflow JSON**: Change the `id` field
6. **Rename the file**: Match the new ID
7. **Update references**: Any workflows that reference the old ID

## Enforcement

The naming convention is strictly enforced:
- ✅ Automatic validation in CI/CD
- ✅ Pre-commit hooks available
- ✅ Documentation generation depends on proper naming
- ✅ Search and discovery features rely on consistent naming

Follow these conventions to ensure your workflows integrate seamlessly with the microflows ecosystem!
