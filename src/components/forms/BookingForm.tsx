import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { X, MapPin, Loader2, Plane, Train, Ship, Car, Bed, ArrowLeft, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocationPicker } from '../pickers/LocationPicker';
import { DateRangePicker } from '../pickers/DateRangePicker';
import { BookingCategory } from '../../types';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

const BOOKING_CATEGORIES: {
  id: BookingCategory; label: string; icon: React.ElementType; description: string;
}[] = [
  { id: 'HOTEL',            label: 'Hotel',    icon: Bed,   description: '住宿與飯店' },
  { id: 'FLIGHT',           label: 'Flight',   icon: Plane, description: '機票與航班' },
  { id: 'TRAIN',            label: 'Train',    icon: Train, description: '火車與鐵路' },
  { id: 'FERRY',            label: 'Ferry',    icon: Ship,  description: '渡輪與船票' },
  { id: 'RENTAL',           label: 'Rental',   icon: Car,   description: '租車' },
  { id: 'PRIVATE_TRANSFER', label: 'Transfer', icon: Car,   description: '接送服務' },
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
  pre_start_time: string;
  daily_start_time: string;
  daily_end_time: string;
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

const Req = () => <span className="text-orange-500 ml-0.5">*</span>;

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
    {children}{required && <Req />}
  </label>
);

const inputCls = 'w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/70 transition-colors placeholder:text-zinc-600';

export function BookingForm({ initialData, onSubmit, onCancel, onDelete, loading = false }: BookingFormProps) {
  const { cities } = useAppStore();

  const [step, setStep] = useState<'pick-category' | 'fill-form'>(
    initialData ? 'fill-form' : 'pick-category'
  );

  const initDetails = typeof initialData?.details === 'string'
    ? JSON.parse(initialData?.details || '{}')
    : (initialData?.details || {});

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
    pre_start_time: initialData?.pre_start_time || '',
    daily_start_time: initialData?.daily_start_time || '08:00',
    daily_end_time: initialData?.daily_end_time || '22:00',
    start_location: initialData?.start_location || '',
    end_location: initialData?.end_location || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || '',
    details: initDetails,
    google_place_id: initialData?.google_place_id || ''
  });

  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const setDetail = (key: string, val: string) =>
    setFormData(prev => ({ ...prev, details: { ...prev.details, [key]: val } }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  const selectedCatDef = BOOKING_CATEGORIES.find(c => c.id === formData.category);
  const CatIcon = selectedCatDef?.icon || Bed;
  const isHotel = formData.category === 'HOTEL';
  const isTransport = ['FLIGHT', 'TRAIN', 'FERRY'].includes(formData.category);
  const isRental = ['RENTAL', 'PRIVATE_TRANSFER'].includes(formData.category);

  const dateRangeValue = {
    start_date: formData.start_date ? parseISO(formData.start_date) : null,
    end_date: formData.end_date ? parseISO(formData.end_date) : null,
    start_time: formData.start_time,
    end_time: formData.end_time,
    pre_start_time: formData.pre_start_time,
    daily_start_time: formData.daily_start_time,
    daily_end_time: formData.daily_end_time,
  };

  // ── STEP 1: 選擇類別 ────────────────────────────────────────────────
  if (step === 'pick-category') {
    return (
      <div className="flex flex-col h-full bg-[#1c1c1e]">
        <div className="shrink-0 px-5 border-b border-zinc-800/80 flex items-center justify-between" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))', paddingBottom: '1rem' }}>
          <h2 className="text-base font-black text-white uppercase tracking-widest">新增預訂</h2>
          <button type="button" onClick={onCancel} className="p-2 text-zinc-400 hover:text-white bg-[#242426] rounded-full transition-colors border border-zinc-800">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">選擇預訂類別</p>
          <div className="grid grid-cols-2 gap-3">
            {BOOKING_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <motion.button
                  key={cat.id} type="button" whileTap={{ scale: 0.97 }}
                  onClick={() => { setFormData(prev => ({ ...prev, category: cat.id })); setStep('fill-form'); }}
                  className="flex flex-col items-start gap-3 p-5 rounded-3xl border border-zinc-800 bg-[#242426] hover:border-orange-500/40 hover:bg-orange-500/5 transition-all text-left active:scale-97"
                >
                  <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400">
                    <Icon size={26} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">{cat.label}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{cat.description}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: 填寫表單 ─────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-[#1c1c1e]">

      {/* Sticky 頂部 */}
      <div className="shrink-0 px-5 border-b border-zinc-800/80 bg-[#1c1c1e]" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between py-3.5">
          <div className="flex items-center gap-3">
            {!initialData && (
              <button type="button" onClick={() => setStep('pick-category')}
                className="p-2 bg-[#242426] rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-800">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                <CatIcon size={18} strokeWidth={2} />
              </div>
              <span className="text-base font-black text-white">{selectedCatDef?.label}</span>
            </div>
          </div>
          <button type="button" onClick={onCancel}
            className="p-2 text-zinc-400 hover:text-white bg-[#242426] rounded-full transition-colors border border-zinc-800">
            <X size={17} />
          </button>
        </div>

        {initialData && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3.5">
            {BOOKING_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button key={cat.id} type="button"
                  onClick={() => setFormData(prev => ({ ...prev, category: cat.id }))}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap shrink-0',
                    formData.category === cat.id
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
                      : 'bg-[#242426] border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  )}>
                  <Icon size={12} />{cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 可捲動內容 */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scrollbar">

        {/* 標題 */}
        <div>
          <FieldLabel required>標題</FieldLabel>
          <input type="text" required value={formData.title}
            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className={inputCls}
            placeholder={isHotel ? '飯店名稱' : isTransport ? '航班 / 車次編號' : '預訂名稱'} />
        </div>

        {/* 服務商 + 訂單號 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>服務商</FieldLabel>
            <input type="text" value={formData.provider}
              onChange={e => setFormData(prev => ({ ...prev, provider: e.target.value }))}
              className={inputCls}
              placeholder={isHotel ? 'Hilton' : isTransport ? 'China Airlines' : '服務商'} />
          </div>
          <div>
            <FieldLabel>確認編號</FieldLabel>
            <input type="text" value={formData.order_id}
              onChange={e => setFormData(prev => ({ ...prev, order_id: e.target.value }))}
              className={inputCls} placeholder="e.g. ABC123" />
          </div>
        </div>

        {/* 日期與時間 */}
        <div>
          <FieldLabel required>日期與時間</FieldLabel>
          <DateRangePicker
            category={formData.category}
            value={dateRangeValue}
            onChange={r => setFormData(prev => ({
              ...prev,
              start_date: r.start_date ? format(r.start_date, 'yyyy-MM-dd') : '',
              end_date: r.end_date ? format(r.end_date, 'yyyy-MM-dd') : '',
              start_time: r.start_time,
              end_time: r.end_time,
              pre_start_time: r.pre_start_time || '',
              daily_start_time: r.daily_start_time || '08:00',
              daily_end_time: r.daily_end_time || '22:00',
            }))}
          />
        </div>

        {/* 城市 / 地點 */}
        <div>
          <FieldLabel>城市 / 地點</FieldLabel>
          <button type="button" onClick={() => setIsCityPickerOpen(true)}
            className={clsx(inputCls, 'flex items-center gap-3 text-left')}>
            <MapPin size={15} className="text-orange-500 shrink-0" />
            <span className={formData.city_id ? 'text-white' : 'text-zinc-600'}>
              {formData.city_id ? cities.find(c => String(c.id) === formData.city_id)?.name : '選擇城市或地點...'}
            </span>
            {formData.google_place_id && (
              <span className="ml-auto text-[10px] bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full font-bold shrink-0">Google</span>
            )}
          </button>
        </div>

        {/* 出發地 / 目的地 (交通 & 租車) */}
        {(isTransport || isRental) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>{isTransport ? '出發地' : '取車地點'}</FieldLabel>
              <input type="text" value={formData.start_location}
                onChange={e => setFormData(prev => ({ ...prev, start_location: e.target.value }))}
                className={inputCls}
                placeholder={formData.category === 'FLIGHT' ? 'TPE' : '出發地'} />
            </div>
            <div>
              <FieldLabel>{isTransport ? '目的地' : '還車地點'}</FieldLabel>
              <input type="text" value={formData.end_location}
                onChange={e => setFormData(prev => ({ ...prev, end_location: e.target.value }))}
                className={inputCls}
                placeholder={formData.category === 'FLIGHT' ? 'NRT' : '目的地'} />
            </div>
          </div>
        )}

        {/* 航廈 / 月台 (FLIGHT, TRAIN, FERRY) */}
        {isTransport && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                {formData.category === 'FLIGHT' ? '出發航廈' : formData.category === 'TRAIN' ? '出發月台' : '出發碼頭'}
              </FieldLabel>
              <input type="text" value={formData.details?.dep_terminal || ''}
                onChange={e => setDetail('dep_terminal', e.target.value)}
                className={inputCls}
                placeholder={formData.category === 'FLIGHT' ? 'Terminal 1' : formData.category === 'TRAIN' ? '第 1 月台' : '北碼頭'} />
            </div>
            <div>
              <FieldLabel>
                {formData.category === 'FLIGHT' ? '抵達航廈' : formData.category === 'TRAIN' ? '抵達月台' : '抵達碼頭'}
              </FieldLabel>
              <input type="text" value={formData.details?.arr_terminal || ''}
                onChange={e => setDetail('arr_terminal', e.target.value)}
                className={inputCls}
                placeholder={formData.category === 'FLIGHT' ? 'Terminal 2' : formData.category === 'TRAIN' ? '第 3 月台' : '南碼頭'} />
            </div>
          </div>
        )}

        {/* 地址 (HOTEL) */}
        {isHotel && (
          <div>
            <FieldLabel>飯店地址</FieldLabel>
            <input type="text" value={formData.start_location}
              onChange={e => setFormData(prev => ({ ...prev, start_location: e.target.value }))}
              className={inputCls} placeholder="飯店地址" />
          </div>
        )}

        {/* 備註 */}
        <div>
          <FieldLabel>備註</FieldLabel>
          <textarea value={formData.notes}
            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className={clsx(inputCls, 'h-20 resize-none')}
            placeholder="確認編號、特別要求..." />
        </div>

        {/* 刪除 */}
        {initialData && onDelete && (
          <div className="pt-2 border-t border-zinc-800">
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 border border-red-500/20 text-sm">
              <Trash2 size={16} />刪除預訂
            </button>
          </div>
        )}
      </div>

      {/* Sticky 底部 */}
      <div className="shrink-0 px-5 py-4 border-t border-zinc-800/80 bg-[#1c1c1e] flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-[#242426] hover:bg-zinc-800 text-white font-bold rounded-2xl px-4 py-3.5 transition-colors text-sm border border-zinc-800">
          取消
        </button>
        <button type="submit" disabled={loading}
          className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black rounded-2xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 text-sm uppercase tracking-wide">
          {loading ? <Loader2 className="animate-spin" size={18} /> : '儲存預訂'}
        </button>
      </div>

      {/* 刪除確認 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">刪除預訂？</h3>
              <p className="text-zinc-400 mb-6 text-sm">確定要刪除這筆預訂嗎？相關行程卡片也會一併刪除。</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">取消</button>
                <button type="button" onClick={() => { setShowDeleteConfirm(false); onDelete?.(); }} className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors">刪除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
