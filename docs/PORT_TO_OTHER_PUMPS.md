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

| Feature | Here | Goes to | Notes for the port |
| --- | --- | --- | --- |
| The owner sets up his own forecourt | migration 800, `ForecourtSetup.js`, `SetupChecklist.js`, `getTankUsage()` | Every NEW client copy. Not a pump that is already trading on seeded tanks unless its owner asks. | On the master it would replace the seeded tanks and nozzles in 004/012/013 for new installs only: those migrations have run on live databases and are never edited, so a new client gets `supabase/setup/start-empty.sql` instead. |
| Evening dip as the default | `StockCheckForm.js` (`DEFAULT_TIMING`) | Per pump, never as a blanket change. | It is a setting of how a pump works, not a fix. Al Qaim dips in the morning. A port would be a per-pump setting, not a new hard-coded default. |
| One account, many vehicles | migration 801, `VehiclePicker.js`, `VehiclesPanel.js`, the slip line in `ReadingForm.js`, both oil forms, the ledger badge, the statement, the Customers search | The master and every copy. | A customer with no vehicles looks exactly as before, and one with a single vehicle has it filled in for him, so it is safe on a live pump. 801 backfills each customer's existing vehicle box into the list. Check `create_nozzle_reading`, the two ledger-posting triggers, `backup_table_order()` and `trg_write_activity` against the master's latest versions before copying, since 801 redefines all five. |
