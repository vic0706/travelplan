import React, { useState, useEffect } from 'react';
import { X, Car, Calendar, MapPin, FileText, Loader2, Clock, Trash2, Image as ImageIcon, Search, Upload, Check } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { DateRangePicker } from './DateRangePicker';
import { TimePicker } from './TimePicker';
import { apiFetch } from '../utils/api';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';

import { Rental } from '../types';

interface RentalFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
  initialData?: Rental;
}

export function RentalForm({ tripId, onSuccess, onCancel, onDelete, initialData }: RentalFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    check_in_date: initialData?.check_in_date || '',
    check_out_date: initialData?.check_out_date || '',
    check_in_time: initialData?.check_in_time || '10:00',
    check_out_time: initialData?.check_out_time || '10:00',
    address: initialData?.address || '',
    notes: initialData?.notes || '',
    image_url: initialData?.image_url || ''
  });

  // Initialize search query with rental name when opening search
  useEffect(() => {
    if (showImageSearch && !searchQuery && formData.name) {
      setSearchQuery(formData.name);
      handleSearch(formData.name);
    }
  }, [showImageSearch]);

  const handleSearch = async (query: string) => {
    if (!query) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/images/search?query=${encodeURIComponent(query)}&type=rental`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data as any[]);
      }
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setSearching(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCroppingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      setShowImageSearch(false);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.check_in_date || !formData.check_out_date) {
      alert('請選擇入住與退房日期');
      return;
    }
    setLoading(true);
    try {
      const endpoint = initialData 
        ? `/api/trips/${tripId}/rentals/${initialData.id}` 
        : `/api/trips/${tripId}/rentals`;
      const method = initialData ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error(`Failed to ${initialData ? 'update' : 'add'} rental`);
      onSuccess();
    } catch (error) {
      console.error(error);
      alert(`Failed to ${initialData ? 'update' : 'add'} rental`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Test</h1>
    </div>
  );
}
