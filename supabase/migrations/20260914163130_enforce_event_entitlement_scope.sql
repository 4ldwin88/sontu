-- Event IDs and participant IDs form one entitlement boundary. A future
-- provider/back-office process must never attach an order or admission to a
-- participant from another event.
alter table sontu_private.event_participants
  add constraint event_participants_event_id_id_key unique (event_instance_id,id);

alter table sontu_private.event_admissions
  add constraint event_admissions_participant_event_scope_fkey
    foreign key (event_instance_id,event_participant_id)
    references sontu_private.event_participants(event_instance_id,id)
    on delete cascade;

alter table sontu_private.event_orders
  add constraint event_orders_participant_event_scope_fkey
    foreign key (event_instance_id,event_participant_id)
    references sontu_private.event_participants(event_instance_id,id)
    on delete cascade;
