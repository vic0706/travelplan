// ==========================================
// Itineraries (行程項目 CRUD)
// ==========================================

// 取得行程列表
router.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date ASC, start_time ASC').bind(tripId).all();
  return c.json(results);
});

// 💡 建立新行程 (POST)
router.post('/:id/itineraries', async (c) => {
  try {
    const tripId = c.req.param('id');
    const body = await c.req.json();
    const id = crypto.randomUUID();
    
    // 防呆處理標籤為字串
    const tagsStr = Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '';

    await c.env.DB.prepare(
      `INSERT INTO Itineraries 
      (id, trip_id, date, start_time, end_time, title, address, google_place_id, lat, lng, notes, icon, tags, sub_items, is_time_fixed) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, tripId, body.date, body.start_time, body.end_time, body.title, 
      body.address || '', body.google_place_id || '', body.lat || null, body.lng || null, 
      body.notes || '', body.icon || 'MapPin', tagsStr, body.sub_items || '[]', body.is_time_fixed || 0
    ).run();

    return c.json({ id, ...body });
  } catch (error: any) {
    console.error("Insert Itinerary Error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// 💡 更新行程 (PUT)
router.put('/:id/itineraries/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const body = await c.req.json();
    const tagsStr = Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '';

    await c.env.DB.prepare(
      `UPDATE Itineraries SET 
        date = ?, start_time = ?, end_time = ?, title = ?, address = ?, 
        google_place_id = ?, lat = ?, lng = ?, notes = ?, icon = ?, tags = ?, 
        sub_items = ?, is_time_fixed = ?
       WHERE id = ?`
    ).bind(
      body.date, body.start_time, body.end_time, body.title, body.address || '', 
      body.google_place_id || '', body.lat || null, body.lng || null, body.notes || '', 
      body.icon || 'MapPin', tagsStr, body.sub_items || '[]', body.is_time_fixed || 0,
      itemId
    ).run();

    return c.json({ id: itemId, ...body });
  } catch (error: any) {
    console.error("Update Itinerary Error:", error);
    return c.json({ error: error.message }, 500);
  }
});