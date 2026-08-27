-- The administrator's inbox becomes the notification channel.
--
-- Mail was going to carry two things: verification codes out, and a nudge to
-- the administrator when something happened. Neither can leave this deployment
-- without a relay somebody pays for and a domain somebody owns, so the second
-- one moves in-house: events that would have been mailed are written to the
-- messages table and read on the administration page.
--
-- That makes messages hold two kinds of thing - what a visitor wrote, and what
-- the system reported - which are read differently enough to be worth telling
-- apart. Hence a column rather than a convention about the subject line.
alter table messages
    add column kind text not null default 'FEEDBACK'
        check (kind in ('FEEDBACK', 'NOTICE'));

-- Everything already in the table came from the feedback form, which is what
-- the default says. The column stays defaulted so a notice only has to name
-- itself when it is one.
comment on column messages.kind is
    'FEEDBACK: written by a visitor. NOTICE: reported by the server.';
