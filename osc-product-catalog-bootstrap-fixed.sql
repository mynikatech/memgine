-- ============================================================================
-- OSC product catalog bootstrap (ASCII-safe, skips incomplete Excel rows)
-- Source: OSC_2026-08-30.xlsx
--
-- OUTSIDE LIQUIBASE.
-- Rerunnable for the same organization.
-- Reusable for multiple test organizations by changing ONLY v_organization_id.
--
-- Source workbook note:
--   Five rows have no product name and are intentionally skipped:
--   source rows 65, 66, 67, 68 and 81.
--
-- Expected valid records from this workbook:
--   Products: 113
--   Categories: 17
--   Modifier groups: 17
--   Modifier options: 50
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_osc_product_source (
    row_no integer PRIMARY KEY,
    short_code varchar(160),
    product_name varchar(200) NOT NULL,
    sku varchar(160),
    upc varchar(160),
    price numeric(18,4),
    catalog_name varchar(200),
    category_name varchar(200)
) ON COMMIT DROP;

INSERT INTO tmp_osc_product_source (
    row_no, short_code, product_name, sku, upc, price, catalog_name, category_name
)
VALUES
(1, 'THUMB', 'thumbprint cookies', 'THMBPRNT-CKS', NULL, 3.5, 'OSC', NULL),
(2, 'PECAN', 'pecan tart', 'PCN-TRT', NULL, 3.2, 'OSC', NULL),
(3, 'BUTTE', 'butter tart', 'BTTR-TRT', NULL, 3.2, 'OSC', NULL),
(4, 'SAMOS', 'samosas', 'SMSS', NULL, 2, 'OSC', NULL),
(5, 'MUFFI', 'muffins', 'MFFNS', NULL, 3.49, 'OSC', NULL),
(6, 'RICR ', 'Ricr crispy', 'RCR-CRSPY', NULL, 4, 'OSC', NULL),
(7, 'EGGPL', 'Eggplant Shakshouka buns', 'GGPLNT-SHKSHK-BNS', NULL, 4.5, 'OSC', NULL),
(8, 'KEY L', 'Key Lime', 'KY-LM', NULL, 6.5, 'OSC', NULL),
(9, 'CROIS', 'Cheese Croissant', 'CRSSNT', NULL, 2.99, 'OSC', NULL),
(10, 'DECOR', 'Decorated individual cookies', 'DCRTD-NDVDL-CKS', NULL, 6, 'OSC', NULL),
(11, NULL, 'box cookies', 'SGR-CKS', NULL, 10.99, 'OSC', NULL),
(12, 'BIG C', 'Big cookies', 'BG-CKS', NULL, 5.99, 'OSC', NULL),
(13, NULL, 'Drip coffee', 'DRP-CFF', NULL, 0, 'OSC', 'COFFEE'),
(14, NULL, 'Tea', 'T', NULL, 0, 'OSC', 'COFFEE'),
(15, NULL, 'AMERICANO', 'MRCN', NULL, 0, 'OSC', 'COFFEE'),
(16, NULL, 'espresso', 'SPRSS', NULL, 2.1, 'OSC', 'COFFEE'),
(17, NULL, 'latte', 'LTT', NULL, 0, 'OSC', 'COFFEE'),
(18, NULL, 'cappucino', 'CPPCN', NULL, 0, 'OSC', 'COFFEE'),
(19, NULL, 'caramel macchiato', 'CRML-MCCHT', NULL, 0, 'OSC', 'COFFEE'),
(20, NULL, 'cortado', 'CRTD', NULL, 0, 'OSC', 'COFFEE'),
(21, NULL, 'chai latte', 'CH-LTT', NULL, 0, 'OSC', 'COFFEE'),
(22, NULL, 'flat white', 'FLT-WHT', NULL, 0, 'OSC', 'COFFEE'),
(23, NULL, 'mocha', 'MCH', NULL, 0, 'OSC', 'COFFEE'),
(24, NULL, 'hot chocolate', 'HT-CHCLT', NULL, 0, 'OSC', 'COFFEE'),
(25, NULL, 'machhiato', 'MCHHT', NULL, 0, 'OSC', 'COFFEE'),
(26, NULL, 'london fog', 'LNDN-FG', NULL, 0, 'OSC', 'COFFEE'),
(27, NULL, 'matcha latte', 'MTCH-LTT', NULL, 0, 'OSC', 'COFFEE'),
(28, 'MASAL', 'masala chai', 'MSL-CH', NULL, 2.99, 'OSC', 'COFFEE'),
(29, 'COFFE', 'Coffee', 'CFF', NULL, 0, 'OSC', 'COFFEE'),
(30, 'CHOC ', 'choc chunk', 'CHC-CHNK', NULL, 3.99, 'OSC', 'Cookies'),
(31, 'SMART', 'smartie', 'SMRT', NULL, 3.99, 'OSC', 'Cookies'),
(32, 'M&M', 'M&M', 'MM', NULL, 3.99, 'OSC', 'Cookies'),
(33, 'GINGE', 'ginger', 'GNGR', NULL, 3.99, 'OSC', 'Cookies'),
(34, 'SHORT', 'shortbread', 'SHRTBRD', NULL, 3.99, 'OSC', 'Cookies'),
(35, 'MARS', 'Mars Cookies', 'MARS', NULL, 4.99, 'OSC', 'Cookies'),
(36, 'OATME', 'Oatmeal Raisin', 'OAT', NULL, 3.99, 'OSC', 'Cookies'),
(37, 'TRIPL', 'Triple Chocolate', 'TRPL', NULL, 3.99, 'OSC', 'Cookies'),
(38, 'OREO', 'Oreo', 'R', NULL, 4.99, 'OSC', 'Cookies'),
(39, 'COFFE', 'Coffee Crisp', 'CFF-CRSP', NULL, 4.99, 'OSC', 'Cookies'),
(40, 'CRUNC', 'Crunchy', 'CRNCHY', NULL, 4.99, 'OSC', 'Cookies'),
(41, 'TRAIL', 'Trail Mix Cookie', 'TRAIL', NULL, 3.99, 'OSC', 'Cookies'),
(42, 'TUXED', 'tuxedo', 'TXD', NULL, 4.99, 'OSC', 'Cookies'),
(43, 'NUTEL', 'Nutella Chip', 'NTLL-CHP', NULL, 4.99, 'OSC', 'Cookies'),
(44, 'DECOR', 'Decorated individual cookies', 'DCRTD-NDVDL-CKS', NULL, 6, 'OSC', 'Cookies'),
(45, 'GF BO', 'GF Box decorated', 'GF-BX-DCRTD', NULL, 9, 'OSC', 'Cookies'),
(46, 'BOX D', 'Box decorated', 'BX-DCRTD', NULL, 9, 'OSC', 'Cookies'),
(47, 'MATCH', 'Matcha Cookie', 'MTCH-CK', NULL, 3, 'OSC', 'Cookies'),
(48, '4 PIE', '4 pieces Box cookies', '4-PCS-BX-CKS', NULL, 5, 'OSC', 'Cookies'),
(49, 'ALMON', 'Almond', 'LMND', NULL, 3.49, 'OSC', 'Biscotti''s'),
(50, 'CRANB', 'Cranberry', 'CRNBRRY', NULL, 3.49, 'OSC', 'Biscotti''s'),
(51, 'CHOCO', 'Triple Chocolate', 'CHCLT', NULL, 3.49, 'OSC', 'Biscotti''s'),
(52, 'SKOR', 'Skor', 'SKR', NULL, 3.49, 'OSC', 'Biscotti''s'),
(53, chr(240) || chr(376) || chr(141) || chr(166), 'single scoop', 'SNGL-SCP', NULL, 3.69, 'OSC', 'ice cream'),
(54, 'DOUBL', 'double scoop', 'DBL-SCP', NULL, 6.5, 'OSC', 'ice cream'),
(55, 'WAFFL', 'waffle', 'WFFL', NULL, 1, 'OSC', 'ice cream'),
(56, 'BERRY', 'berry bliss', 'BRRY-BLSS', NULL, 6.99, 'OSC', 'smoothies'),
(57, 'TRIPL', 'triple berry blast', 'TRPL-BRRY-BLST', NULL, 7.99, 'OSC', 'smoothies'),
(58, 'STRAW', 'strawberry blast', 'STRWBRRY-BLST', NULL, 6.49, 'OSC', 'smoothies'),
(59, 'TROPI', 'tropical sunrise', 'TRPCL-SNRS', NULL, 7.99, 'OSC', 'smoothies'),
(60, 'ISLAN', 'island glow', 'SLND-GLW', NULL, 7.99, 'OSC', 'smoothies'),
(61, 'GOLDE', 'golden wave', 'GLDN-WV', NULL, 7.99, 'OSC', 'smoothies'),
(62, 'GREEN', 'green goddess', 'GRN-GDDSS', NULL, 7.99, 'OSC', 'smoothies'),
(63, 'BERRY', 'berry green boost', 'BRRY-GRN-BST', NULL, 7.99, 'OSC', 'smoothies'),
(64, 'TROPI', 'tropical green cleanse', 'TRPCL-GRN-CLNS', NULL, 8.49, 'OSC', 'smoothies'),
(69, 'POP', 'pop', 'PP', NULL, 1.5, 'OSC', 'beverages'),
(70, 'BOTTL', 'bottled water', 'BTTLD-WTR', NULL, 1.5, 'OSC', 'beverages'),
(71, 'PELLE', 'pellegrino', 'PLLGRN', NULL, 5.2, 'OSC', 'beverages'),
(72, 'APRIC', 'apricot', 'PRCT', NULL, 3.2, 'OSC', 'Danish pastries'),
(73, 'RASPB', 'raspberry', 'RSPBRRY', NULL, 3.2, 'OSC', 'Danish pastries'),
(74, 'AVACA', 'AVACADO SANDWICH', 'VCD-SNDWCH', NULL, 8.99, 'OSC', 'Sandwiches'),
(75, 'CROIS', 'Croissant Sandwich', 'CRSSNT-SNDWCH', NULL, 7.99, 'OSC', 'Sandwiches'),
(76, 'EGG S', 'EGG SANDWICH', 'GG-SNDWCH', NULL, 7.5, 'OSC', 'Sandwiches'),
(77, 'GRILL', 'Grilled Cheese', 'GRLLD-CHS', NULL, 6.99, 'OSC', 'Sandwiches'),
(78, 'RANCH', 'ranch chicken', 'RNCH-CHCKN', NULL, 7.99, 'OSC', 'Sandwiches'),
(79, 'BUFFL', 'bufflo chicken', 'BFFL-CHCKN', NULL, 7.99, 'OSC', 'Sandwiches'),
(80, 'EGG S', 'egg salad', 'GG-SLD', NULL, 7.99, 'OSC', 'salad'),
(82, 'SPECI', 'Special Shortbread', 'SPCL-SHRTBRD', NULL, 5, 'OSC', 'Sale Items'),
(83, 'LEMON', 'Lemon Cake', 'LMN-CK', NULL, 3.99, 'OSC', 'LOAFS'),
(84, 'BANAN', 'Banana Bread', 'BNN-BRD', NULL, 3.99, 'OSC', 'LOAFS'),
(85, 'BANAN', 'Banana Chocolate', 'BNN-CHCLT', NULL, 4.69, 'OSC', 'LOAFS'),
(86, 'CARRO', 'Carrot Cake', 'CRRT-CK', NULL, 4.99, 'OSC', 'LOAFS'),
(87, 'PUMPK', 'Pumpkin walnut', 'PMPKN-WLNT', NULL, 4.99, 'OSC', 'LOAFS'),
(88, 'MINI', 'mini', 'MN', NULL, 2.5, 'OSC', 'LOAFS'),
(89, 'RASPB', 'raspberry', 'RSPBRRY', NULL, 3.99, 'OSC', 'scones'),
(90, 'CHEES', 'cheese', 'CHS', NULL, 3.99, 'OSC', 'scones'),
(91, 'BLEBE', 'bleberry', 'BLBRRY', NULL, 3.99, 'OSC', 'scones'),
(92, 'CRANB', 'cranberry', 'CRNBRRY', NULL, 3.99, 'OSC', 'scones'),
(93, 'VEGSC', 'Vegetable Savory Scones', 'VEGSCO', NULL, 3.99, 'OSC', 'scones'),
(94, 'CHOCO', 'Chocolate Scones', 'CHCLT-SCNS', NULL, 3.99, 'OSC', 'scones'),
(95, 'PACK ', 'Pack ' || chr(195) || chr(8212) || '4', 'PCK-4', NULL, 14, 'OSC', 'scones'),
(96, 'WATER', 'Water', 'WTR', NULL, 1.5, 'OSC', 'DRINKS'),
(97, 'POP S', 'Pop Sprite', 'PP-SPRT', NULL, 2, 'OSC', 'DRINKS'),
(98, 'POP C', 'Pop Coke', 'PP-CK', NULL, 2, 'OSC', 'DRINKS'),
(99, 'MONST', 'Monster Energy', 'MNSTR-NRGY', NULL, 2, 'OSC', 'DRINKS'),
(100, 'GATOR', 'gatorade', 'GTRD', NULL, 2, 'OSC', 'DRINKS'),
(101, 'MILK ', 'Milk Shake', 'MLK-SHK-LRG', NULL, 0, 'OSC', 'DRINKS'),
(102, 'APPLE', 'Apple Date', 'PPL-DT', NULL, 5.2, 'OSC', 'Squares'),
(103, 'BLUEB', 'Blueberry Cheesecake', 'BLBRRY-CHSCK', NULL, 4.89, 'OSC', 'Squares'),
(104, 'BROWN', 'Brownie', 'BRWN', NULL, 4.49, 'OSC', 'Squares'),
(105, 'CHERR', 'Cherry cheesecake', 'CHRRY-CHSCK', NULL, 4.89, 'OSC', 'Squares'),
(106, 'CHSBR', 'CHSBROW', 'CHSBRW', NULL, 4.99, 'OSC', 'Squares'),
(107, 'DATE', 'Date', 'DT', NULL, 4.49, 'OSC', 'Squares'),
(108, 'LC', 'Lemon Cranberry Loaf', 'LC', NULL, 12.5, 'OSC', 'Squares'),
(109, 'LCR', 'LCR', 'LCR', NULL, 4.49, 'OSC', 'Squares'),
(110, 'PECAN', 'Pecan', 'PCN', NULL, 4.49, 'OSC', 'Squares'),
(111, 'SKOR', 'Skor', 'SKR', NULL, 5.49, 'OSC', 'Squares'),
(112, 'WHITE', 'White Brownie', 'WHT-BRWN', NULL, 4.49, 'OSC', 'Squares'),
(113, 'DECOR', 'Decorated individual', 'DCRTD-NDVDL', NULL, 6, 'OSC', 'Mad Batter'),
(114, 'BOX D', 'Box decorated', 'BX-DCRTD', NULL, 9, 'OSC', 'Mad Batter'),
(115, 'GF BO', 'GF Box decorated', 'GF-BX-DCRTD', NULL, 9, 'OSC', 'Mad Batter'),
(116, 'TOMAT', 'tomato', 'TMT', NULL, 6.99, 'OSC', 'soup'),
(117, 'CREAM', 'creamy veggie soup', 'CRMY-VGG-SP', NULL, 7.99, 'OSC', 'soup'),
(118, 'CAESA', 'caesae chicken', 'CS-CHCKN', NULL, 7.49, 'OSC', 'wrap');

CREATE TEMP TABLE tmp_osc_modifier_source (
    row_no integer NOT NULL,
    source_modifier_no integer NOT NULL,
    modifier_group_name varchar(200) NOT NULL,
    selection_type varchar(16),
    option_order integer NOT NULL,
    option_name varchar(200) NOT NULL,
    price_delta numeric(18,4)
) ON COMMIT DROP;

INSERT INTO tmp_osc_modifier_source (
    row_no, source_modifier_no, modifier_group_name, selection_type,
    option_order, option_name, price_delta
)
VALUES
(13, 1, 'drip coffee', 'SINGLE', 1, 'small', 2.5),
(13, 1, 'drip coffee', 'SINGLE', 2, 'medium', 2.8),
(13, 1, 'drip coffee', 'SINGLE', 3, 'large', 3.1),
(14, 1, 'size', 'SINGLE', 1, 'small', 2.75),
(14, 1, 'size', 'SINGLE', 2, 'medium', 3),
(14, 1, 'size', 'SINGLE', 3, 'large', 3.25),
(14, 2, 'size', 'SINGLE', 1, 'small', 2.75),
(14, 2, 'size', 'SINGLE', 2, 'medium', 3),
(14, 2, 'size', 'SINGLE', 3, 'large', 3.25),
(15, 1, 'size', 'SINGLE', 1, 'small', 3.25),
(15, 1, 'size', 'SINGLE', 2, 'medium', 3.5),
(15, 1, 'size', 'SINGLE', 3, 'large', 4),
(17, 1, 'size', 'SINGLE', 1, 'small', 3.25),
(17, 1, 'size', 'SINGLE', 2, 'medium', 3.75),
(17, 1, 'size', 'SINGLE', 3, 'large', 4.25),
(18, 1, 'size', 'SINGLE', 1, 'small', 3.25),
(18, 1, 'size', 'SINGLE', 2, 'medium', 3.75),
(18, 1, 'size', 'SINGLE', 3, 'large', 4.25),
(19, 1, 'size', 'SINGLE', 1, 'small', 4.5),
(19, 1, 'size', 'SINGLE', 2, 'medium', 5),
(19, 1, 'size', 'SINGLE', 3, 'large', 5.5),
(20, 1, 'size', 'SINGLE', 1, 'small', 3.5),
(20, 1, 'size', 'SINGLE', 2, 'medium', 3.89),
(20, 1, 'size', 'SINGLE', 3, 'large', 4.19),
(21, 1, 'size', 'SINGLE', 1, 'small', 3.75),
(21, 1, 'size', 'SINGLE', 2, 'medium', 4.1),
(21, 1, 'size', 'SINGLE', 3, 'large', 4.5),
(22, 1, 'size', 'SINGLE', 1, 'small', 3.25),
(22, 1, 'size', 'SINGLE', 2, 'medium', 3.5),
(22, 1, 'size', 'SINGLE', 3, 'large', 4),
(23, 1, 'size', 'SINGLE', 1, 'small', 4.1),
(23, 1, 'size', 'SINGLE', 2, 'medium', 4.69),
(23, 1, 'size', 'SINGLE', 3, 'large', 4.99),
(24, 1, 'size', 'SINGLE', 1, 'small', 3.79),
(24, 1, 'size', 'SINGLE', 2, 'medium', 4),
(24, 1, 'size', 'SINGLE', 3, 'large', 4.29),
(25, 1, 'size', 'SINGLE', 1, 'small', 4.5),
(25, 1, 'size', 'SINGLE', 2, 'medium', 4.99),
(25, 1, 'size', 'SINGLE', 3, 'large', 5.49),
(26, 1, 'size', 'SINGLE', 1, 'small', 3.75),
(26, 1, 'size', 'SINGLE', 2, 'medium', 4.1),
(26, 1, 'size', 'SINGLE', 3, 'large', 4.5),
(27, 1, 'size', 'SINGLE', 1, 'small', 5),
(27, 1, 'size', 'SINGLE', 2, 'medium', 5.45),
(27, 1, 'size', 'SINGLE', 3, 'large', 5.95),
(28, 1, 'size', 'SINGLE', 1, 'small', 3.3),
(28, 1, 'size', 'SINGLE', 2, 'medium', 3.5),
(28, 1, 'size', 'SINGLE', 3, 'large', 3.99),
(29, 1, 'size', 'SINGLE', 1, 'small', 3.2),
(29, 1, 'size', 'SINGLE', 2, 'medium', 3.8),
(29, 1, 'size', 'SINGLE', 3, 'large', 4),
(101, 1, 'size', 'SINGLE', 1, 'Regular', 6),
(101, 1, 'size', 'SINGLE', 2, 'large', 8);

DO $bootstrap$
DECLARE
    -- ================================================================
    -- CHANGE ONLY THIS VALUE FOR EACH TEST ORGANIZATION.
    -- ================================================================
    v_organization_id varchar(64) := 'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303';

    v_organization_code varchar(64);
    v_actor_organization_user_id varchar(64);
    v_actor_user_id varchar(64);
    v_product_status_id varchar(64);
    v_catalog_id varchar(64);
    v_catalog_name varchar(200) := 'OSC';
    v_source_reference varchar(160) := 'BOOTSTRAP:OSC_2026-08-30';
    v_currency_code varchar(3) := 'CAD';

    r record;
    m record;
    v_category_id varchar(64);
    v_product_id varchar(40);
    v_product_code varchar(64);
    v_modifier_group_id varchar(64);
    v_modifier_option_id varchar(64);
BEGIN
    SELECT o.organization_code
      INTO v_organization_code
      FROM memginedev.organization o
     WHERE o.organization_id = v_organization_id
       AND NOT o.is_deleted;

    IF v_organization_code IS NULL THEN
        RAISE EXCEPTION 'Organization not found or deleted: %', v_organization_id;
    END IF;

    SELECT ou.organization_user_id, ou.user_id
      INTO v_actor_organization_user_id, v_actor_user_id
      FROM memginedev.organization_user ou
     WHERE ou.organization_id = v_organization_id
       AND NOT ou.is_deleted
     ORDER BY ou.created_at, ou.organization_user_id
     LIMIT 1;

    IF v_actor_organization_user_id IS NULL OR v_actor_user_id IS NULL THEN
        RAISE EXCEPTION
            'No organization_user found for organization %. Create/assign an organization admin first.',
            v_organization_id;
    END IF;

    SELECT es.entity_status_id
      INTO v_product_status_id
      FROM memginedev.entity_status es
      JOIN memginedev.entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN memginedev.statuses s
        ON s.status_id = es.status_id
     WHERE et.entity_type_code = 'PRODUCT'
       AND s.status_code = 'ACTIVE'
       AND et.is_active
       AND es.is_active
       AND s.is_active
     ORDER BY es.display_order, es.entity_status_id
     LIMIT 1;

    IF v_product_status_id IS NULL THEN
        SELECT p.status_id
          INTO v_product_status_id
          FROM memginedev.product p
         WHERE NOT p.is_deleted
         ORDER BY p.created_at, p.product_id
         LIMIT 1;
    END IF;

    IF v_product_status_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve an ACTIVE product status.';
    END IF;

    v_catalog_id :=
        ('PCT_' || substr(md5(v_organization_id || '|' || v_source_reference), 1, 32))::varchar(64);

    INSERT INTO memginedev.product_catalog (
        product_catalog_id, organization_id, integration_configuration_id,
        catalog_name, description, external_catalog_id, is_active,
        source_updated_at, last_synced_at,
        created_at, created_by, updated_at, updated_by,
        is_deleted, version_no
    )
    VALUES (
        v_catalog_id, v_organization_id, NULL,
        v_catalog_name, 'Bootstrap import from OSC_2026-08-30.xlsx',
        v_source_reference, TRUE,
        NULL, NULL,
        CURRENT_TIMESTAMP, v_actor_organization_user_id,
        CURRENT_TIMESTAMP, v_actor_organization_user_id,
        FALSE, 1
    )
    ON CONFLICT (product_catalog_id)
    DO UPDATE SET
        catalog_name = EXCLUDED.catalog_name,
        description = EXCLUDED.description,
        external_catalog_id = EXCLUDED.external_catalog_id,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_actor_organization_user_id,
        is_deleted = FALSE,
        version_no = memginedev.product_catalog.version_no + 1;

    FOR r IN
        SELECT DISTINCT btrim(category_name) AS category_name
          FROM tmp_osc_product_source
         WHERE NULLIF(btrim(category_name), '') IS NOT NULL
         ORDER BY btrim(category_name)
    LOOP
        v_category_id :=
            ('PCC_' || substr(
                md5(v_organization_id || '|OSC|CATEGORY|' || lower(r.category_name)),
                1, 32
            ))::varchar(64);

        INSERT INTO memginedev.product_catalog_category (
            product_catalog_category_id, organization_id, product_catalog_id,
            parent_category_id, external_category_id, category_name, description,
            display_order, is_active, source_updated_at, last_synced_at,
            created_at, created_by, updated_at, updated_by,
            is_deleted, version_no
        )
        VALUES (
            v_category_id, v_organization_id, v_catalog_id,
            NULL,
            'BOOTSTRAP:OSC:CATEGORY:' || md5(lower(r.category_name)),
            r.category_name, NULL,
            1, TRUE, NULL, NULL,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            FALSE, 1
        )
        ON CONFLICT (product_catalog_category_id)
        DO UPDATE SET
            category_name = EXCLUDED.category_name,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor_organization_user_id,
            is_deleted = FALSE,
            version_no = memginedev.product_catalog_category.version_no + 1;
    END LOOP;

    FOR r IN
        SELECT *
          FROM tmp_osc_product_source
         ORDER BY row_no
    LOOP
        v_product_id :=
            ('PRD_' || substr(
                md5(v_organization_id || '|OSC|ROW|' || r.row_no::text),
                1, 32
            ))::varchar(40);

        v_product_code :=
            (left(v_organization_code, 52)
             || '_PRD_'
             || lpad(r.row_no::text, 3, '0'))::varchar(64);

        IF NULLIF(btrim(r.category_name), '') IS NULL THEN
            v_category_id := NULL;
        ELSE
            v_category_id :=
                ('PCC_' || substr(
                    md5(v_organization_id || '|OSC|CATEGORY|' || lower(btrim(r.category_name))),
                    1, 32
                ))::varchar(64);
        END IF;

        INSERT INTO memginedev.product (
            product_id, organization_id, product_code, product_name, description,
            status_id, created_at, created_by, updated_at, updated_by,
            is_deleted, version_no,
            product_catalog_id, product_catalog_category_id,
            short_code, sku, upc, base_price_minor, currency_code,
            source_updated_at, last_synced_at
        )
        VALUES (
            v_product_id, v_organization_id, v_product_code, r.product_name, NULL,
            v_product_status_id,
            CURRENT_TIMESTAMP, v_actor_user_id,
            CURRENT_TIMESTAMP, v_actor_user_id,
            FALSE, 1,
            v_catalog_id, v_category_id,
            NULLIF(btrim(r.short_code), ''),
            NULLIF(btrim(r.sku), ''),
            NULLIF(btrim(r.upc), ''),
            CASE WHEN r.price IS NULL THEN NULL ELSE round(r.price * 100)::bigint END,
            v_currency_code,
            NULL, NULL
        )
        ON CONFLICT (product_id)
        DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            product_code = EXCLUDED.product_code,
            product_name = EXCLUDED.product_name,
            description = EXCLUDED.description,
            status_id = EXCLUDED.status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor_user_id,
            is_deleted = FALSE,
            version_no = memginedev.product.version_no + 1,
            product_catalog_id = EXCLUDED.product_catalog_id,
            product_catalog_category_id = EXCLUDED.product_catalog_category_id,
            short_code = EXCLUDED.short_code,
            sku = EXCLUDED.sku,
            upc = EXCLUDED.upc,
            base_price_minor = EXCLUDED.base_price_minor,
            currency_code = EXCLUDED.currency_code;
    END LOOP;

    FOR m IN
        SELECT DISTINCT
               row_no,
               btrim(modifier_group_name) AS modifier_group_name,
               upper(COALESCE(NULLIF(btrim(selection_type), ''), 'SINGLE')) AS selection_type
          FROM tmp_osc_modifier_source
         ORDER BY row_no, btrim(modifier_group_name)
    LOOP
        v_product_id :=
            ('PRD_' || substr(
                md5(v_organization_id || '|OSC|ROW|' || m.row_no::text),
                1, 32
            ))::varchar(40);

        v_modifier_group_id :=
            ('PMG_' || substr(
                md5(
                    v_organization_id || '|OSC|ROW|' || m.row_no::text
                    || '|GROUP|' || lower(m.modifier_group_name)
                    || '|' || m.selection_type
                ),
                1, 32
            ))::varchar(64);

        INSERT INTO memginedev.product_modifier_group (
            product_modifier_group_id, organization_id, product_id,
            external_modifier_group_id, modifier_group_name, selection_type,
            min_selections, max_selections, is_required, display_order, is_active,
            source_updated_at, last_synced_at,
            created_at, created_by, updated_at, updated_by,
            is_deleted, version_no
        )
        VALUES (
            v_modifier_group_id, v_organization_id, v_product_id,
            NULL, m.modifier_group_name,
            CASE
                WHEN m.selection_type IN ('SINGLE', 'MULTIPLE') THEN m.selection_type
                ELSE 'SINGLE'
            END,
            0,
            CASE WHEN m.selection_type = 'SINGLE' THEN 1 ELSE NULL END,
            FALSE, 1, TRUE,
            NULL, NULL,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            FALSE, 1
        )
        ON CONFLICT (product_modifier_group_id)
        DO UPDATE SET
            modifier_group_name = EXCLUDED.modifier_group_name,
            selection_type = EXCLUDED.selection_type,
            min_selections = EXCLUDED.min_selections,
            max_selections = EXCLUDED.max_selections,
            is_required = EXCLUDED.is_required,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor_organization_user_id,
            is_deleted = FALSE,
            version_no = memginedev.product_modifier_group.version_no + 1;
    END LOOP;

    FOR m IN
        SELECT
            row_no,
            btrim(modifier_group_name) AS modifier_group_name,
            upper(COALESCE(NULLIF(btrim(selection_type), ''), 'SINGLE')) AS selection_type,
            btrim(option_name) AS option_name,
            min(option_order) AS option_order,
            max(price_delta) AS price_delta
        FROM tmp_osc_modifier_source
        GROUP BY
            row_no,
            btrim(modifier_group_name),
            upper(COALESCE(NULLIF(btrim(selection_type), ''), 'SINGLE')),
            btrim(option_name)
        ORDER BY row_no, btrim(modifier_group_name), min(option_order)
    LOOP
        v_modifier_group_id :=
            ('PMG_' || substr(
                md5(
                    v_organization_id || '|OSC|ROW|' || m.row_no::text
                    || '|GROUP|' || lower(m.modifier_group_name)
                    || '|' || m.selection_type
                ),
                1, 32
            ))::varchar(64);

        v_modifier_option_id :=
            ('PMO_' || substr(
                md5(v_modifier_group_id || '|OPTION|' || lower(m.option_name)),
                1, 32
            ))::varchar(64);

        INSERT INTO memginedev.product_modifier_option (
            product_modifier_option_id, organization_id, product_modifier_group_id,
            external_modifier_option_id, option_name, price_delta_minor,
            sku, upc, display_order, is_active,
            source_updated_at, last_synced_at,
            created_at, created_by, updated_at, updated_by,
            is_deleted, version_no
        )
        VALUES (
            v_modifier_option_id, v_organization_id, v_modifier_group_id,
            NULL, m.option_name,
            COALESCE(round(m.price_delta * 100)::bigint, 0),
            NULL, NULL, m.option_order, TRUE,
            NULL, NULL,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            CURRENT_TIMESTAMP, v_actor_organization_user_id,
            FALSE, 1
        )
        ON CONFLICT (product_modifier_option_id)
        DO UPDATE SET
            option_name = EXCLUDED.option_name,
            price_delta_minor = EXCLUDED.price_delta_minor,
            display_order = EXCLUDED.display_order,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor_organization_user_id,
            is_deleted = FALSE,
            version_no = memginedev.product_modifier_option.version_no + 1;
    END LOOP;

    RAISE NOTICE 'OSC bootstrap complete for organization %', v_organization_id;
    RAISE NOTICE 'Catalog ID: %', v_catalog_id;
END
$bootstrap$;

SELECT
    pc.organization_id,
    pc.product_catalog_id,
    pc.catalog_name,
    count(DISTINCT p.product_id) AS product_count,
    count(DISTINCT pcc.product_catalog_category_id) AS category_count,
    count(DISTINCT pmg.product_modifier_group_id) AS modifier_group_count,
    count(DISTINCT pmo.product_modifier_option_id) AS modifier_option_count
FROM memginedev.product_catalog pc
LEFT JOIN memginedev.product p
       ON p.product_catalog_id = pc.product_catalog_id
      AND NOT p.is_deleted
LEFT JOIN memginedev.product_catalog_category pcc
       ON pcc.product_catalog_id = pc.product_catalog_id
      AND NOT pcc.is_deleted
LEFT JOIN memginedev.product_modifier_group pmg
       ON pmg.product_id = p.product_id
      AND NOT pmg.is_deleted
LEFT JOIN memginedev.product_modifier_option pmo
       ON pmo.product_modifier_group_id = pmg.product_modifier_group_id
      AND NOT pmo.is_deleted
WHERE pc.external_catalog_id = 'BOOTSTRAP:OSC_2026-08-30'
  AND NOT pc.is_deleted
GROUP BY pc.organization_id, pc.product_catalog_id, pc.catalog_name
ORDER BY pc.organization_id;

-- Expected per organization:
--   product_count          = 113
--   category_count         = 17
--   modifier_group_count   = 17
--   modifier_option_count  = 50

COMMIT;
