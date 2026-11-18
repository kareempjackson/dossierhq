-- Who each weekly report is written for: the client's leadership, or whoever
-- looks after IT there. A client's next report is drafted for whoever its
-- last one was, so the choice carries from week to week. Reports drafted
-- before there was a choice were written for leadership.

alter table public.reports
  add column audience text not null default 'executive'
    check (audience in ('executive', 'technician'));
