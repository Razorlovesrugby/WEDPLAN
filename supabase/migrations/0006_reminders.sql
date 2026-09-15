-- ===========================================================================
-- 0006: Reminders
-- ===========================================================================
-- One enum value, because everything else this feature reads already
-- exists: v_timeline_items and list_items.snoozed_until from 0004/0005,
-- message_log's dedupe mechanism from 0001. See docs/specs/02-reminders.md.
--
-- `add value if not exists` rather than a bare `add value`: re-running this
-- file by hand against a project that already has it is then a no-op
-- instead of an error, matching how idempotent this whole feature's send
-- path already has to be (a retried cron collides on message_log's dedupe
-- key and skips).
-- ===========================================================================

alter type public.message_kind add value if not exists 'digest';
