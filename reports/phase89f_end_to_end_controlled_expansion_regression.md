# Phase 89F E2E

```json
{
  "execution": {
    "id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
    "expansion_review_id": "cer_1",
    "source_cohort_id": "c_1",
    "tenant_id": "t_1",
    "execution_status": "ROLLED_BACK",
    "expansion_type": "MIXED_LIMITED_EXPANSION",
    "proposed_limits_json": {
      "max_orders_per_day": 200,
      "max_customers_per_day": 100
    },
    "requested_by": "cp_1",
    "requested_by_role": "CONTROL_PLANE_ADMIN",
    "requested_at": "2026-06-11T19:12:50.782Z",
    "created_at": "2026-06-11T19:12:50.784Z",
    "updated_at": "2026-06-11T19:12:50.784Z",
    "approved_by": "cp_1",
    "approved_at": "2026-06-11T19:12:50.785Z",
    "executed_by": "cp_1",
    "executed_at": "2026-06-11T19:12:50.785Z",
    "paused_by": "cp_1",
    "paused_at": "2026-06-11T19:12:50.786Z",
    "rollback_by": "cp_1",
    "rollback_at": "2026-06-11T19:12:50.786Z",
    "rollback_reason": "Reverting due to incidents"
  },
  "timeline": [
    {
      "id": "ceee_abc483b9-c219-4b29-8b78-326106db7b72",
      "expansion_execution_id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
      "tenant_id": "t_1",
      "event_type": "EXPANSION_EXECUTION_VALIDATED",
      "actor_user_id": "cp_1",
      "actor_role": "CONTROL_PLANE_ADMIN",
      "message": "Validation passed",
      "created_at": "2026-06-11T19:12:50.784Z"
    },
    {
      "id": "ceee_5c7a3685-fb50-4a05-99d3-61aa984e5d91",
      "expansion_execution_id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
      "tenant_id": "t_1",
      "event_type": "EXPANSION_EXECUTION_APPROVED",
      "actor_user_id": "cp_1",
      "actor_role": "CONTROL_PLANE_ADMIN",
      "message": "Approved for execution",
      "created_at": "2026-06-11T19:12:50.785Z"
    },
    {
      "id": "ceee_f1f09915-7263-4f47-866a-619fba4c6639",
      "expansion_execution_id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
      "tenant_id": "t_1",
      "event_type": "EXPANSION_EXECUTION_STARTED",
      "actor_user_id": "cp_1",
      "actor_role": "CONTROL_PLANE_ADMIN",
      "message": "Expansion applied",
      "created_at": "2026-06-11T19:12:50.785Z"
    },
    {
      "id": "ceee_70648092-cdc2-4496-8e2a-c882ab6e7e59",
      "expansion_execution_id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
      "tenant_id": "t_1",
      "event_type": "EXPANSION_PAUSED",
      "actor_user_id": "cp_1",
      "actor_role": "CONTROL_PLANE_ADMIN",
      "message": "High incidents",
      "created_at": "2026-06-11T19:12:50.786Z"
    },
    {
      "id": "ceee_381cd698-351e-4a7b-acb0-192838542002",
      "expansion_execution_id": "cee_e0fc77e4-18f2-477a-ba53-648176821d24",
      "tenant_id": "t_1",
      "event_type": "EXPANSION_ROLLED_BACK",
      "actor_user_id": "cp_1",
      "actor_role": "CONTROL_PLANE_ADMIN",
      "message": "Reverting due to incidents",
      "created_at": "2026-06-11T19:12:50.786Z"
    }
  ]
}
```