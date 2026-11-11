-- M7 advisor hardening: cover the composite group-owner foreign key in the
-- same column order used by the constraint.
create index wechat_projections_group_owner_idx
  on public.wechat_projections (allowlist_group_id, user_id);
