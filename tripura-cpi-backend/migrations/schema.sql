-- Create the types first
CREATE TYPE CPI_DOMAIN AS ENUM ('Rural Non Tribal', 'Rural Tribal', 'Urban');
CREATE TYPE USER_ROLE AS ENUM ('ADMIN', 'DISTRICT_SUPERVISOR', 'PRICE_COLLECTOR');


CREATE TABLE CPI_TRIPURA_DISTRICT (
    district_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code CHAR(2) UNIQUE NOT NULL CHECK (code ~ '^[0-9]{2}$'),
    lgd_code INT UNIQUE CHECK (lgd_code > 0),  -- LGD district code (e.g. 272 for West Tripura)
    next_surveyor_seq INT NOT NULL DEFAULT 1 CHECK (next_surveyor_seq > 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- Unified user table for all roles. district_id = a price collector's home
-- district (drives the PC.<dd>.<nnn> username) or a district supervisor's
-- supervised district; NULL for admins. A DS's price collectors and markets are
-- derived by matching this district_id — there is no association table.
CREATE TABLE CPI_TRIPURA_USER (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_role USER_ROLE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,  -- price collectors auto-gen 'PC.<dd>.<nnn>' (see migrations/sequences.sql)
    password_hash TEXT,                    -- NULL for legacy PCs; required for login (app-enforced)
    full_name VARCHAR(150),
    phone VARCHAR(15) UNIQUE CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{9,14}$'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    district_id INTEGER REFERENCES CPI_TRIPURA_DISTRICT(district_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,                 -- PC home / DS supervised district; NULL for admin
    email VARCHAR(254) CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_full_name CHECK (user_role = 'ADMIN' OR full_name IS NOT NULL)
);


CREATE TABLE CPI_TRIPURA_TEHSIL (
    tehsil_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    teh_mmdc CHAR(5), -- Storing the 5-digit code here is more efficient; not unique across tehsils
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE CPI_TRIPURA_SUBDIVISION (
    subdivision_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    lgd_code INT UNIQUE NOT NULL CHECK (lgd_code > 0),  -- LGD sub-division code (e.g. 6696 for Sadar)
    district_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_DISTRICT(district_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE CPI_TRIPURA_MARKET (
    market_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain CPI_DOMAIN NOT NULL,  -- Uses the custom enum
    des_corrected CPI_DOMAIN,  -- Uses the custom enum but there are some missing values, so it can be NULL
    district_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_DISTRICT(district_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    vill_town_mmdc CHAR(6) CONSTRAINT chk_vill_town_mmdc CHECK (vill_town_mmdc ~ '^[0-9]{6}$'),  -- 6 digit Census 2011 Location Codes for Village or Town
    tehsil_id INTEGER REFERENCES CPI_TRIPURA_TEHSIL(tehsil_id)  -- Foreign key to the CPI_TRIPURA_TEHSIL table
        ON DELETE RESTRICT   -- Prevents accidental loss of market data
        ON UPDATE CASCADE,    -- Safely allows ID changes to propagate,
    village_town VARCHAR(150), --name of village or town
    subdivision_id INTEGER REFERENCES CPI_TRIPURA_SUBDIVISION(subdivision_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    market_day VARCHAR(150),  -- free text, e.g. 'Sunday/ Thursday', 'Everyday'
    market_time VARCHAR(150),  -- free text, e.g. 'Morning to Afternoon'
    block_ulb_name VARCHAR(150),  -- Block or Urban Local Body name
    block_lgd_code INT CHECK (block_lgd_code > 0),  -- Block LGD code / City code
    dso_office VARCHAR(50),  -- e.g. 'DSO West'
    selected_market VARCHAR(150) NOT NULL,
    market_code VARCHAR(10) NOT NULL UNIQUE CHECK (market_code ~ '^(RN|RT|UO)\d{4}$'),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


CREATE TYPE SHOP_SELECTION_STATUS AS ENUM ('SUBSTITUTE 1', 'SUBSTITUTE 2', 'ORIGINALLY SELECTED', 'NOT SELECTED');

CREATE TABLE CPI_TRIPURA_MARKET_SHOP (
    shop_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shop_serial_no VARCHAR(5) NOT NULL CHECK (shop_serial_no ~ '^[0-9]+[A-Z]$'),
    shop_name VARCHAR(150) NOT NULL,
    shop_phone_number CHAR(10) CHECK (shop_phone_number ~ '^[6-9][0-9]{9}$'),
    shop_description_and_location TEXT NOT NULL,
    general_description_of_items_sold TEXT,
    market_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_MARKET(market_id) -- Foreign key to the CPI_TRIPURA_MARKET table
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(market_id, shop_serial_no)
);



CREATE TABLE CPI_TRIPURA_ITEM (  -- assuming a common set of items across markets; market specific item attributes are captured in the table CPI_TRIPURA_MARKET_ITEM
    item_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_code CHAR(4) NOT NULL UNIQUE CHECK (item_code ~ '^[0-9]{4}$'),  -- referred to as Item Serial Number in Form 3 but as Item Code in Form 2
    item_name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


CREATE TYPE ITEM_AVAILABILITY_CODE AS ENUM ('SEASONAL', 'PERENNIAL', 'ABSENT');
CREATE TYPE ITEM_BRANDING AS ENUM ('BRANDED', 'NOT BRANDED');
CREATE TYPE ITEM_PACKAGING AS ENUM ('PACKAGED', 'LOOSE');


-- Lifecycle of a round: created in DRAFT (preparation — rollover/setups/assignments),
-- moved to ACTIVE when collection starts, CLOSED when collection ends. The "current"
-- round is simply the one ACTIVE round (per cycle). `cycle` is the foundation for
-- future, independent round cadences (quarterly/yearly); everything is MONTHLY today.
CREATE TYPE ROUND_STATUS AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE ROUND_CYCLE AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

CREATE TABLE CPI_TRIPURA_SURVEY_ROUND (
    round_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    round_number INTEGER NOT NULL CHECK (round_number > 0),     -- The user-facing identifier (1, 2, 3...), unique per cycle
    round_name VARCHAR(150),
    cycle ROUND_CYCLE NOT NULL DEFAULT 'MONTHLY',
    round_status ROUND_STATUS NOT NULL DEFAULT 'DRAFT',
    round_start_date DATE NOT NULL,          -- planned start
    round_end_date DATE NOT NULL,            -- planned end
    actual_start_date DATE,                  -- set when the round is started
    actual_end_date DATE,                    -- set when the round is ended
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_dates CHECK (round_end_date >= round_start_date),   -- Logical check: End date must be after start date
    UNIQUE (cycle, round_number)             -- round_number is user-facing per cycle
);

-- At most one ACTIVE round per cycle (replaces the enforce_single_current_round trigger).
CREATE UNIQUE INDEX uq_one_active_round_per_cycle
    ON CPI_TRIPURA_SURVEY_ROUND (cycle)
    WHERE round_status = 'ACTIVE';


CREATE TABLE CPI_TRIPURA_MARKET_ITEM (   -- market specific item information
    market_item_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id INTEGER REFERENCES CPI_TRIPURA_ITEM(item_id) -- Foreign key to the CPI_TRIPURA_ITEM table
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    shop_id INTEGER REFERENCES CPI_TRIPURA_MARKET_SHOP(shop_id) -- Foreign key to the CPI_TRIPURA_MARKET_SHOP table
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    round_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_SURVEY_ROUND(round_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    market_item_description TEXT,  -- Item description locally reported such that price of the item can be reported regularly
    item_branding ITEM_BRANDING,
    item_packaging ITEM_PACKAGING,
    package_size_value DECIMAL(10, 3), -- To store 25, 1, 500, etc. Nullable because some items don't have a standard package size
    package_size_unit VARCHAR(10) CHECK (package_size_unit IN ('kg', 'gm', 'ltr', 'ml', 'piece', 'pieces', 'box')),   -- To store 'kg', 'ltr', 'pieces', etc. Nullable because some items don't have a standard package size
    item_variety TEXT,
    unit_of_sale VARCHAR(20) NOT NULL,
    product_specification TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_id, item_id, product_specification, unit_of_sale, round_id)
);


CREATE TABLE CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP (
    item_price_collection_shop_setup_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_ITEM(item_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    shop_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_MARKET_SHOP(shop_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    shop_selection_status SHOP_SELECTION_STATUS NOT NULL,
    item_availability_code ITEM_AVAILABILITY_CODE,
    remark TEXT,
    round_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_SURVEY_ROUND(round_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_id, shop_id, round_id)  -- Prevent duplicate setups
);

CREATE TABLE CPI_TRIPURA_PRICE_DATA (
    price_data_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    market_item_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_MARKET_ITEM(market_item_id) ON DELETE RESTRICT,
    previous_period_price NUMERIC(10, 2) CHECK (previous_period_price >= 0),  -- populated during rollover
    current_period_price NUMERIC(10, 2) CHECK (current_period_price >= 0),    -- NULL until surveyor submits
    is_na BOOLEAN NOT NULL DEFAULT FALSE,
    is_not_applicable BOOLEAN NOT NULL DEFAULT FALSE,  -- item not applicable for this round
    remark TEXT,
    price_recording_date DATE,  -- NULL until surveyor submits
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(market_item_id), -- one price per market item (round is encoded in market_item)
    CHECK (NOT (is_na AND is_not_applicable)) -- mutually exclusive flags
);


CREATE TABLE CPI_TRIPURA_SURVEYOR_ASSIGNMENT (
    surveyor_assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    surveyor_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_USER(user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    round_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_SURVEY_ROUND(round_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    market_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_MARKET(market_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(round_id, market_id)
);


CREATE TYPE MARKET_SURVEY_STATUS AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED');

-- Per-(round, market) survey lifecycle. A price collector submits the whole round,
-- which marks each of their IN_PROGRESS markets SUBMITTED; a district supervisor (or
-- admin) then APPROVES or un-submits (back to IN_PROGRESS) each market individually.
-- Keyed by (round_id, market_id) — CPI_TRIPURA_SURVEYOR_ASSIGNMENT already enforces one
-- price collector per market per round, so the surveyor is derivable.
CREATE TABLE CPI_TRIPURA_MARKET_SURVEY_STATUS (
    market_survey_status_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_SURVEY_ROUND(round_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    market_id INTEGER NOT NULL REFERENCES CPI_TRIPURA_MARKET(market_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    status MARKET_SURVEY_STATUS NOT NULL DEFAULT 'IN_PROGRESS',
    submitted_at TIMESTAMPTZ,
    submitted_by INTEGER REFERENCES CPI_TRIPURA_USER(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,   -- price collector who submitted
    reviewed_at TIMESTAMPTZ,
    reviewed_by INTEGER REFERENCES CPI_TRIPURA_USER(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,   -- supervisor/admin who approved or un-submitted
    review_remark TEXT,                          -- reason captured on un-submit/reject
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(round_id, market_id)
);


-- Indexes for frequently queried columns

CREATE INDEX idx_market_item_shop
    ON CPI_TRIPURA_MARKET_ITEM(shop_id);
CREATE INDEX idx_market_item_item
    ON CPI_TRIPURA_MARKET_ITEM(item_id);
CREATE INDEX idx_market_item_round
    ON CPI_TRIPURA_MARKET_ITEM(round_id);
CREATE INDEX idx_price_date
    ON CPI_TRIPURA_PRICE_DATA(price_recording_date);
CREATE INDEX idx_setup_shop_item
    ON CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP(shop_id, item_id);
CREATE INDEX idx_setup_item
    ON CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP(item_id);
CREATE INDEX idx_setup_round
    ON CPI_TRIPURA_ITEM_PRICE_COLLECTION_SHOP_SETUP(round_id);
CREATE INDEX idx_shop_market
    ON CPI_TRIPURA_MARKET_SHOP(market_id);
CREATE INDEX idx_surveyor_assignment_round
    ON CPI_TRIPURA_SURVEYOR_ASSIGNMENT(round_id);
CREATE INDEX idx_surveyor_assignment_surveyor
    ON CPI_TRIPURA_SURVEYOR_ASSIGNMENT(surveyor_id);
CREATE INDEX idx_surveyor_assignment_market
    ON CPI_TRIPURA_SURVEYOR_ASSIGNMENT(market_id);
CREATE INDEX idx_market_survey_status_round
    ON CPI_TRIPURA_MARKET_SURVEY_STATUS(round_id);
CREATE INDEX idx_market_survey_status_market
    ON CPI_TRIPURA_MARKET_SURVEY_STATUS(market_id);


-- Append-only trail of mutating (POST/PUT/PATCH/DELETE) requests made by
-- ADMIN / DISTRICT_SUPERVISOR users. user_id deliberately has NO foreign key:
-- admins and supervisors can be hard-deleted, and an FK would either block
-- those deletes (RESTRICT) or destroy audit history (CASCADE). The username
-- snapshot keeps rows attributable after the user row is gone.
CREATE TABLE CPI_TRIPURA_AUDIT_LOG (
    audit_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL,            -- no FK by design (see above)
    username VARCHAR(50),            -- snapshot at write time; NULL if lookup failed
    user_role USER_ROLE NOT NULL,
    action VARCHAR(100) NOT NULL,    -- route handler name, e.g. 'create_market'
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,              -- e.g. '/master-data/items/12'
    path_params JSONB,               -- resolved route params, e.g. {"item_id": 12}
    request_body JSONB,              -- redacted; NULL if non-JSON/oversized/empty
    status_code SMALLINT NOT NULL,   -- all statuses logged, incl. 4xx/5xx
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_created_at
    ON CPI_TRIPURA_AUDIT_LOG(created_at);
CREATE INDEX idx_audit_log_user
    ON CPI_TRIPURA_AUDIT_LOG(user_id);
CREATE INDEX idx_audit_log_action
    ON CPI_TRIPURA_AUDIT_LOG(action);


-- History of generated report files (PDF/DOCX/XLSX); each row doubles as the
-- job record for in-process background rendering (status/progress/error).
-- The file itself lives on disk under REPORTS_DIR; file_path is relative to
-- that directory. params snapshots the filters + chosen columns, which is enough
-- to replay the report against current data — that is what regeneration does,
-- swapping file_path to the freshly rendered file and keeping the same row.
-- generated_by_user_id has NO foreign key for the same reason as the audit log:
-- admins and supervisors can be hard-deleted, and report history must survive
-- that. The username snapshot keeps rows attributable afterwards.
CREATE TYPE REPORT_STATUS AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE CPI_TRIPURA_GENERATED_REPORT (
    generated_report_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL,        -- key in the code-defined report catalog
    title TEXT NOT NULL,
    description TEXT,
    file_format VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx', 'xlsx')),
    file_path TEXT NOT NULL,                 -- relative to REPORTS_DIR
    params JSONB NOT NULL,                   -- filters + chosen columns snapshot
    status REPORT_STATUS NOT NULL DEFAULT 'READY',
    progress SMALLINT NOT NULL DEFAULT 0,    -- 0-100; real for docx/xlsx, stage-based for pdf
    error TEXT,                              -- failure reason when status = FAILED
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,  -- when the current render was queued; reset on regeneration
    completed_at TIMESTAMPTZ,                -- NULL while a job holds the row; fences the finishing UPDATE
    generated_by_user_id INT NOT NULL,       -- no FK by design (see above)
    generated_by_username VARCHAR(50),       -- snapshot at write time
    district_id INT REFERENCES CPI_TRIPURA_DISTRICT(district_id) ON DELETE RESTRICT,  -- NULL = all districts (admin)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_generated_report_created_at
    ON CPI_TRIPURA_GENERATED_REPORT(created_at);
CREATE INDEX idx_generated_report_district
    ON CPI_TRIPURA_GENERATED_REPORT(district_id);
