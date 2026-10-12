-- Super console audit entries about beta waitlist reviews still reference the
-- requesters' Discord IDs; the waitlist is gone, so they are deleted too.
DELETE FROM "SuperAdminAudit" WHERE "action" LIKE 'waitlist.%';
