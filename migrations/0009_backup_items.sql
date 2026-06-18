-- 行程備案：每個行程可以有多個備案（backup_for_id 指向主要行程）
ALTER TABLE Itineraries ADD COLUMN backup_for_id INTEGER DEFAULT NULL
  REFERENCES Itineraries(id) ON DELETE CASCADE;
