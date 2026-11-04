-- Functions and triggers — managed outside Atlas (which only handles DDL)
-- Applied via: make db-triggers
-- Idempotent: safe to run repeatedly

-- ── Auto-update modified_at ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_modified_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_modified_at_user ON CPI_TRIPURA_USER;
CREATE TRIGGER trg_update_modified_at_user
BEFORE UPDATE ON CPI_TRIPURA_USER
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_tehsil ON CPI_TRIPURA_TEHSIL;
CREATE TRIGGER trg_update_modified_at_tehsil
BEFORE UPDATE ON CPI_TRIPURA_TEHSIL
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_subdivision ON CPI_TRIPURA_SUBDIVISION;
CREATE TRIGGER trg_update_modified_at_subdivision
BEFORE UPDATE ON CPI_TRIPURA_SUBDIVISION
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_market ON CPI_TRIPURA_MARKET;
CREATE TRIGGER trg_update_modified_at_market
BEFORE UPDATE ON CPI_TRIPURA_MARKET
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_shop ON CPI_TRIPURA_MARKET_SHOP;
CREATE TRIGGER trg_update_modified_at_shop
BEFORE UPDATE ON CPI_TRIPURA_MARKET_SHOP
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_item ON CPI_TRIPURA_ITEM;
CREATE TRIGGER trg_update_modified_at_item
BEFORE UPDATE ON CPI_TRIPURA_ITEM
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_market_item ON CPI_TRIPURA_MARKET_ITEM;
CREATE TRIGGER trg_update_modified_at_market_item
BEFORE UPDATE ON CPI_TRIPURA_MARKET_ITEM
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_setup ON CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP;
CREATE TRIGGER trg_update_modified_at_setup
BEFORE UPDATE ON CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_price_data ON CPI_TRIPURA_PRICE_DATA;
CREATE TRIGGER trg_update_modified_at_price_data
BEFORE UPDATE ON CPI_TRIPURA_PRICE_DATA
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_surveyor_assignment ON CPI_TRIPURA_SURVEYOR_ASSIGNMENT;
CREATE TRIGGER trg_update_modified_at_surveyor_assignment
BEFORE UPDATE ON CPI_TRIPURA_SURVEYOR_ASSIGNMENT
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_market_survey_status ON CPI_TRIPURA_MARKET_SURVEY_STATUS;
CREATE TRIGGER trg_update_modified_at_market_survey_status
BEFORE UPDATE ON CPI_TRIPURA_MARKET_SURVEY_STATUS
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

DROP TRIGGER IF EXISTS trg_update_modified_at_survey_round ON CPI_TRIPURA_SURVEY_ROUND;
CREATE TRIGGER trg_update_modified_at_survey_round
BEFORE UPDATE ON CPI_TRIPURA_SURVEY_ROUND
FOR EACH ROW EXECUTE PROCEDURE update_modified_at_column();

-- ── Drop legacy current-round machinery ────────────────────────────────────
-- The old is_current flag is gone: "at most one ACTIVE round per cycle" is now
-- enforced by the partial unique index uq_one_active_round_per_cycle (schema.sql),
-- and round creation/rollover is handled in application code. Drop the obsolete
-- trigger and the unused create_new_survey_round() function (idempotent).

DROP TRIGGER IF EXISTS trg_enforce_single_current_round ON CPI_TRIPURA_SURVEY_ROUND;
DROP FUNCTION IF EXISTS enforce_single_current_round();
DROP FUNCTION IF EXISTS create_new_survey_round(INTEGER, VARCHAR, DATE, DATE, BOOLEAN);
