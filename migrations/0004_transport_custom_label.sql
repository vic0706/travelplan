-- Custom label for CUSTOM transport mode (shown on activity card bottom bar)
ALTER TABLE Itineraries ADD COLUMN next_transport_custom_label TEXT DEFAULT '';
