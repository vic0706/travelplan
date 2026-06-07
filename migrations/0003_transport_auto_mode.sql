-- Add auto-mode transport columns
-- next_transport_resolved_mode: mode chosen by haversine comparison when next_transport_mode='AUTO'
-- next_transport_haversine_time: haversine estimate (in minutes) for the selected/resolved mode
ALTER TABLE Itineraries ADD COLUMN next_transport_resolved_mode TEXT DEFAULT '';
ALTER TABLE Itineraries ADD COLUMN next_transport_haversine_time TEXT DEFAULT '';
