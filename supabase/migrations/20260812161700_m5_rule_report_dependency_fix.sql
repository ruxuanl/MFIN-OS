-- M5 rules_v1 reports do not invoke an AI provider. Remove the premature M2 AI
-- dependency; future AI-enhanced reports must evaluate ai.master separately.

delete from public.capability_dependencies
where capability_key = 'reports.generate'
  and required_capability_key = 'ai.analysis';

insert into public.audit_events (
  user_id, actor_type, action, object_type, object_id,
  after_state, permission_decision, rule_version, outcome
)
select id, 'system', 'capability.report_rules_enabled', 'capability', 'reports.generate',
  jsonb_build_object('generationStrategy', 'rules_v1', 'aiDependency', false),
  jsonb_build_object('source', 'm5_approved_milestone'), 'm5-rules-v1', 'succeeded'
from auth.users;
