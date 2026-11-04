-- Seed data: Tripura districts (code is the 2-digit prefix used in surveyor usernames)
INSERT INTO CPI_TRIPURA_DISTRICT (name, code, lgd_code) VALUES
('West Tripura',  '01', 272),
('Sepahijala',    '02', 653),
('Khowai',        '03', 652),
('Gomati',        '04', 654),
('South Tripura', '05', 271),
('North Tripura', '06', 270),
('Unakoti',       '07', 655),
('Dhalai',        '08', 269)
ON CONFLICT (name) DO UPDATE SET lgd_code = EXCLUDED.lgd_code;


-- Seed data: Tripura subdivisions (LGD sub-division codes)
INSERT INTO CPI_TRIPURA_SUBDIVISION (name, lgd_code, district_id) VALUES
('Jampuijala',        6677, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Sepahijala')),
('Panisagar',         6678, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'North Tripura')),
('Jirania',           6679, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'West Tripura')),
('Sonamura',          6680, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Sepahijala')),
('Kamalpur',          6681, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Dhalai')),
('Kailashahar',       6682, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Unakoti')),
('Santirbazar',       6683, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'South Tripura')),
('Khowai',            6684, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Khowai')),
('Kanchanpur',        6685, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'North Tripura')),
('Gandacherra',       6686, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Dhalai')),
('Belonia',           6687, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'South Tripura')),
('Sabroom',           6688, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'South Tripura')),
('Mohanpur',          6689, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'West Tripura')),
('Dharmanagar',       6691, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'North Tripura')),
('Longtharai Valley', 6692, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Dhalai')),
('Udaipur',           6693, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Gomati')),
('Kumarghat',         6694, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Unakoti')),
('Amarpur',           6695, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Gomati')),
('Sadar',             6696, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'West Tripura')),
('Ambassa',           6697, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Dhalai')),
('Teliamura',         6698, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Khowai')),
('Bishalgarh',        6699, (SELECT district_id FROM CPI_TRIPURA_DISTRICT WHERE name = 'Sepahijala'))
ON CONFLICT (name) DO NOTHING;


-- Seed data: Tripura tehsils (based on Tripura's 58 tehsils)
INSERT INTO CPI_TRIPURA_TEHSIL (name, teh_mmdc) VALUES
('Agartala', '01925'), ('Jirania', '01931'), ('Mohanpur', '01922'),
('Bishalgarh', '01934'), ('Sonamura', '01939'), ('Khowai', '01926'),
('Teliamura', '01929'), ('Amarpur', '01940'), ('Udaipur', '01937'),
('Ambassa', '01947'), ('Dharmanagar', '01955'), ('Belonia', '01944'),
('Santirbazar', '01945'),
('Hezamara', '01923'),
('Padmabil', '01924'),
('Kalyanpur', '01927'),
('East Takarjala', '01933'),
('Boxanagar', '01935'),
('Telkajla, Melaghar', '01936'),
('Killa', '01938'),
('Matarbari', '01941'),
('Kakraban', '01942'),
('Rajnagar', '01943'),
('Karbook', '01946'),
('Harina', '01948'),
('Salema', '01949'),
('Manu', '01950'),
('Dumburnagar', '01953'),
('Gournagar', '01954'),
('Panisagar', '01956'),
('Damcherra', '01957'),
('Kumarghat', '01959'),
('Dasda', '01960'),
('Jampui Hills', '01961'),
('Tulashikhar', '01926'),
('Bokafa', '01945'),
('Matai', '01944'),
('Manubankul', '01947'),
('North Maharanipur', '01927'),
('Kadamtala', '01956')
ON CONFLICT (name) DO NOTHING;
