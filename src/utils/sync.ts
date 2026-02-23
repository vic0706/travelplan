import { db, SyncOperation } from '../db';
import { getApiUrl } from './api';

export async function addToSyncQueue(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: any) {
  await db.syncQueue.add({
    url,
    method,
    body,
    createdAt: Date.now()
  });
  
  // Try to sync immediately if online
  if (navigator.onLine) {
    processSyncQueue();
  }
}

let isSyncing = false;

export async function processSyncQueue() {
  if (isSyncing || !navigator.onLine) return;
  
  isSyncing = true;
  try {
    const queue = await db.syncQueue.orderBy('createdAt').toArray();
    
    for (const op of queue) {
      try {
        const res = await fetch(getApiUrl(op.url), {
          method: op.method,
          headers: {
            'Content-Type': 'application/json',
            // Add authorization header if needed, assuming cookies or local storage token
            'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`
          },
          body: op.body ? JSON.stringify(op.body) : undefined
        });

        if (res.ok) {
          // Successfully synced, remove from queue
          await db.syncQueue.delete(op.id!);
        } else {
          console.error('Sync failed for operation:', op, 'Status:', res.status);
          // Depending on error (e.g., 401, 400), we might want to keep it in queue or discard it
          // For now, we keep it in queue to retry later unless it's a permanent error
          if (res.status >= 400 && res.status < 500 && res.status !== 401) {
             // Client error (e.g., validation failed), maybe discard to avoid infinite loop
             await db.syncQueue.delete(op.id!);
          }
        }
      } catch (error) {
        console.error('Network error during sync:', error);
        // Stop processing queue on network error, wait for next online event
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}

// Listen for online event to trigger sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network is back online. Processing sync queue...');
    processSyncQueue();
  });
}
