-- Preserve the existing external/anonymous feedback workflow for ladies
-- reception while continuing to hide every gents-linked case.
drop policy if exists complaints_select_staff on public.complaints_feedback;
drop policy if exists complaints_insert_staff on public.complaints_feedback;
drop policy if exists complaints_update_staff on public.complaints_feedback;
drop policy if exists complaints_delete_staff on public.complaints_feedback;

create policy complaints_select_staff on public.complaints_feedback for select to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or member_id is null
    or (select private.can_access_member(member_id))
  )
);

create policy complaints_insert_staff on public.complaints_feedback for insert to authenticated
with check (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or member_id is null
    or (select private.can_access_member(member_id))
  )
);

create policy complaints_update_staff on public.complaints_feedback for update to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or member_id is null
    or (select private.can_access_member(member_id))
  )
)
with check (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or member_id is null
    or (select private.can_access_member(member_id))
  )
);

create policy complaints_delete_staff on public.complaints_feedback for delete to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or member_id is null
    or (select private.can_access_member(member_id))
  )
);
