export function generateDesiredAccommodationItems(b: any, bookingId: string | number, hotelImage: string) {
  const desiredItems: any[] = [];
  const startDate = new Date(b.check_in_date || b.start_date);
  const endDate = new Date(b.check_out_date || b.end_date);
  const checkInTime = b.check_in_time || b.start_time || '16:00';
  const checkOutTime = b.check_out_time || b.end_time || '11:00';
  const details = typeof b.details === 'string' ? JSON.parse(b.details || '{}') : (b.details || {});
  const dailyStartTime = b.daily_start_time || details.daily_start_time || '08:00';
  const dailyEndTime = b.daily_end_time || details.daily_end_time || '22:00';
  const currentDate = new Date(startDate);
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const isCheckInDay = dateStr === (b.check_in_date || b.start_date);
    const isCheckOutDay = dateStr === (b.check_out_date || b.end_date);
    const itemName = b.name || b.hotel_name;
    if (isCheckInDay) {
      desiredItems.push({ date: dateStr, start_time: checkInTime, end_time: checkInTime, title: `Check-in ${itemName}`, notes: notesWithOrder, image_url: hotelImage, address: b.start_location || '', matchType: 'Check-in' });
      if (!isCheckOutDay) desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Back to Hotel' });
    } else if (isCheckOutDay) {
      desiredItems.push({ date: dateStr, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${itemName}`, notes: notesWithOrder, image_url: hotelImage, address: b.start_location || '', matchType: 'Check-out' });
    } else {
      desiredItems.push({ date: dateStr, start_time: dailyStartTime, end_time: dailyStartTime, title: `Leave ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Leave Hotel' });
      desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Back to Hotel' });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return desiredItems;
}

export function generateDesiredRentalItems(b: any, bookingId: string | number, rentalImage: string) {
  const desiredItems: any[] = [];
  const titlePrefix = b.provider ? `${b.provider} ` : '';
  const name = b.title || '';
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');
  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
  const depBuffer = details.dep_buffer || 0, arrBuffer = details.arr_buffer || 0;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const pickUpStart = new Date(`1970-01-01T${b.start_time || '10:00'}:00`);
  const pickUpEnd = new Date(pickUpStart.getTime() + depBuffer * 60000);
  desiredItems.push({ date: b.start_date, start_time: b.start_time || '10:00', end_time: `${pad(pickUpEnd.getHours())}:${pad(pickUpEnd.getMinutes())}`, title: `Pick-up ${titlePrefix}${name}`.trim(), notes: notesWithOrder, image_url: rentalImage, address: b.start_location || '', matchType: 'Pick-up' });
  const returnStart = new Date(`1970-01-01T${b.end_time || '10:00'}:00`);
  const returnEnd = new Date(returnStart.getTime() + arrBuffer * 60000);
  desiredItems.push({ date: b.end_date, start_time: b.end_time || '10:00', end_time: `${pad(returnEnd.getHours())}:${pad(returnEnd.getMinutes())}`, title: `Return ${titlePrefix}${name}`.trim(), notes: notesWithOrder, image_url: rentalImage, address: b.end_location || b.start_location || '', matchType: 'Return' });
  return desiredItems;
}
