-- One-off backfill: subdivision + market details for the 80 existing markets
-- Source: 'kCPI Markets details' Excel, joined to markets by market_code
-- Run: psql $MIGRATION_DATABASE_URL -f scripts/backfill_market_subdivision_details.sql

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6679),
    market_day = 'Saturday /Tuesday',
    market_time = 'Evening',
    block_ulb_name = 'Jirania',
    block_lgd_code = 2439,
    dso_office = 'DSO West'
WHERE market_code = 'RN0101';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6689),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Bamutia',
    block_lgd_code = 6791,
    dso_office = 'DSO West'
WHERE market_code = 'RN0102';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6689),
    market_day = 'Tuesday / Saturday',
    market_time = 'Morning to Afternoon',
    block_ulb_name = 'Hezamara',
    block_lgd_code = 2437,
    dso_office = 'DSO West'
WHERE market_code = 'RN0103';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6680),
    market_day = 'Tuesday / Saturday',
    market_time = 'Morning & Evening',
    block_ulb_name = 'Boxanagar',
    block_lgd_code = 2435,
    dso_office = 'DSO West'
WHERE market_code = 'RN0201';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6699),
    market_day = 'Saturday',
    market_time = 'Evening',
    block_ulb_name = 'Bishalgarh',
    block_lgd_code = 2434,
    dso_office = 'DSO West'
WHERE market_code = 'RN0202';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6680),
    market_day = 'Tuesday / Sunday',
    market_time = 'Evening',
    block_ulb_name = 'Mohanbhog',
    block_lgd_code = 6787,
    dso_office = 'DSO West'
WHERE market_code = 'RN0203';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6698),
    market_day = 'Sunday / Thursday',
    market_time = 'Morning',
    block_ulb_name = 'Kalyanpur',
    block_lgd_code = 2440,
    dso_office = 'DSO West'
WHERE market_code = 'RN0301';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6698),
    market_day = 'Wednesday / Saturday',
    market_time = 'Morning',
    block_ulb_name = 'Teliamura',
    block_lgd_code = 2448,
    dso_office = 'DSO West'
WHERE market_code = 'RN0302';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Khowai',
    block_lgd_code = 2442,
    dso_office = 'DSO West'
WHERE market_code = 'RN0303';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Monday/ Thursday',
    market_time = 'Morning',
    block_ulb_name = 'Matabari',
    block_lgd_code = 2430,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0401';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6695),
    market_day = 'Sunday',
    market_time = 'Morning',
    block_ulb_name = 'Amarpur',
    block_lgd_code = 2424,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0402';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Wednesday/Saturday',
    market_time = 'Morning',
    block_ulb_name = 'Killa',
    block_lgd_code = 2428,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0403';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6683),
    market_day = 'Wednesday/',
    market_time = 'All Time',
    block_ulb_name = 'Jolaibari',
    block_lgd_code = 6723,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0501';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6688),
    market_day = 'Saturday/Tuesday',
    market_time = 'All Time',
    block_ulb_name = 'Satchand',
    block_lgd_code = 2433,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0502';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6688),
    market_day = 'Monday/ Friday',
    market_time = 'All Time',
    block_ulb_name = 'Rupaichari',
    block_lgd_code = 2432,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RN0503';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6691),
    market_day = 'Tuesday/Friday',
    market_time = 'Afternoon',
    block_ulb_name = 'Kadamtala',
    block_lgd_code = 2419,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0601';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6678),
    market_day = 'Tuesday/Friday',
    market_time = 'Evening',
    block_ulb_name = 'Panisagar',
    block_lgd_code = 2421,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0602';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6691),
    market_day = 'Monday/ Friday',
    market_time = 'Evening',
    block_ulb_name = 'Kadamtala',
    block_lgd_code = 2419,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0603';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6694),
    market_day = 'Monday/ Thursday',
    market_time = 'Evening',
    block_ulb_name = 'Kumarghat',
    block_lgd_code = 2420,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0701';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6682),
    market_day = 'Thursday',
    market_time = 'Evening',
    block_ulb_name = 'Gournagar',
    block_lgd_code = 2417,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0702';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6694),
    market_day = 'Saturday/Tuesday',
    market_time = 'Evening',
    block_ulb_name = 'Kumarghat',
    block_lgd_code = 2420,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RN0703';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6681),
    market_day = 'Friday',
    market_time = 'Morning',
    block_ulb_name = 'Durga Chowmuhani',
    block_lgd_code = 6729,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RN0801';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6697),
    market_day = 'Tuesday',
    market_time = 'Morning',
    block_ulb_name = 'Ambassa',
    block_lgd_code = 2410,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RN0802';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6681),
    market_day = 'Monday',
    market_time = 'Morning',
    block_ulb_name = 'Salma',
    block_lgd_code = 2414,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RN0803';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6689),
    market_day = 'Thrusday/Sunday',
    market_time = 'Morning to Afternoon',
    block_ulb_name = 'Mohanpur',
    block_lgd_code = 2445,
    dso_office = 'DSO West'
WHERE market_code = 'RT0101';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6679),
    market_day = 'Friday / Monday',
    market_time = 'Evening',
    block_ulb_name = 'Jirania',
    block_lgd_code = 2439,
    dso_office = 'DSO West'
WHERE market_code = 'RT0102';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6689),
    market_day = 'Wednesday / Sunday',
    market_time = 'Morning Time',
    block_ulb_name = 'Hezamara',
    block_lgd_code = 2437,
    dso_office = 'DSO West'
WHERE market_code = 'RT0103';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6677),
    market_day = 'Sunday/ Thursday',
    market_time = 'Morning to Afternoon',
    block_ulb_name = 'Jampuijala',
    block_lgd_code = 2438,
    dso_office = 'DSO West'
WHERE market_code = 'RT0201';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6680),
    market_day = 'Saturday',
    market_time = 'Evening',
    block_ulb_name = 'Boxanagar',
    block_lgd_code = 2435,
    dso_office = 'DSO West'
WHERE market_code = 'RT0202';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6699),
    market_day = 'Tuesday / Friday',
    market_time = 'Evening Time',
    block_ulb_name = 'Bishalgarh',
    block_lgd_code = 2434,
    dso_office = 'DSO West'
WHERE market_code = 'RT0203';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Saturday / Tuesday',
    market_time = 'Morning',
    block_ulb_name = 'Tulasikhar',
    block_lgd_code = 2449,
    dso_office = 'DSO West'
WHERE market_code = 'RT0301';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Monday',
    market_time = 'Morning',
    block_ulb_name = 'Teliamura',
    block_lgd_code = 2448,
    dso_office = 'DSO West'
WHERE market_code = 'RT0302';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Wednesday /Saturday',
    market_time = 'Afternoon',
    block_ulb_name = 'Padmabil',
    block_lgd_code = 2447,
    dso_office = 'DSO West'
WHERE market_code = 'RT0303';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6695),
    market_day = 'Saturday/Wednesday',
    market_time = 'Morning',
    block_ulb_name = 'Amarpur',
    block_lgd_code = 2423,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0401';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Monday/ Friday',
    market_time = 'All Time',
    block_ulb_name = 'Udaipur',
    block_lgd_code = 249796,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0402';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Tuesday/Friday',
    market_time = 'Morning',
    block_ulb_name = 'Matabari',
    block_lgd_code = 2429,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0403';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6687),
    market_day = 'Monday/Friday',
    market_time = 'All Time',
    block_ulb_name = 'Rajnagar',
    block_lgd_code = 2431,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0501';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6687),
    market_day = 'Sunday/Thursday',
    market_time = 'All Time',
    block_ulb_name = 'Hrishyamukh',
    block_lgd_code = 2425,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0502';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6683),
    market_day = 'Sunday/ Thursday',
    market_time = 'All Time',
    block_ulb_name = 'santirbazar Municipality',
    block_lgd_code = 261689,
    dso_office = 'DSO Gomati'
WHERE market_code = 'RT0503';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6685),
    market_day = 'Friday',
    market_time = 'Morning',
    block_ulb_name = 'Dasda',
    block_lgd_code = 2416,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0601';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6678),
    market_day = 'Tuesday/Friday',
    market_time = 'Evening',
    block_ulb_name = 'Damchhara',
    block_lgd_code = 2415,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0602';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6685),
    market_day = 'Thursday',
    market_time = 'Morning',
    block_ulb_name = 'Jampuihill',
    block_lgd_code = 2418,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0603';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6682),
    market_day = 'Thursday',
    market_time = 'Afternoon',
    block_ulb_name = 'Chandipur',
    block_lgd_code = 6785,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0701';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6694),
    market_day = 'Saturday',
    market_time = 'Afternoon',
    block_ulb_name = 'Pacharthal',
    block_lgd_code = 2422,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0702';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6694),
    market_day = 'Sunday',
    market_time = 'Morning',
    block_ulb_name = 'Kumarghat',
    block_lgd_code = 2420,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'RT0703';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6681),
    market_day = 'Sunday /Thursday',
    market_time = 'Morning',
    block_ulb_name = 'Durga Chowmuhani',
    block_lgd_code = 6729,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RT0801';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6692),
    market_day = 'Monday',
    market_time = 'Morning',
    block_ulb_name = 'Manu',
    block_lgd_code = 2413,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RT0802';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6686),
    market_day = 'Tuesday',
    market_time = 'Morning',
    block_ulb_name = 'Damburnagar',
    block_lgd_code = 2412,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'RT0803';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0101';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0102';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0103';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0104';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0105';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning & Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0106';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Mohanpur Municipality',
    block_lgd_code = 261692,
    dso_office = 'DSO West'
WHERE market_code = 'UO0107';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6699),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Bishalgarh Municipality',
    block_lgd_code = 261690,
    dso_office = 'DSO West'
WHERE market_code = 'UO0108';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6679),
    market_day = 'Sunday/ Thursday',
    market_time = 'Afternoon',
    block_ulb_name = 'Jirania town Panchayat',
    block_lgd_code = 261687,
    dso_office = 'DSO West'
WHERE market_code = 'UO0109';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0110';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Monday / Thursday',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0111';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning & Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0112';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249786,
    dso_office = 'DSO West'
WHERE market_code = 'UO0113';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0114';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6679),
    market_day = 'Wednesday / Saturday',
    market_time = 'Evening',
    block_ulb_name = 'Jirania',
    block_lgd_code = 2439,
    dso_office = 'DSO West'
WHERE market_code = 'UO0115';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Every day',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0116';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Agartala',
    block_lgd_code = 249787,
    dso_office = 'DSO West'
WHERE market_code = 'UO0117';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6696),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Mohanpur Municipality',
    block_lgd_code = 261692,
    dso_office = 'DSO West'
WHERE market_code = 'UO0118';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6699),
    market_day = 'Saturday',
    market_time = 'Evening',
    block_ulb_name = 'Bishalgarh Municipality',
    block_lgd_code = 261690,
    dso_office = 'DSO West'
WHERE market_code = 'UO0201';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6699),
    market_day = 'Everyday',
    market_time = 'Evening',
    block_ulb_name = 'Bishalgarh Municipality',
    block_lgd_code = 261690,
    dso_office = 'DSO West'
WHERE market_code = 'UO0202';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Everyday',
    market_time = 'Morning & Evening',
    block_ulb_name = 'Khowai Municipality',
    block_lgd_code = 249783,
    dso_office = 'DSO West'
WHERE market_code = 'UO0301';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6684),
    market_day = 'Everyday',
    market_time = 'Morning',
    block_ulb_name = 'Khowai Municipality',
    block_lgd_code = 249783,
    dso_office = 'DSO West'
WHERE market_code = 'UO0302';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Everyday',
    market_time = 'All Time',
    block_ulb_name = 'Udaipur',
    block_lgd_code = 249796,
    dso_office = 'DSO Gomati'
WHERE market_code = 'UO0401';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6693),
    market_day = 'Everyday',
    market_time = 'All Time',
    block_ulb_name = 'Udaipur',
    block_lgd_code = 249797,
    dso_office = 'DSO Gomati'
WHERE market_code = 'UO0402';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6687),
    market_day = 'Saturday/ Wednesday',
    market_time = 'Evening',
    block_ulb_name = 'Belonia Municipality',
    block_lgd_code = 249798,
    dso_office = 'DSO Gomati'
WHERE market_code = 'UO0501';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6687),
    market_day = 'Saturday/Wednesday',
    market_time = 'Evening',
    block_ulb_name = 'Belonia Municipality',
    block_lgd_code = 249798,
    dso_office = 'DSO Gomati'
WHERE market_code = 'UO0502';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6691),
    market_day = 'Monday/Thursday',
    market_time = 'Morning',
    block_ulb_name = 'Dharmanagar Municipality',
    block_lgd_code = 249803,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'UO0601';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6678),
    market_day = 'Wednesday/Sunday',
    market_time = 'Afternoon',
    block_ulb_name = 'Damchhara',
    block_lgd_code = 2415,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'UO0602';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6694),
    market_day = 'Wednesday/Saturday',
    market_time = 'Morning',
    block_ulb_name = 'Kumarghat Municipality',
    block_lgd_code = 249805,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'UO0701';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6682),
    market_day = 'Saturday/ Wednesday',
    market_time = 'Morning',
    block_ulb_name = 'Kailashahar Municipality',
    block_lgd_code = 249804,
    dso_office = 'DSO Unakoti'
WHERE market_code = 'UO0702';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6697),
    market_day = 'Saturday',
    market_time = 'Morning',
    block_ulb_name = 'Ambassa Municipality',
    block_lgd_code = 249802,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'UO0801';

UPDATE cpi_tripura_market SET
    subdivision_id = (SELECT subdivision_id FROM cpi_tripura_subdivision WHERE lgd_code = 6692),
    market_day = 'Sunday',
    market_time = 'Morning',
    block_ulb_name = 'Manu',
    block_lgd_code = 2413,
    dso_office = 'DSO Dhalai'
WHERE market_code = 'UO0802';
