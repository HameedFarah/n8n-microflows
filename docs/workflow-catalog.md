# N8N Microflows Catalog

*Auto-generated on 2025-06-29T17:08:00.000Z*

## Overview

Total workflows: **8**

### Categories Summary

- **Content**: 1 workflow(s)
- **Validation**: 3 workflow(s) 
- **Communication**: 1 workflow(s)
- **Data**: 1 workflow(s)
- **SEO**: 1 workflow(s)
- **Social**: 1 workflow(s)
- **Utilities**: 1 workflow(s)

---

## Content Workflows

### `generate__gpt__product_review_article`

**Goal**: Generate comprehensive product review articles using GPT with structured output

**Details**:
- Complexity: medium
- Execution Time: 10-15 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: openai_api, supabase
- Tags: `content`, `review`, `gpt`, `article`

---

## Validation Workflows

### `classify__gpt__task_intent`

**Goal**: Classify user tasks into workflow categories using GPT analysis

**Details**:
- Complexity: medium
- Execution Time: 3-5 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: openai_api, supabase
- Tags: `classification`, `routing`, `intent`

### `validate__input__contract_upload`

**Goal**: Validate uploaded contract files for legal compliance and data extraction

**Details**:
- Complexity: medium
- Execution Time: 5-8 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: file_upload_service, legal_compliance_api
- Tags: `contract`, `legal`, `validation`, `file-processing`

### `validate__gdpr__consent_check`

**Goal**: Verify GDPR compliance and consent status for data processing activities

**Details**:
- Complexity: medium
- Execution Time: 3-5 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: gdpr_service, consent_database
- Tags: `gdpr`, `consent`, `compliance`, `legal`, `privacy`

---

## Communication Workflows

### `post__slack__team_notification`

**Goal**: Send structured notifications to Slack channels with thread management

**Details**:
- Complexity: simple
- Execution Time: 2-3 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: slack_api
- Tags: `slack`, `notification`, `team`, `messaging`

---

## Data Workflows

### `store__postgres__customer_data`

**Goal**: Safely store customer information with encryption and audit trails

**Details**:
- Complexity: medium
- Execution Time: 3-5 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: postgres_db, encryption_service
- Tags: `database`, `customer`, `encryption`, `audit`, `GDPR`

---

## SEO Workflows

### `generate__seo__meta_tags`

**Goal**: Automatically generate SEO-optimized meta tags for web content

**Details**:
- Complexity: medium
- Execution Time: 4-6 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: openai_api, seo_tools
- Tags: `seo`, `meta-tags`, `content`, `optimization`, `ai`

---

## Social Workflows

### `post__linkedin__company_update`

**Goal**: Publish company updates and announcements to LinkedIn with optimal timing

**Details**:
- Complexity: simple
- Execution Time: 3-4 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: linkedin_api
- Tags: `linkedin`, `social-media`, `company`, `announcement`, `scheduling`

---

## Utilities Workflows

### `transform__csv__json_converter`

**Goal**: Convert CSV data to structured JSON with validation and transformation rules

**Details**:
- Complexity: simple
- Execution Time: 2-4 seconds
- Reuse Potential: high
- Tenant Aware: yes
- Dependencies: none
- Tags: `csv`, `json`, `transformation`, `data-conversion`, `validation`

---

## Reuse Compatibility Matrix

| Workflow ID | Compatible With | Input From | Output To |
|-------------|----------------|------------|----------|
| `classify__gpt__task_intent` | route__code__by_category | validate__input__user_request | build__code__content_workflow |
| `validate__input__contract_upload` | store__legal__contract_database, enrich__gpt__contract_summary | upload__file__contract_portal | route__approval__legal_review |
| `post__slack__team_notification` | route__approval__manager_review, generate__report__deployment_status | trigger__webhook__deployment_complete | store__log__communication_history |
| `store__postgres__customer_data` | validate__gdpr__consent_check, enrich__api__customer_profile | validate__input__customer_form | post__email__welcome_sequence |
| `generate__seo__meta_tags` | store__cms__content_metadata, analyze__seo__performance | validate__content__quality_check | update__website__meta_tags |
| `post__linkedin__company_update` | generate__report__social_analytics, schedule__social__content_calendar | validate__content__company_guidelines | track__engagement__social_metrics |
| `transform__csv__json_converter` | store__database__bulk_insert, validate__data__quality_check | get__file__upload_processor | transform__data__normalize_format |
| `validate__gdpr__consent_check` | store__postgres__customer_data, post__email__marketing_campaign | validate__input__data_processing_request | route__compliance__approval_required |

---

## Search by Tags

**ai**: `generate__seo__meta_tags`

**announcement**: `post__linkedin__company_update`

**article**: `generate__gpt__product_review_article`

**audit**: `store__postgres__customer_data`

**classification**: `classify__gpt__task_intent`

**company**: `post__linkedin__company_update`

**compliance**: `validate__gdpr__consent_check`

**consent**: `validate__gdpr__consent_check`

**content**: `generate__gpt__product_review_article`, `generate__seo__meta_tags`

**contract**: `validate__input__contract_upload`

**csv**: `transform__csv__json_converter`

**customer**: `store__postgres__customer_data`

**data-conversion**: `transform__csv__json_converter`

**database**: `store__postgres__customer_data`

**encryption**: `store__postgres__customer_data`

**file-processing**: `validate__input__contract_upload`

**gdpr**: `store__postgres__customer_data`, `validate__gdpr__consent_check`

**gpt**: `generate__gpt__product_review_article`

**intent**: `classify__gpt__task_intent`

**json**: `transform__csv__json_converter`

**legal**: `validate__input__contract_upload`, `validate__gdpr__consent_check`

**linkedin**: `post__linkedin__company_update`

**messaging**: `post__slack__team_notification`

**meta-tags**: `generate__seo__meta_tags`

**notification**: `post__slack__team_notification`

**optimization**: `generate__seo__meta_tags`

**privacy**: `validate__gdpr__consent_check`

**review**: `generate__gpt__product_review_article`

**routing**: `classify__gpt__task_intent`

**scheduling**: `post__linkedin__company_update`

**seo**: `generate__seo__meta_tags`

**slack**: `post__slack__team_notification`

**social-media**: `post__linkedin__company_update`

**team**: `post__slack__team_notification`

**transformation**: `transform__csv__json_converter`

**validation**: `validate__input__contract_upload`, `transform__csv__json_converter`, `validate__gdpr__consent_check`

---

## Usage Examples

### Chaining Workflows

Workflows can be chained together by matching output formats to input schemas:

```
validate__input__user_data → enrich__gpt__with_context → store__supabase__processed_data
```

### Integration Patterns

1. **Validation Chain**: Input validation → Processing → Output validation
2. **Data Pipeline**: Extract → Transform → Load (ETL)
3. **Content Pipeline**: Generate → Validate → Publish
4. **Communication Flow**: Trigger → Process → Notify

### Example Workflow Chains

**Content Creation Pipeline**:
```
generate__gpt__product_review_article → generate__seo__meta_tags → post__linkedin__company_update
```

**Data Processing Pipeline**:
```
transform__csv__json_converter → validate__gdpr__consent_check → store__postgres__customer_data
```

**Compliance Workflow**:
```
validate__input__contract_upload → validate__gdpr__consent_check → post__slack__team_notification
```

---

## API Integration Examples

### Webhook to Slack Notification
```json
{
  "trigger": "deployment_webhook",
  "workflow": "post__slack__team_notification",
  "chaining": ["store__log__communication_history"]
}
```

### File Upload Processing
```json
{
  "trigger": "file_upload",
  "workflow": "validate__input__contract_upload",
  "chaining": ["store__legal__contract_database", "post__slack__team_notification"]
}
```

---

*This catalog is automatically updated when workflows are added or modified.*
