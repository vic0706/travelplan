import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { X, Calendar, Upload, Loader2, User as UserIcon, Check, CloudLightning, Plane, Bed, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { createClient } from '@supabase/supabase-js';
import { Trip, Flight, Accommodation } from '../types';
import { db } from '../db';
import { format, parseISO } from 'date-fns';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

interface TripSettingsFormProps {
  trip: Trip;
  onSuccess: () => void;
}

export function TripSettingsForm({ trip, onSuccess }: TripSettingsFormProps) {
  const { cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncingWeather, setSyncingWeather] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  
  const [flights, setFlights] = useState<Flight[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  
  const [newFlight, setNewFlight] = useState({
    date: '',
    flight_number: '',
    departure_airport: '',
    arrival_airport: '',
    departure_time: '',
    arrival_time: ''
  });
  
  const [newAcc, setNewAcc] = useState({
    name: '',
    address: '',
    check_in_date: '',
    check_out_date: '',
    notes: ''
  });

  const [formData, setFormData] = useState({
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cover_image_url: trip.cover_image_url || '',
    visible_status: trip.visible_status,
    default_city_id: trip.default_city_id ? String(trip.default_city_id) : '',
    currencies: trip.currencies || ['TWD']
  });

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, membersRes, flightsRes, accRes] = await Promise.all([
          apiFetch('/api/users'),
          apiFetch(`/api/trips/${trip.id}/members`),
          apiFetch(`/api/trips/${trip.id}/flights`),
          apiFetch(`/api/trips/${trip.id}/accommodations`)
        ]);
        
        if (usersRes.ok) setUsers(await usersRes.json() as User[]);
        if (membersRes.ok) {
          const data = await membersRes.json() as { id: number }[];
          setSelectedMembers(data.map((m) => m.id));
        }
        if (flightsRes.ok) setFlights(await flightsRes.json() as Flight[]);
        if (accRes.ok) setAccommodations(await accRes.json() as Accommodation[]);
      } catch (err) {
        console.error('Failed to fetch data', err);
      }
    };
    fetchData();
  }, [trip.id]);

  const handleAddFlight = async () => {
    if (!newFlight.flight_number || !newFlight.date) return;
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/flights`, {
        method: 'POST',
        body: JSON.stringify(newFlight)
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        const flight = { ...newFlight, id: data.id, trip_id: trip.id };
        setFlights([...flights, flight]);
        await db.flights.put(flight);
        setNewFlight({ date: '', flight_number: '', departure_airport: '', arrival_airport: '', departure_time: '', arrival_time: '' });
      }
    } catch (err) { console.error(err); }
  };

  const handleAddAcc = async () => {
    if (!newAcc.name || !newAcc.check_in_date) return;
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/accommodations`, {
        method: 'POST',
        body: JSON.stringify(newAcc)
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        const acc = { ...newAcc, id: data.id, trip_id: trip.id };
        setAccommodations([...accommodations, acc]);
        await db.accommodations.put(acc);
        setNewAcc({ name: '', address: '', check_in_date: '', check_out_date: '', notes: '' });
      }
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    if (!supabase) {
      setError('Supabase is not configured. Please check environment variables.');
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `trip-covers/${fileName}`;

    setUploading(true);
    setError('');

    try {
      const { error: uploadError } = await supabase.storage
        .from('trip-covers')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('trip-covers').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, cover_image_url: data.publicUrl }));
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleMember = (userId: number) => {
    setSelectedMembers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSyncWeather = async () => {
    setSyncingWeather(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/weather/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to sync weather');
      alert('Weather synced successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingWeather(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Update Trip
      const res = await apiFetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...formData,
          default_city_id: formData.default_city_id ? Number(formData.default_city_id) : null
        })
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to update trip');
      }

      // 2. Update Members
      await apiFetch(`/api/trips/${trip.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedMembers })
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Trip Title</label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Primary City</label>
        <select
          required
          value={formData.default_city_id}
          onChange={e => setFormData({ ...formData, default_city_id: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="" disabled>Select a city</option>
          {Object.entries(groupedCities).map(([country, countryCities]) => (
            <optgroup key={country} label={country}>
              {countryCities.map(city => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Start Date</label>
          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-3.5 text-zinc-500" />
            <input
              type="date"
              required
              value={formData.start_date}
              onChange={e => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">End Date</label>
          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-3.5 text-zinc-500" />
            <input
              type="date"
              required
              value={formData.end_date}
              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Currency</label>
        <input
          type="text"
          required
          value={formData.currencies[0] || ''}
          onChange={e => setFormData({ ...formData, currencies: [e.target.value] })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="e.g., TWD"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Members</label>
        <div className="grid grid-cols-4 gap-2">
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggleMember(u.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                selectedMembers.includes(u.id)
                  ? 'bg-orange-500/20 border-orange-500'
                  : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <UserIcon size={16} />
                    </div>
                  )}
                </div>
                {selectedMembers.includes(u.id) && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-black">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </div>
              <span className={`text-[10px] font-medium truncate w-full text-center ${selectedMembers.includes(u.id) ? 'text-white' : 'text-zinc-400'}`}>
                {u.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Plane size={16} /> Flight Details
        </h3>
        <div className="space-y-3">
          {flights.map(f => (
            <div key={f.id} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 flex justify-between items-center">
              <div>
                <div className="text-white font-medium">{f.flight_number}</div>
                <div className="text-xs text-zinc-500">{f.departure_airport} → {f.arrival_airport}</div>
              </div>
              <div className="text-xs text-zinc-400">{f.date}</div>
            </div>
          ))}
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Flight #"
                value={newFlight.flight_number}
                onChange={e => setNewFlight({...newFlight, flight_number: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              />
              <input
                type="date"
                value={newFlight.date}
                onChange={e => setNewFlight({...newFlight, date: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Dep Airport"
                value={newFlight.departure_airport}
                onChange={e => setNewFlight({...newFlight, departure_airport: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              />
              <input
                type="text"
                placeholder="Arr Airport"
                value={newFlight.arrival_airport}
                onChange={e => setNewFlight({...newFlight, arrival_airport: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={newFlight.departure_time}
                onChange={e => setNewFlight({...newFlight, departure_time: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]"
              />
              <input
                type="time"
                value={newFlight.arrival_time}
                onChange={e => setNewFlight({...newFlight, arrival_time: e.target.value})}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]"
              />
            </div>
            <button
              type="button"
              onClick={handleAddFlight}
              className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add Flight
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Bed size={16} /> Accommodation
        </h3>
        <div className="space-y-3">
          {accommodations.map(a => (
            <div key={a.id} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 flex justify-between items-center">
              <div>
                <div className="text-white font-medium">{a.name}</div>
                <div className="text-xs text-zinc-500">{a.address}</div>
              </div>
              <div className="text-xs text-zinc-400">{a.check_in_date}</div>
            </div>
          ))}
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3">
            <input
              type="text"
              placeholder="Hotel Name"
              value={newAcc.name}
              onChange={e => setNewAcc({...newAcc, name: e.target.value})}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
            <input
              type="text"
              placeholder="Address"
              value={newAcc.address}
              onChange={e => setNewAcc({...newAcc, address: e.target.value})}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase">Check In</label>
                <input
                  type="date"
                  value={newAcc.check_in_date}
                  onChange={e => setNewAcc({...newAcc, check_in_date: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase">Check Out</label>
                <input
                  type="date"
                  value={newAcc.check_out_date}
                  onChange={e => setNewAcc({...newAcc, check_out_date: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddAcc}
              className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add Accommodation
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image</label>
        <div className="space-y-3">
          {formData.cover_image_url && (
            <div className="relative h-32 w-full rounded-xl overflow-hidden border border-zinc-700">
              <img 
                src={formData.cover_image_url} 
                alt="Cover Preview" 
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setFormData({ ...formData, cover_image_url: '' })}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X size={14} />
              </button>
            </div>
          )}
          
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="cover-upload-settings"
              disabled={uploading}
            />
            <label
              htmlFor="cover-upload-settings"
              className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>Upload Image</span>
                </>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={handleSyncWeather}
          disabled={syncingWeather}
          className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2 mb-4"
        >
          {syncingWeather ? <Loader2 size={18} className="animate-spin" /> : <CloudLightning size={18} />}
          {syncingWeather ? 'Syncing Weather...' : 'Sync Weather Now'}
        </button>

        <button
          type="submit"
          disabled={loading || uploading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
