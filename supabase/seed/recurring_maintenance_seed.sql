-- BENi recurring maintenance bank. The report says what is WRONG today;
-- this is the upkeep every home needs anyway. A homeowner should never be
-- asked whether something recurs - BENi should already know.
-- Sources: InterNACHI Homeowner Maintenance Book + life-expectancy chart,
-- priced against the BENi cost database (Calgary 2026). Re-runnable.

do $$ begin
  alter table public.standard_features add constraint standard_features_name_key unique (name);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.standard_tasks add constraint standard_tasks_feature_title_key unique (feature_id, title);
exception when duplicate_object then null; end $$;

insert into public.standard_features (name, keywords) values
  ('Forced Air Furnace', array['furnace','forced air','heating']),
  ('Central Air Conditioning', array['air conditioner','condenser','cooling']),
  ('HRV / ERV Ventilator', array['hrv','erv','ventilator','air exchanger']),
  ('Tank Water Heater', array['water heater','hot water tank']),
  ('Gutters & Downspouts', array['gutter','eavestrough','downspout']),
  ('Roof', array['roof','shingles','flashing']),
  ('Attic', array['attic','insulation','soffit']),
  ('Clothes Dryer', array['dryer','dryer vent','laundry']),
  ('Smoke & CO Alarms', array['smoke alarm','carbon monoxide']),
  ('Sump Pump', array['sump','sump pump']),
  ('Wood Fireplace / Chimney', array['chimney','wood fireplace','creosote']),
  ('Gas Fireplace', array['gas fireplace','pilot']),
  ('Deck', array['deck','railing','joist']),
  ('Garage Door', array['garage door','opener','safety sensor']),
  ('Grading & Drainage', array['grading','slope','drainage','window well']),
  ('Plumbing Fixtures', array['faucet','toilet','shut-off'])
on conflict (name) do update set keywords = excluded.keywords;

insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_interval, recur_anchor, system, cost_min, cost_max)
select f.id, v.title, v.descr, v.freq, v.iv, v.anchor, v.sys, v.cmin, v.cmax
from (values
  ('Forced Air Furnace','Replace the furnace filter','A clogged filter makes the furnace work harder, raises your heating bill and lowers air quality. A five-minute DIY job.','monthly',3,'completion','hvac',15,40),
  ('Forced Air Furnace','Book annual furnace service','A yearly tune-up keeps the furnace safe and efficient, and most manufacturers require it to keep the warranty valid.','yearly',1,'due_date','hvac',120,320),
  ('Central Air Conditioning','Clean the AC condenser and book a service','Clear debris from the outdoor unit and have coils and refrigerant checked before cooling season.','yearly',1,'due_date','hvac',150,500),
  ('HRV / ERV Ventilator','Clean or replace the HRV/ERV filters','Dirty ventilator filters quietly kill airflow and let humidity build up over a Calgary winter.','monthly',6,'completion','hvac',20,120),
  ('Tank Water Heater','Flush the water heater tank','Draining a few litres clears sediment that shortens tank life and cuts hot water capacity.','yearly',1,'completion','plumbing',0,200),
  ('Plumbing Fixtures','Check under sinks for leaks','Look under every sink and around toilets for drips or staining. Catching a slow leak early avoids replacing a cabinet or subfloor.','monthly',6,'completion','plumbing',0,150),
  ('Sump Pump','Test the sump pump','Pour a bucket of water into the pit and confirm the pump runs and shuts off. Do this before spring melt.','monthly',6,'completion','plumbing',0,250),
  ('Gutters & Downspouts','Clean gutters and downspouts','Clogged eavestroughs overflow and send water straight at the foundation, the leading cause of basement moisture.','monthly',6,'completion','roof_attic',100,250),
  ('Roof','Inspect the roof from the ground','Look for lifted, cracked or missing shingles and damaged flashing around the chimney and vents. Binoculars are safer than a ladder.','yearly',1,'due_date','roof_attic',0,300),
  ('Attic','Check the attic for moisture and insulation gaps','Look for frost, staining or compressed insulation. Attic problems stay invisible until they reach your ceiling.','yearly',1,'due_date','roof_attic',0,250),
  ('Smoke & CO Alarms','Test all smoke and CO alarms','Press and hold the test button on every alarm. Two minutes, and the highest-value maintenance task in the home.','monthly',1,'completion','interior',0,0),
  ('Smoke & CO Alarms','Replace smoke and CO alarm batteries','Swap batteries yearly even if they have not chirped.','yearly',1,'completion','interior',15,60),
  ('Clothes Dryer','Clean the dryer vent duct','Lint buildup in the duct is a genuine fire risk and makes every load run longer.','yearly',1,'completion','interior',100,250),
  ('Garage Door','Test the garage door safety sensors and lubricate','Wave an object through the beam to confirm the door reverses, then lubricate rollers and hinges.','yearly',1,'completion','exterior',0,200),
  ('Wood Fireplace / Chimney','Book a chimney sweep and inspection','Creosote buildup is the main cause of chimney fires. An annual sweep by a WETT-certified tech is the standard.','yearly',1,'due_date','hvac',250,900),
  ('Gas Fireplace','Service the gas fireplace','Have the pilot, glass gasket and venting checked before winter.','yearly',1,'due_date','hvac',180,700),
  ('Deck','Inspect the deck structure','Check joists, posts and railings for rot and movement, especially where the deck attaches to the house.','yearly',1,'due_date','exterior',0,400),
  ('Deck','Clean and reseal the deck','Resealing every couple of years is what keeps a deck from becoming a rebuild.','yearly',2,'completion','exterior',300,1200),
  ('Grading & Drainage','Check grading and clear window wells','Confirm the ground still slopes away from the house and window wells are clear before spring melt.','yearly',1,'due_date','exterior',0,500)
) as v(feature_name, title, descr, freq, iv, anchor, sys, cmin, cmax)
join public.standard_features f on f.name = v.feature_name
on conflict (feature_id, title) do update set
  description = excluded.description, recur_frequency = excluded.recur_frequency,
  recur_interval = excluded.recur_interval, recur_anchor = excluded.recur_anchor,
  system = excluded.system, cost_min = excluded.cost_min, cost_max = excluded.cost_max;
