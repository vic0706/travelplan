-- Store departure/arrival coordinates on Bookings so they survive edits.
-- Without these columns, editing a booking clears the coords from regenerated
-- itinerary items, and the optimizer can no longer compute travel times.
ALTER TABLE Bookings ADD COLUMN lat REAL;
ALTER TABLE Bookings ADD COLUMN lng REAL;
ALTER TABLE Bookings ADD COLUMN arrival_lat REAL;
ALTER TABLE Bookings ADD COLUMN arrival_lng REAL;
