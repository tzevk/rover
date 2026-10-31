-- 012: units for any kind of business, not only bulk material. Existing items keep their unit.
ALTER TABLE materials MODIFY unit ENUM('tonne', 'brass', 'cft', 'cum', 'piece', 'kg', 'litre', 'metre', 'box', 'set', 'hour') NOT NULL DEFAULT 'piece';
