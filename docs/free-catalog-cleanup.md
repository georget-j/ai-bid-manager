# Free-plan catalog cleanup

The September 2026 database had 1.599 GB against a 0.5 GB Free allowance.
Three raw ingestion tables held roughly 940 MB. Duplicate `raw_json` on
normalized opportunities and grants held another 277 MB. The compact-catalog
code stores source name, notice ID, content hash, and fetch time as a small
deduplication receipt, while keeping normalized opportunities, grants, event
details, document links, and user-created bid data.

## Order of operations

1. Deploy the compact-catalog code and confirm it is the production deployment.
2. If the old raw source audit trail matters, export it outside this database.
   The cleanup permanently discards it. Do not create a backup table inside the
   same quota-limited database.
3. Run the transactional first block of `free-catalog-cleanup.sql` in Supabase
   SQL Editor. It clears only the three raw source tables and duplicate
   normalized `raw_json` columns. It leaves catalog rows and user data intact.
4. Run each command below separately, outside a transaction. Supabase SQL
   Editor may require a longer statement timeout. `VACUUM FULL` takes an
   exclusive lock, so run it before sending people to the app.

   ```sql
   vacuum (full, analyze) public.opportunities;
   ```

   ```sql
   vacuum (full, analyze) public.grants;
   ```

   ```sql
   select pg_size_pretty(pg_database_size(current_database())) as database_size;
   ```
5. Check `pg_database_size` and `/api/health`. The Fair Use restriction uses
   the organisation's billing-period average, so a smaller live database may
   not immediately restore the API. Check the billing cycle in Supabase.

The nightly source sync no longer runs a two-year history backfill by default,
and each sync prunes hash receipts older than 30 days. Set
`CATALOG_BACKFILL_ENABLED=true` only if the extra database usage is acceptable.
