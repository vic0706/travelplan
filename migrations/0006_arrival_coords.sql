-- arrival_lat / arrival_lng: coordinates of the DESTINATION for transport items (flights, trains, etc.)
-- Used by the optimizer to anchor the gap that follows a transport item at the arrival location,
-- so smart items placed after a flight are checked against the arrival airport, not the departure airport.
ALTER TABLE Itineraries ADD COLUMN arrival_lat REAL;
ALTER TABLE Itineraries ADD COLUMN arrival_lng REAL;
