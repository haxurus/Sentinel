-- The beta waitlist ended when Sentinel opened to every server: its requests
-- (Discord user IDs and usernames, server IDs, member counts, notes) and the
-- install grants derived from them are no longer needed. Tables are kept.
DELETE FROM "WaitlistEntry";
DELETE FROM "InstallGrant" WHERE "source" = 'WAITLIST';
