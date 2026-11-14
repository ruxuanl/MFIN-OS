-- Keep the local queue pump active while a background sync owns the current batch.
create or replace function public.read_my_mailbox(target_category text default null,target_priority text default null,target_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with all_mail as materialized (select * from public.inbox_mail_view where user_id=auth.uid()),
 filtered as (select * from all_mail where (target_category is null or category=target_category) and (target_priority is null or priority=target_priority)),
 totals as (select category,priority,count(*) as count from all_mail group by category,priority),
 page as (select id,category,priority,summary,received_at,sender_summary from filtered order by received_at desc,id desc limit 30 offset (greatest(1,least(coalesce(target_page,1),100000))-1)*30)
 select jsonb_build_object('counts',coalesce((select jsonb_agg(to_jsonb(t)) from totals t),'[]'::jsonb),
 'queued',(select count(*) from all_mail where analysis_status in ('queued','running')),'total',(select count(*) from filtered),'unfinished',(select count(*) from all_mail where analysis_status<>'completed'),
 'messages',coalesce((select jsonb_agg(to_jsonb(p) order by p.received_at desc,p.id desc) from page p),'[]'::jsonb));
$$;
