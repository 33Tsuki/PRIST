-- Sequences — managed outside Atlas (Atlas OSS only diffs implicit identity sequences).
-- Applied via: make db-sequences
-- Idempotent: safe to run repeatedly.

-- Price collector usernames (PC.<dd>.<nnn>) use a per-district counter on
-- cpi_tripura_district.next_surveyor_seq, allocated atomically by
-- app/auth/queries.py::create_price_collector. No global sequence needed.

-- Align the per-district counters past any existing 'PC.<dd>.<nnn>' usernames
-- so newly created price collectors cannot collide with rows inserted before
-- this file is rerun. Idempotent.
UPDATE cpi_tripura_district d
SET next_surveyor_seq = sub.max_seq + 1
FROM (
    SELECT SUBSTRING(username FROM 4 FOR 2) AS code,
           MAX(CAST(SUBSTRING(username FROM 7) AS INT)) AS max_seq
    FROM cpi_tripura_user
    WHERE user_role = 'PRICE_COLLECTOR'
      AND username ~ '^PC\.\d{2}\.\d+$'
    GROUP BY 1
) sub
WHERE d.code = sub.code
  AND d.next_surveyor_seq <= sub.max_seq;
