# Features built for Al Hakeem, waiting to go to the other pumps

The owner of these repos has said that this client's suggestions are good ones
and will be copied to the master (`Ammar-Sagheer/Petrol-Pump-Management-Software`)
and from there to the other client copies (Al Qaim, the demo, the offline
build). They are built here first. This file is the list of what has not been
carried yet, so the next session does not have to work it out from the diff.

When a feature goes across, renumber its migration into the master's sequence
(the 800s here are this repo's own numbers), add it to the master's README
migration table and changelog, and add a row to the master's "Syncing the
offline (Electron) build" checklist. Then tick it off below with the commit.

**On the master (6 Oct 2026):** vehicles and salaries are its 073 and 074, on
branch `claude/bold-keller-05kpzc` (a2d4592), with a warning added on the
Salaries page for salaries already typed into Expenses by hand. Al Qaim and the
demo take them from the master next. Self-setup and the evening default stay
here.

| Feature | Here | Goes to | Notes for the port |
| --- | --- | --- | --- |
| The owner sets up his own forecourt | migration 800, `ForecourtSetup.js`, `SetupChecklist.js`, `getTankUsage()` | Every NEW client copy. Not a pump that is already trading on seeded tanks unless its owner asks. | On the master it would replace the seeded tanks and nozzles in 004/012/013 for new installs only: those migrations have run on live databases and are never edited, so a new client gets `supabase/setup/start-empty.sql` instead. |
| Evening dip as the default | `StockCheckForm.js` (`DEFAULT_TIMING`) | Per pump, never as a blanket change. | It is a setting of how a pump works, not a fix. Al Qaim dips in the morning. A port would be a per-pump setting, not a new hard-coded default. |
| Staff attendance and salaries | migration 802, `app/admin/salaries`, `components/admin/salaries/` (`SalariesView`, `AttendanceRegister`, `StaffControls`), the sidebar entry and three icons | The master and every copy. | New tables only, so safe on a live pump. 802 edits `reset_all_data()` and `trg_write_activity()` by text replacement and redefines `backup_table_order()`: rebase the list on the master's latest one before copying. Salaries already exist as free-text expenses on the live pumps; nothing is converted. |
| Salaries on a phone (switch, cards, totals strip) | `SalariesView.js`, `StaffControls.js` (`wide` Pay), `ConfirmAction.js` (`triggerText`), `salaries/page.js` (`tab`) | The master and Al Qaim. | UI only, no migration. The master's SalariesView also has the hand-typed salaries warning: keep it when copying. |
| Quick entry on the Dashboard (expense, bank entry) | `dashboard/QuickEntry.js`, `DashboardView.js`, `app/admin/page.js`, `BankTransactionForm.js` (`bare`, `onSaved`), `actions.js` (`createBankTransaction` refreshes `/admin`) | Ask each owner. | UI only. |
| Internal functions closed | migration 803 | Nothing to port. | The master's 073 and 074 already close them. |
| One account, many vehicles | migration 801, `VehiclePicker.js`, `VehiclesPanel.js`, the slip line in `ReadingForm.js`, both oil forms, the ledger badge, the statement, the Customers search | The master and every copy. | A customer with no vehicles looks exactly as before, and one with a single vehicle has it filled in for him, so it is safe on a live pump. 801 backfills each customer's existing vehicle box into the list. Check `create_nozzle_reading`, the two ledger-posting triggers, `backup_table_order()` and `trg_write_activity` against the master's latest versions before copying, since 801 redefines all five. |
