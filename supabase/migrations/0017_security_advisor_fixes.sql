-- 0017: clear the Supabase security advisor warnings (BENI-67)
-- APPLIED 2026-11-24, ahead of the A Buyer's Choice intro call.
--
-- 1. handle_new_user() runs as the table owner (SECURITY DEFINER) so it can
--    create a profile row the moment someone signs up. It is only ever meant
--    to fire from the on_auth_user_created trigger, but by default Postgres
--    lets ANY role execute a public function — so it was also callable as
--    /rest/v1/rpc/handle_new_user by an anonymous visitor. Revoking EXECUTE
--    does not affect the trigger: trigger functions are invoked by the
--    trigger mechanism, not by the caller's privileges.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. token_overlap() had no fixed search_path, so a caller who could create
--    objects in another schema could in principle shadow a function it uses.
--    Pin it.
alter function public.token_overlap(text[], text[]) set search_path = public, pg_temp;

-- Remaining advisor warning, NOT fixable in SQL: "Leaked password protection
-- disabled" is a toggle in Authentication → Settings in the Supabase dashboard.
