-- round_price_report and price_alert_report were merged into
-- market_survey_detailed_report (the alert report is now the only_alerts filter).
-- Report history stores the key as plain text, so old rows would otherwise show
-- the raw key instead of a title. Run once per environment.

UPDATE cpi_tripura_generated_report
SET report_type = 'market_survey_detailed_report'
WHERE report_type IN ('round_price_report', 'price_alert_report');
