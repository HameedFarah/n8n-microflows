# N8N Microflows Catalog

*Auto-generated on 2025-06-28T22:20:00.000Z*

## Overview

Total workflows: **1**

### Categories Summary

- **Validation**: 1 workflow(s)

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


## Reuse Compatibility Matrix

| Workflow ID | Compatible With | Input From | Output To |
|-------------|----------------|------------|----------|
| `classify__gpt__task_intent` | route__code__by_category | validate__input__user_request | build__code__content_workflow |

## Search by Tags

**classification**: `classify__gpt__task_intent`

**intent**: `classify__gpt__task_intent`

**routing**: `classify__gpt__task_intent`

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

---

*This catalog is automatically updated when workflows are added or modified.*
