-- Record every authoritative order-state transition. Browser clients still
-- have no mutation access; these fields are provenance supplied by a future
-- provider adapter or an explicitly authorized back-office process.
alter table sontu_private.event_orders
  add column payment_state_source_kind text not null default 'BACKOFFICE'
    check (payment_state_source_kind in ('PROVIDER','BACKOFFICE')),
  add column payment_state_external_reference text;

create function sontu_private.validate_order_state_transition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.state is distinct from old.state then
    if not (
      (old.state='PENDING' and new.state in ('FAILED','PAID')) or
      (old.state='FAILED' and new.state in ('PENDING','PAID')) or
      (old.state='PAID' and new.state='REFUNDED')
    ) then
      raise exception 'INVALID_ORDER_STATE_TRANSITION: % -> %',old.state,new.state
        using errcode='check_violation';
    end if;
    new.updated_at:=now();
    if new.state='PAID' then new.paid_at:=coalesce(new.paid_at,now()); end if;
    if new.state='REFUNDED' then new.refunded_at:=coalesce(new.refunded_at,now()); end if;
  end if;
  return new;
end $$;

create trigger validate_order_state_transition
before update of state on sontu_private.event_orders
for each row execute function sontu_private.validate_order_state_transition();

create function sontu_private.record_order_state_transition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into sontu_private.event_payment_state_history(
    order_id,prior_state,state,source_kind,external_reference
  ) values(
    new.id,
    case when tg_op='INSERT' then null else old.state end,
    new.state,
    new.payment_state_source_kind,
    new.payment_state_external_reference
  ) on conflict(order_id,state,external_reference) do nothing;
  return new;
end $$;

create trigger record_order_state_transition
after insert or update of state on sontu_private.event_orders
for each row execute function sontu_private.record_order_state_transition();

-- Repair history for orders created before transition recording existed.
insert into sontu_private.event_payment_state_history(
  order_id,prior_state,state,source_kind,external_reference,recorded_at
)
select o.id,null,o.state,'BACKOFFICE',null,o.updated_at
from sontu_private.event_orders o
where not exists (
  select 1 from sontu_private.event_payment_state_history h where h.order_id=o.id
);

revoke all on function sontu_private.validate_order_state_transition(),
  sontu_private.record_order_state_transition()
from public,anon,authenticated;
