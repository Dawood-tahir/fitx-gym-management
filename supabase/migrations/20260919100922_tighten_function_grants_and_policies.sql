revoke execute on function public.audit_row_change() from anon, authenticated;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;
revoke execute on function public.sync_auth_user_email() from anon, authenticated;

drop policy membership_plans_write_owner on public.membership_plans;
create policy membership_plans_insert_owner on public.membership_plans for insert to authenticated
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy membership_plans_update_owner on public.membership_plans for update to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy membership_plans_delete_owner on public.membership_plans for delete to authenticated
using ((select private.has_role(array['owner']::public.app_role[])));

drop policy payment_methods_write_owner on public.payment_methods;
create policy payment_methods_insert_owner on public.payment_methods for insert to authenticated
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy payment_methods_update_owner on public.payment_methods for update to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy payment_methods_delete_owner on public.payment_methods for delete to authenticated
using ((select private.has_role(array['owner']::public.app_role[])));

drop policy expense_categories_write_owner on public.expense_categories;
create policy expense_categories_insert_owner on public.expense_categories for insert to authenticated
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy expense_categories_update_owner on public.expense_categories for update to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));
create policy expense_categories_delete_owner on public.expense_categories for delete to authenticated
using ((select private.has_role(array['owner']::public.app_role[])));

drop policy expenses_write_privileged on public.expenses;
create policy expenses_insert_privileged on public.expenses for insert to authenticated
with check ((select private.has_role(array['owner','admin']::public.app_role[])));
create policy expenses_update_privileged on public.expenses for update to authenticated
using ((select private.has_role(array['owner','admin']::public.app_role[])))
with check ((select private.has_role(array['owner','admin']::public.app_role[])));
create policy expenses_delete_privileged on public.expenses for delete to authenticated
using ((select private.has_role(array['owner','admin']::public.app_role[])));

drop policy equipment_write_privileged on public.equipment;
create policy equipment_insert_privileged on public.equipment for insert to authenticated
with check ((select private.has_role(array['owner','admin']::public.app_role[])));
create policy equipment_update_privileged on public.equipment for update to authenticated
using ((select private.has_role(array['owner','admin']::public.app_role[])))
with check ((select private.has_role(array['owner','admin']::public.app_role[])));
create policy equipment_delete_privileged on public.equipment for delete to authenticated
using ((select private.has_role(array['owner','admin']::public.app_role[])));

drop policy complaints_write_staff on public.complaints_feedback;
create policy complaints_insert_staff on public.complaints_feedback for insert to authenticated
with check ((select private.is_active_staff()));
create policy complaints_update_staff on public.complaints_feedback for update to authenticated
using ((select private.is_active_staff())) with check ((select private.is_active_staff()));
create policy complaints_delete_staff on public.complaints_feedback for delete to authenticated
using ((select private.is_active_staff()));
