import React, { useState, useMemo } from 'react';
import { X, MapPin, Loader2, Plane, Train, Ship, Car, Bed, ArrowLeft, Clock, Calendar, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocationPicker } from '../pickers/LocationPicker';
import { DateRangePicker } from '../pickers/DateRangePicker';
import { BookingCategory } from '../../types';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../../store';

const BOOKING_CATEGORIES: { id: BookingCategory; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'HOTEL',            label: '住宿',    icon: Bed,   description: '飯店・民宿・旅館' },
  { id: 'FLIGHT',           label: '機票',    icon: Plane, description: '國內外航班' },
  { id: 'TRAIN',            label: '火車',    icon: Train, description: '高鐵・捷運・電車' },
  { id: 'FERRY',            label: '船票',    icon: Ship,  description: '渡輪・遊輪' },
  { id: 'RENTAL',           label: '租車',    icon: Car,   description: '自駕・租賃車輛' },
  { id: 'PRIVATE_TRANSFER', label: '接送',    icon: Car,   description: '包車・計程車' },
];

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
  loading?: boolean;
}

const timeInput = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
      <span>{label}</span>
      {hint && <span className="text-[9px] text-orange-400 font-normal normal-case">{hint}</span>}
    </label>
    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 gap-2 focus-within:border-orange-500 transition-colors">
      <Clock size={14} className="text-orange-500 shrink-0" />
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent text-white font-mono font-bold text-sm outline-none [color-scheme:dark]" />
    </div>
  </div>
);

const durationSlider = (label: string, value: number, onChange: (v: number) => void, max = 240, hint?: string) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</label>
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
        <span className="text-xs font-black text-orange-500">{value}</span>
        <span className="text-[10px] text-zinc-500">分</span>
      </div>
    </div>
    <input type="range" min="0" max={max} step="5" value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      className="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
    {hint && <p className="text-[9px] text-zinc-500">{hint}</p>}
  </div>
);

export function BookingForm({ initialData, onSubmit, onCancel, loading = false }: BookingFormProps) {
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
    start_time: initialData?.start_time || '',
    end_date: initialData?.end_date || '',
    end_time: initialData?.end_time || '',
    start_location: initialData?.start_location || '',
    end_location: initialData?.end_location || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    details: initialDetails,
    google_place_id: initialData?.google_place_id || ''
  });

  // Hotel specific
  const [checkInStay, setCheckInStay] = useState<number>(initialDetails.check_in_stay ?? 30);
  const [checkOutStay, setCheckOutStay] = useState<number>(initialDetails.check_out_stay ?? 30);
  const [dailyDepartStay, setDailyDepartStay] = useState<number>(initialDetails.daily_depart_stay ?? 30);
  const [dailyReturnStay, setDailyReturnStay] = useState<number>(initialDetails.daily_return_stay ?? 30);
  const [dailyDepartTime, setDailyDepartTime] = useState<string>(initialDetails.daily_start_time || '09:00');
  const [dailyReturnTime, setDailyReturnTime] = useState<string>(initialDetails.daily_end_time || '22:00');

  // Transport specific
  const [depBuffer, setDepBuffer] = useState<number>(initialDetails.dep_buffer ?? 60);
  const [arrStay, setArrStay] = useState<number>(initialDetails.arr_stay ?? 30);
  const [depTerminal, setDepTerminal] = useState<string>(initialDetails.dep_terminal || '');
  const [arrTerminal, setArrTerminal] = useState<string>(initialDetails.arr_terminal || '');
  const [checkInTime, setCheckInTime] = useState<string>(initialDetails.check_in_time || '');

  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);

  const groupedCities = useMemo(() => cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>), [cities]);

  const set = (key: keyof BookingFormData, val: any) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleDateRange = (range: any) => {
    setFormData(prev => ({
      ...prev,
      start_date: range.start_date ? format(range.start_date, 'yyyy-MM-dd') : '',
      end_date: range.end_date ? format(range.end_date, 'yyyy-MM-dd') : '',
      start_time: range.start_time || prev.start_time,
      end_time: range.end_time || prev.end_time,
    }));
  };

  // 出發時間改變時，根據 depBuffer 自動計算報到時間
  const handleDepTimeChange = (v: string) => {
    set('start_time', v);
    if (v && depBuffer > 0) {
      const [h, m] = v.split(':').map(Number);
      const total = h * 60 + m - depBuffer;
      const nh = Math.floor(((total % 1440) + 1440) / 60) % 24;
      const nm = ((total % 60) + 60) % 60;
      setCheckInTime(`${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`);
    }
  };

  const handleDepBufferChange = (v: number) => {
    setDepBuffer(v);
    if (formData.start_time && v > 0) {
      const [h, m] = formData.start_time.split(':').map(Number);
      const total = h * 60 + m - v;
      const nh = Math.floor(((total % 1440) + 1440) / 60) % 24;
      const nm = ((total % 60) + 60) % 60;
      setCheckInTime(`${nh.toString().padStart(2,'0')}:${nm.toString().padStart(2,'0')}`);
    }
  };

  const buildDetails = () => {
    const cat = formData.category;
    if (cat === 'HOTEL') {
      return {
        check_in_stay: checkInStay,
        check_out_stay: checkOutStay,
        daily_start_time: dailyDepartTime,
        daily_end_time: dailyReturnTime,
        daily_depart_stay: dailyDepartStay,
        daily_return_stay: dailyReturnStay,
      };
    }
    if (['FLIGHT','TRAIN','FERRY'].includes(cat)) {
      return {
        dep_buffer: depBuffer,
        arr_stay: arrStay,
        dep_terminal: depTerminal,
        arr_terminal: arrTerminal,
        check_in_time: checkInTime,
      };
    }
    return formData.details || {};
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, details: buildDetails() });
  };

  const parsedStartDate = formData.start_date ? parseISO(formData.start_date) : null;
  const parsedEndDate = formData.end_date ? parseISO(formData.end_date) : null;

  const isTransport = ['FLIGHT','TRAIN','FERRY'].includes(formData.category);
  const isRentalOrTransfer = ['RENTAL','PRIVATE_TRANSFER'].includes(formData.category);

  // ══ STEP 1: 選擇類別 ══
  if (step === 'pick-category') {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white">新增訂票</h2>
          <button type="button" onClick={onCancel} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">選擇類型</p>
        <div className="grid grid-cols-2 gap-3">
          {BOOKING_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <motion.button key={cat.id} type="button" whileTap={{ scale: 0.97 }}
                onClick={() => { setFormData(prev => ({ ...prev, category: cat.id })); setStep('fill-form'); }}
                className="flex flex-col items-start gap-3 p-5 rounded-3xl border-2 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/40 transition-all text-left">
                <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400">
                  <Icon size={28} strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-base font-black text-white">{cat.label}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{cat.description}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  // ══ STEP 2: 填寫表單 ══
  const selectedCat = BOOKING_CATEGORIES.find(c => c.id === formData.category)!;
  const Icon = selectedCat.icon;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* 標頭 */}
      <div className="flex items-center justify-between">
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

      {/* 類別切換（編輯模式） */}
      {initialData && (
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">類型</label>
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
        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">名稱 *</label>
        <input type="text" required value={formData.title} onChange={e => set('title', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
          placeholder={formData.category === 'HOTEL' ? '飯店名稱' : formData.category === 'FLIGHT' ? '如：CI100' : '訂票名稱'} />
      </div>

      {/* 供應商 + 訂單號 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">供應商</label>
          <input type="text" value={formData.provider} onChange={e => set('provider', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder={formData.category === 'FLIGHT' ? '中華航空' : '供應商'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">訂單號</label>
          <input type="text" value={formData.order_id} onChange={e => set('order_id', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="ABC123" />
        </div>
      </div>

      {/* 城市 */}
      <div>
        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">城市</label>
        <button type="button" onClick={() => setIsCityPickerOpen(true)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between text-zinc-400 hover:border-zinc-600 transition-colors">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-orange-500" />
            <span className={formData.city_id ? 'text-white' : ''}>
              {formData.city_id ? cities.find(c => String(c.id) === formData.city_id)?.name : '選擇城市...'}
            </span>
          </div>
        </button>
      </div>

      {/* 出發地 / 目的地（交通類型） */}
      {isTransport && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">出發地</label>
            <input type="text" value={formData.start_location} onChange={e => set('start_location', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
              placeholder={formData.category === 'FLIGHT' ? 'TPE' : '出發地'} />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">目的地</label>
            <input type="text" value={formData.end_location} onChange={e => set('end_location', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors text-sm"
              placeholder={formData.category === 'FLIGHT' ? 'NRT' : '目的地'} />
          </div>
        </div>
      )}

      {/* 飯店地址 */}
      {formData.category === 'HOTEL' && (
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">地址</label>
          <input type="text" value={formData.start_location} onChange={e => set('start_location', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="飯店地址" />
        </div>
      )}

      {/* ─── 日期範圍選擇器 ─── */}
      <div>
        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
          {formData.category === 'HOTEL' ? '入住 → 退房日期' : '出發 → 抵達日期'}
        </label>
        <DateRangePicker
          category={formData.category}
          hideTime={true}
          value={{
            start_date: parsedStartDate,
            end_date: parsedEndDate,
            start_time: formData.start_time,
            end_time: formData.end_time,
          }}
          onChange={r => {
            setFormData(prev => ({
              ...prev,
              start_date: r.start_date ? format(r.start_date, 'yyyy-MM-dd') : '',
              end_date: r.end_date ? format(r.end_date, 'yyyy-MM-dd') : '',
            }));
          }}
        />
      </div>

      {/* ─── 飯店時間區塊 ─── */}
      {formData.category === 'HOTEL' && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">住宿時間設定</p>

          {/* 入住 */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">入住</p>
            <div className="grid grid-cols-2 gap-3">
              {timeInput('入住時間', formData.start_time, v => set('start_time', v))}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">入住程序時間</label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="120" step="5" value={checkInStay}
                    onChange={e => setCheckInStay(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <span className="text-xs font-black text-orange-500 w-12 text-right">{checkInStay}分</span>
                </div>
              </div>
            </div>
          </div>

          {/* 退房 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">退房</p>
            <div className="grid grid-cols-2 gap-3">
              {timeInput('退房時間', formData.end_time, v => set('end_time', v))}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">退房程序時間</label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="120" step="5" value={checkOutStay}
                    onChange={e => setCheckOutStay(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <span className="text-xs font-black text-orange-500 w-12 text-right">{checkOutStay}分</span>
                </div>
              </div>
            </div>
          </div>

          {/* 每日時間 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">每日出門／回來時間</p>
            <div className="grid grid-cols-2 gap-3">
              {timeInput('出門時間', dailyDepartTime, setDailyDepartTime)}
              {timeInput('回來時間', dailyReturnTime, setDailyReturnTime)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">出門準備時間</label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="60" step="5" value={dailyDepartStay}
                    onChange={e => setDailyDepartStay(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <span className="text-xs font-black text-orange-500 w-10 text-right">{dailyDepartStay}分</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">回來安頓時間</label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="60" step="5" value={dailyReturnStay}
                    onChange={e => setDailyReturnStay(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                  <span className="text-xs font-black text-orange-500 w-10 text-right">{dailyReturnStay}分</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 機票/火車/船票時間區塊 ─── */}
      {isTransport && (
        <div className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">交通時間設定</p>

          {/* 出發 */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {timeInput('出發時間', formData.start_time, handleDepTimeChange)}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  報到提前時間 <span className="text-orange-400 font-normal normal-case">({depBuffer}分)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="240" step="5" value={depBuffer}
                    onChange={e => handleDepBufferChange(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                </div>
                {checkInTime && (
                  <p className="text-[9px] text-orange-400">報到時間：{checkInTime}</p>
                )}
              </div>
            </div>
            {timeInput('報到時間（可手動覆蓋）', checkInTime, setCheckInTime)}
          </div>

          {/* 抵達 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <div className="grid grid-cols-2 gap-3">
              {timeInput('抵達時間', formData.end_time, v => set('end_time', v))}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  抵達停留 <span className="text-orange-400 font-normal normal-case">({arrStay}分)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="180" step="5" value={arrStay}
                    onChange={e => setArrStay(parseInt(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* 航廈/站台 */}
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">出發{formData.category === 'FLIGHT' ? '航廈' : '月台'}</label>
                <input type="text" value={depTerminal} onChange={e => setDepTerminal(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder={formData.category === 'FLIGHT' ? 'T1' : '1號月台'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">抵達{formData.category === 'FLIGHT' ? '航廈' : '月台'}</label>
                <input type="text" value={arrTerminal} onChange={e => setArrTerminal(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder={formData.category === 'FLIGHT' ? 'T2' : '3號月台'} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 租車/接送時間 ─── */}
      {isRentalOrTransfer && (
        <div className="space-y-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-black text-orange-500 uppercase tracking-widest">時間設定</p>
          <div className="grid grid-cols-2 gap-3">
            {timeInput(formData.category === 'RENTAL' ? '取車時間' : '出發時間', formData.start_time, v => set('start_time', v))}
            {timeInput(formData.category === 'RENTAL' ? '還車時間' : '抵達時間', formData.end_time, v => set('end_time', v))}
          </div>
          {isRentalOrTransfer && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">取車地點</label>
                <input type="text" value={formData.start_location} onChange={e => set('start_location', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="取車地點" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">還車地點</label>
                <input type="text" value={formData.end_location} onChange={e => set('end_location', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  placeholder="還車地點" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 備註 */}
      <div>
        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">備註</label>
        <textarea value={formData.notes} onChange={e => set('notes', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors h-20 resize-none text-sm"
          placeholder="確認號碼、特殊需求..." />
      </div>

      {/* 送出 */}
      <div className="flex gap-3 pt-2 border-t border-zinc-800">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">取消</button>
        <button type="submit" disabled={loading}
          className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
          {loading ? <Loader2 className="animate-spin" size={20} /> : '儲存訂票'}
        </button>
      </div>

      <LocationPicker
        isOpen={isCityPickerOpen}
        onClose={() => setIsCityPickerOpen(false)}
        onSelect={res => setFormData(prev => ({
          ...prev,
          city_id: res.id ? String(res.id) : prev.city_id,
          title: res.google_place_id ? res.name : prev.title,
          start_location: res.address || prev.start_location,
          google_place_id: res.google_place_id || ''
        }))}
        groupedCities={groupedCities}
      />
    </form>
  );
}
