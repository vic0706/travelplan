import React, { useState, useMemo } from 'react';
import { X, MapPin, Loader2, Plane, Train, Ship, Car, Bed, Bus, ArrowLeft, Clock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationPicker } from '../pickers/LocationPicker';
import { DateRangePicker } from '../pickers/DateRangePicker';
import { AddressSearchInput } from '../inputs/AddressSearchInput';
import { BookingCategory } from '../../types';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../../store';

const BOOKING_CATEGORIES: { id: BookingCategory; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'HOTEL',            label: '住宿',      icon: Bed,   description: '飯店・民宿・旅館' },
  { id: 'FLIGHT',           label: '機票',      icon: Plane, description: '國內外航班' },
  { id: 'TRAIN',            label: '火車',      icon: Train, description: '高鐵・捷運・電車' },
  { id: 'FERRY',            label: '船票',      icon: Ship,  description: '渡輪・遊輪' },
  { id: 'RENTAL',           label: '租車',      icon: Car,   description: '自駕・租賃車輛' },
  { id: 'PRIVATE_TRANSFER', label: '接送',      icon: Car,   description: '包車・計程車' },
  { id: 'BUS',              label: '公車/巴士', icon: Bus,   description: '客運・市區公車' },
];

const getProviderLabel = (cat: BookingCategory) => {
  switch (cat) {
    case 'HOTEL':            return '訂購平台';
    case 'FLIGHT':           return '航空公司';
    case 'TRAIN':            return '車種車型';
    case 'FERRY':            return '船種船型';
    case 'BUS':              return '巴士業者';
    default:                 return '供應商';
  }
};

const getProviderPlaceholder = (cat: BookingCategory) => {
  switch (cat) {
    case 'HOTEL':            return 'Booking.com・Agoda';
    case 'FLIGHT':           return '中華航空・長榮';
    case 'TRAIN':            return '高鐵自由座・台鐵莒光';
    case 'FERRY':            return '台灣好行・麗娜輪';
    case 'BUS':              return '統聯・阿羅哈';
    default:                 return '供應商名稱';
  }
};

const getTerminalLabel = (cat: BookingCategory) => {
  if (cat === 'FLIGHT') return '航廈';
  if (cat === 'BUS')    return '站牌';
  return '月台';
};

const addMinutes = (time: string, minutes: number) => {
  if (!time || minutes === 0) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const nm = ((total % 60) + 60) % 60;
  return `${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`;
};

interface BookingFormData {
  category: BookingCategory;
  title: string;
  provider: string;
  order_id: string;
  city_id: string | number;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  start_location: string;
  end_location: string;
  notes: string;
  image_url: string;
  details: any;
  google_place_id?: string;
}

interface BookingFormProps {
  initialData?: any;
  onSubmit: (data: BookingFormData) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  loading?: boolean;
}

const timeInput = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
      <span>{label}</span>
      {hint && <span className="text-[9px] text-orange-400 font-black normal-case">{hint}</span>}
    </label>
    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 gap-2 focus-within:border-orange-500 transition-colors">
      <Clock size={14} className="text-orange-500 shrink-0" />
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
    </div>
  </div>
);

export function BookingForm({ initialData, onSubmit, onCancel, onDelete, loading = false }: BookingFormProps) {
  const { cities } = useAppStore();
  const [step, setStep] = useState<'pick-category' | 'fill-form'>(initialData ? 'fill-form' : 'pick-category');

  const parseDetails = (d: any) => {
    if (!d) return {};
    if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
    return d;
  };

  const initialDetails = parseDetails(initialData?.details);

  const [formData, setFormData] = useState<BookingFormData>({
    category: initialData?.category || 'HOTEL',
    title: initialData?.title || '',
    provider: initialData?.provider || '',
    order_id: initialData?.order_id || '',
    city_id: initialData?.city_id ? String(initialData.city_id) : '',
    start_date: initialData?.start_date || '',
    start_time: initialData?.start_time || ((!initialData || initialData.category === 'HOTEL') ? '16:00' : ''),
    end_date: initialData?.end_date || '',
    end_time: initialData?.end_time || ((!initialData || initialData.category === 'HOTEL') ? '11:00' : ''),
    start_location: initialData?.start_location || '',
    end_location: initialData?.end_location || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    details: initialDetails,
    google_place_id: initialData?.google_place_id || '',
  });

  // Hotel specific
  const [checkInStay,     setCheckInStay]     = useState<number>(initialDetails.check_in_stay    ?? 30);
  const [checkOutStay,    setCheckOutStay]     = useState<number>(initialDetails.check_out_stay   ?? 30);
  const [dailyDepartStay, setDailyDepartStay] = useState<number>(initialDetails.daily_depart_stay ?? 30);
  const [dailyReturnStay, setDailyReturnStay] = useState<number>(initialDetails.daily_return_stay ?? 30);
  const [dailyDepartTime, setDailyDepartTime] = useState<string>(initialDetails.daily_start_time || '09:00');
  const [dailyReturnTime, setDailyReturnTime] = useState<string>(initialDetails.daily_end_time   || '22:00');

  // Transport specific
  const [depBuffer,    setDepBuffer]    = useState<number>(initialDetails.dep_buffer  ?? 60);
  const [arrStay,      setArrStay]      = useState<number>(initialDetails.arr_stay    ?? 30);
  const [depTerminal,  setDepTerminal]  = useState<string>(initialDetails.dep_terminal || '');
  const [arrTerminal,  setArrTerminal]  = useState<string>(initialDetails.arr_terminal || '');
  const [checkInTime,  setCheckInTime]  = useState<string>(initialDetails.check_in_time || '');

  // Rental / Transfer specific
  const [rentalPickupBuffer, setRentalPickupBuffer] = useState<number>(initialDetails.pickup_buffer ?? 30);
  const [rentalReturnBuffer, setRentalReturnBuffer] = useState<number>(initialDetails.return_buffer ?? 15);

  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);

  const groupedCities = useMemo(() => cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>), [cities]);

  const set = (key: keyof BookingFormData, val: any) => setFormData(prev => ({ ...prev, [key]: val }));

  // Computed time hints
  const hotelCheckInCalc  = addMinutes(formData.start_time, checkInStay);
  const hotelCheckOutCalc = addMinutes(formData.end_time,   checkOutStay);
  const transportArrCalc  = addMinutes(formData.end_time,   arrStay);

  const handleDepTimeChange = (v: string) => {
    set('start_time', v);
    if (v && depBuffer > 0) {
      const [h, m] = v.split(':').map(Number);
      const total = h * 60 + m - depBuffer;
      const nh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
      const nm = ((total % 60) + 60) % 60;
      setCheckInTime(`${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`);
    }
  };

  const handleDepBufferChange = (v: number) => {
    setDepBuffer(v);
    if (formData.start_time && v > 0) {
      const [h, m] = formData.start_time.split(':').map(Number);
      const total = h * 60 + m - v;
      const nh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
      const nm = ((total % 60) + 60) % 60;
      setCheckInTime(`${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`);
    }
  };

  const buildDetails = () => {
    const cat = formData.category;
    if (cat === 'HOTEL') {
      return {
        check_in_stay:    checkInStay,
        check_out_stay:   checkOutStay,
        daily_start_time: dailyDepartTime,
        daily_end_time:   dailyReturnTime,
        daily_depart_stay: dailyDepartStay,
        daily_return_stay: dailyReturnStay,
      };
    }
    if (['FLIGHT','TRAIN','FERRY','BUS'].includes(cat)) {
      return {
        dep_buffer:    depBuffer,
        arr_stay:      arrStay,
        dep_terminal:  depTerminal,
        arr_terminal:  arrTerminal,
        check_in_time: checkInTime,
      };
    }
    if (['RENTAL','PRIVATE_TRANSFER'].includes(cat)) {
      return {
        pickup_buffer: rentalPickupBuffer,
        return_buffer: rentalReturnBuffer,
      };
    }
    return formData.details || {};
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, details: buildDetails() });
  };

  const parsedStartDate = formData.start_date ? parseISO(formData.start_date) : null;
  const parsedEndDate   = formData.end_date   ? parseISO(formData.end_date)   : null;

  const isTransport         = ['FLIGHT','TRAIN','FERRY','BUS'].includes(formData.category);
  const isFlightTrainFerry  = ['FLIGHT','TRAIN','FERRY'].includes(formData.category);
  const isBus               = formData.category === 'BUS';
  const isRentalOrTransfer  = ['RENTAL','PRIVATE_TRANSFER'].includes(formData.category);
  const terminalLabel       = getTerminalLabel(formData.category);

  const calcFlightDuration = useMemo(() => {
    if (!formData.start_time || !formData.end_time) return null;
    const [sh, sm] = formData.start_time.split(':').map(Number);
    const [eh, em] = formData.end_time.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時`;
    return `${h}時${m}分`;
  }, [formData.start_time, formData.end_time]);

  // ══ STEP 1: 選擇類別 ══
  if (step === 'pick-category') {
    return (
      <div className="bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">新增訂票</h2>
          <button type="button" onClick={onCancel} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <div className="px-6 py-5">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">選擇類型</p>
          <div className="grid grid-cols-2 gap-3">
            {BOOKING_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <motion.button key={cat.id} type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { setFormData(prev => ({ ...prev, category: cat.id })); setStep('fill-form'); }}
                  className="flex flex-col items-start gap-3 p-4 rounded-3xl border-2 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/40 transition-all text-left">
                  <div className="p-2 rounded-2xl bg-orange-500/10 text-orange-400">
                    <Icon size={24} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">{cat.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{cat.description}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ══ STEP 2: 填寫表單 ══
  const selectedCat = BOOKING_CATEGORIES.find(c => c.id === formData.category)!;
  const Icon = selectedCat.icon;

  return (
    <div className="bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

      {/* 固定標頭 */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!initialData && (
            <button type="button" onClick={() => setStep('pick-category')}
              className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
          )}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400"><Icon size={18} strokeWidth={2} /></div>
            <span className="text-base font-black text-white">{selectedCat.label}</span>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="p-2 text-zinc-400 hover:text-white transition-colors"><X size={20} /></button>
      </div>

      {/* 可滑動內容 */}
      <form id="booking-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-6 py-5 space-y-5">

      {/* 類別切換（編輯模式） */}
      {initialData && (
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">類型</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {BOOKING_CATEGORIES.map(cat => {
              const CatIcon = cat.icon;
              return (
                <button key={cat.id} type="button"
                  onClick={() => setFormData(prev => ({ ...prev, category: cat.id }))}
                  className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap shrink-0',
                    formData.category === cat.id
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  )}>
                  <CatIcon size={13} />{cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 名稱 */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">名稱 *</label>
        <input type="text" required value={formData.title} onChange={e => set('title', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
          placeholder={
            formData.category === 'HOTEL'  ? '飯店名稱' :
            formData.category === 'FLIGHT' ? '如：CI100' :
            formData.category === 'TRAIN'  ? '如：高鐵0201' :
            formData.category === 'BUS'    ? '如：統聯 12:00 台北→台中' :
            '訂票名稱'
          } />
      </div>

      {/* 訂購平台/航空公司/車種 + 訂單號 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
            {getProviderLabel(formData.category)}
          </label>
          <input type="text" value={formData.provider} onChange={e => set('provider', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
            placeholder={getProviderPlaceholder(formData.category)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">訂單號</label>
          <input type="text" value={formData.order_id} onChange={e => set('order_id', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
            placeholder="ABC123" />
        </div>
      </div>

      {/* 城市 */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">城市</label>
        <button type="button" onClick={() => setIsCityPickerOpen(true)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3 text-zinc-400 hover:border-zinc-600 transition-colors">
          <MapPin size={16} className="text-orange-500 shrink-0" />
          <span className={formData.city_id ? 'text-white' : 'text-zinc-600'}>
            {formData.city_id ? cities.find(c => String(c.id) === formData.city_id)?.name : '選擇城市...'}
          </span>
        </button>
      </div>

      {/* 出發地 / 目的地（交通） */}
      {isTransport && (
        <div className="grid grid-cols-2 gap-3">
          {formData.category === 'FLIGHT' ? (
            <>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">出發地</label>
                <input type="text" value={formData.start_location} onChange={e => set('start_location', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
                  placeholder="TPE" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">目的地</label>
                <input type="text" value={formData.end_location} onChange={e => set('end_location', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
                  placeholder="NRT" />
              </div>
            </>
          ) : (
            <>
              <AddressSearchInput
                label="出發地"
                value={formData.start_location}
                onChange={v => set('start_location', v)}
                onPlaceSelect={place => set('start_location', place.address)}
                placeholder="搜尋出發站..."
              />
              <AddressSearchInput
                label="目的地"
                value={formData.end_location}
                onChange={v => set('end_location', v)}
                onPlaceSelect={place => set('end_location', place.address)}
                placeholder="搜尋目的站..."
              />
            </>
          )}
        </div>
      )}

      {/* 飯店地址（Google Places 自動補全） */}
      {formData.category === 'HOTEL' && (
        <AddressSearchInput
          label="地址"
          value={formData.start_location}
          onChange={v => set('start_location', v)}
          onPlaceSelect={place => {
            setFormData(prev => ({
              ...prev,
              start_location:  place.address,
              google_place_id: place.google_place_id || prev.google_place_id,
              title:           prev.title || place.name || prev.title,
              image_url:       prev.image_url || place.image_url || '',
            }));
          }}
          placeholder="搜尋飯店或地址..."
        />
      )}

      {/* 日期範圍 */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
          {formData.category === 'HOTEL' ? '入住 → 退房日期' : '出發 → 抵達日期'}
        </label>
        <DateRangePicker
          category={formData.category}
          hideTime={true}
          value={{
            start_date: parsedStartDate,
            end_date:   parsedEndDate,
            start_time: formData.start_time,
            end_time:   formData.end_time,
          }}
          onChange={r => {
            setFormData(prev => ({
              ...prev,
              start_date: r.start_date ? format(r.start_date, 'yyyy-MM-dd') : '',
              end_date:   r.end_date   ? format(r.end_date,   'yyyy-MM-dd') : '',
            }));
          }}
        />
      </div>

      {/* ─── 住宿時間設定 ─── */}
      {formData.category === 'HOTEL' && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">住宿時間設定</p>

          {/* 入住 inline */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">入住</p>
              {hotelCheckInCalc && <span className="text-[9px] font-black text-orange-400">完成約 {hotelCheckInCalc}</span>}
            </div>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.start_time} onChange={e => set('start_time', e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">辦理</span>
              <input type="range" min="0" max="120" step="5" value={checkInStay}
                onChange={e => setCheckInStay(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{checkInStay}分</span>
            </div>
          </div>

          {/* 退房 inline */}
          <div className="space-y-1.5 border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">退房</p>
              {hotelCheckOutCalc && <span className="text-[9px] font-black text-orange-400">完成約 {hotelCheckOutCalc}</span>}
            </div>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.end_time} onChange={e => set('end_time', e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">辦理</span>
              <input type="range" min="0" max="120" step="5" value={checkOutStay}
                onChange={e => setCheckOutStay(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{checkOutStay}分</span>
            </div>
          </div>

          {/* 每日出門 / 返回 - 比照入住退房設計 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">每日出門／返回時間</p>
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-600">出門</p>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
                <Clock size={13} className="text-orange-500 shrink-0" />
                <input type="time" value={dailyDepartTime} onChange={e => setDailyDepartTime(e.target.value)}
                  className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
                <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
                <span className="text-[9px] text-zinc-600 shrink-0">準備</span>
                <input type="range" min="0" max="60" step="5" value={dailyDepartStay}
                  onChange={e => setDailyDepartStay(parseInt(e.target.value))}
                  className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{dailyDepartStay}分</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-600">返回</p>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
                <Clock size={13} className="text-orange-500 shrink-0" />
                <input type="time" value={dailyReturnTime} onChange={e => setDailyReturnTime(e.target.value)}
                  className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
                <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
                <span className="text-[9px] text-zinc-600 shrink-0">安頓</span>
                <input type="range" min="0" max="60" step="5" value={dailyReturnStay}
                  onChange={e => setDailyReturnStay(parseInt(e.target.value))}
                  className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{dailyReturnStay}分</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 機票/火車/船票：出發抵達時間 + 置中航行時長 ─── */}
      {isFlightTrainFerry && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">交通時間設定</p>

          {/* 出發 | 行程時長 | 抵達 */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">出發</label>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 gap-2 focus-within:border-orange-500 transition-colors">
                <Clock size={14} className="text-orange-500 shrink-0" />
                <input type="time" value={formData.start_time} onChange={e => handleDepTimeChange(e.target.value)}
                  className="flex-1 bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              </div>
            </div>

            <div className="flex flex-col items-center pb-1.5 px-1 min-w-[52px]">
              {calcFlightDuration ? (
                <>
                  <span className="text-[8px] text-zinc-600 uppercase tracking-wider leading-none">
                    {formData.category === 'FLIGHT' ? '飛行' : formData.category === 'TRAIN' ? '行駛' : '航行'}
                  </span>
                  <span className="text-[11px] font-black text-orange-400 mt-1">{calcFlightDuration}</span>
                  <ArrowRight size={12} className="text-zinc-600 mt-1" />
                </>
              ) : (
                <ArrowRight size={16} className="text-zinc-700 mt-3" />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right block">抵達</label>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 gap-2 focus-within:border-orange-500 transition-colors">
                <Clock size={14} className="text-orange-500 shrink-0" />
                <input type="time" value={formData.end_time} onChange={e => set('end_time', e.target.value)}
                  className="flex-1 bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              </div>
            </div>
          </div>

          {/* 報到與緩衝時間 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            {timeInput('報到時間（可手動覆蓋）', checkInTime, setCheckInTime)}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">提前報到</label>
                  <span className="text-[9px] font-black text-orange-400">{depBuffer}分</span>
                </div>
                <input type="range" min="0" max="240" step="5" value={depBuffer}
                  onChange={e => handleDepBufferChange(parseInt(e.target.value))}
                  className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">抵達停留</label>
                  <span className="text-[9px] font-black text-orange-400">{arrStay}分</span>
                </div>
                <input type="range" min="0" max="180" step="5" value={arrStay}
                  onChange={e => setArrStay(parseInt(e.target.value))}
                  className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                {transportArrCalc && <p className="text-[9px] text-zinc-600 mt-0.5">離開約 {transportArrCalc}</p>}
              </div>
            </div>
          </div>

          {/* 航廈 / 月台 */}
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">出發{terminalLabel}</label>
              <input type="text" value={depTerminal} onChange={e => setDepTerminal(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                placeholder={formData.category === 'FLIGHT' ? 'T1' : '1號月台'} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">抵達{terminalLabel}</label>
              <input type="text" value={arrTerminal} onChange={e => setArrTerminal(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                placeholder={formData.category === 'FLIGHT' ? 'T2' : '3號月台'} />
            </div>
          </div>
        </div>
      )}

      {/* ─── 公車：時間 + duration 在同一行 ─── */}
      {isBus && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">交通時間設定</p>

          {/* 出發 inline */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">出發時間</label>
              {checkInTime && <span className="text-[9px] font-black text-orange-400 normal-case">報到 {checkInTime}</span>}
            </div>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.start_time} onChange={e => handleDepTimeChange(e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">提前</span>
              <input type="range" min="0" max="120" step="5" value={depBuffer}
                onChange={e => handleDepBufferChange(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{depBuffer}分</span>
            </div>
          </div>

          {/* 抵達 inline */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">抵達時間</label>
              {transportArrCalc && <span className="text-[9px] font-black text-orange-400 normal-case">離開約 {transportArrCalc}</span>}
            </div>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.end_time} onChange={e => set('end_time', e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">停留</span>
              <input type="range" min="0" max="180" step="5" value={arrStay}
                onChange={e => setArrStay(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{arrStay}分</span>
            </div>
          </div>

          {/* 站牌 */}
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">出發{terminalLabel}</label>
              <input type="text" value={depTerminal} onChange={e => setDepTerminal(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="台北轉運站" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">抵達{terminalLabel}</label>
              <input type="text" value={arrTerminal} onChange={e => setArrTerminal(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="台中總站" />
            </div>
          </div>
        </div>
      )}

      {/* ─── 租車 / 接送時間 ─── */}
      {isRentalOrTransfer && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">時間設定</p>

          {/* 取車/出發 inline */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {formData.category === 'RENTAL' ? '取車時間' : '出發時間'}
            </label>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.start_time} onChange={e => set('start_time', e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">等候</span>
              <input type="range" min="0" max="90" step="5" value={rentalPickupBuffer}
                onChange={e => setRentalPickupBuffer(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{rentalPickupBuffer}分</span>
            </div>
          </div>

          {/* 還車/抵達 inline */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {formData.category === 'RENTAL' ? '還車時間' : '抵達時間'}
            </label>
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 gap-2 focus-within:border-orange-500 transition-colors">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <input type="time" value={formData.end_time} onChange={e => set('end_time', e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
              <div className="w-px h-4 bg-zinc-700 shrink-0 mx-1" />
              <span className="text-[9px] text-zinc-600 shrink-0">{formData.category === 'RENTAL' ? '手續' : '等候'}</span>
              <input type="range" min="0" max="60" step="5" value={rentalReturnBuffer}
                onChange={e => setRentalReturnBuffer(parseInt(e.target.value))}
                className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
              <span className="text-[10px] font-black text-orange-400 shrink-0 w-7 text-right">{rentalReturnBuffer}分</span>
            </div>
          </div>

          {/* 地點（Google Places 自動補全） */}
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
            <AddressSearchInput
              label={formData.category === 'RENTAL' ? '取車地點' : '出發地點'}
              value={formData.start_location}
              onChange={v => set('start_location', v)}
              onPlaceSelect={place => set('start_location', place.address)}
              placeholder={formData.category === 'RENTAL' ? '搜尋取車地點...' : '搜尋出發地...'}
            />
            <AddressSearchInput
              label={formData.category === 'RENTAL' ? '還車地點' : '目的地點'}
              value={formData.end_location}
              onChange={v => set('end_location', v)}
              onPlaceSelect={place => set('end_location', place.address)}
              placeholder={formData.category === 'RENTAL' ? '搜尋還車地點...' : '搜尋目的地...'}
            />
          </div>
        </div>
      )}

      {/* 備註 */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">備註</label>
        <textarea value={formData.notes} onChange={e => set('notes', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors h-20 resize-none text-sm"
          placeholder="確認號碼、特殊需求..." />
      </div>

      <LocationPicker
        isOpen={isCityPickerOpen}
        onClose={() => setIsCityPickerOpen(false)}
        onSelect={res => setFormData(prev => ({
          ...prev,
          city_id:        res.id ? String(res.id) : prev.city_id,
          title:          res.google_place_id ? res.name : prev.title,
          start_location: res.address || prev.start_location,
          google_place_id: res.google_place_id || '',
        }))}
        groupedCities={groupedCities}
      />
      </div>
    </form>

    {/* 固定底部 */}
    <div className="shrink-0 px-6 pt-4 pb-5 border-t border-zinc-800 space-y-3">
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">取消</button>
        <button form="booking-form" type="submit" disabled={loading}
          className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
          {loading ? <Loader2 className="animate-spin" size={20} /> : '儲存訂票'}
        </button>
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete}
          className="w-full py-3 text-red-500 bg-red-500/10 hover:bg-red-500/20 font-bold rounded-xl transition-colors border border-red-500/20">
          刪除訂票
        </button>
      )}
    </div>
  </div>
  );
}
