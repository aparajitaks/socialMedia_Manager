'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Client,
  fetchClients,
  createClient,
} from '@/lib/api';

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ClientsView({ showToast }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await createClient(name.trim());
      showToast(`Created client workspace "${created.name}"!`);
      setName('');
      setShowModal(false);
      loadClients();
    } catch (err: any) {
      showToast(err.message || 'Failed to create client', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6" style={{ background: '#F4F5F2' }}>
      {/* Header */}
      <div className="p-6 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#1C2321' }}>
            Client Workspaces & Brands
          </h1>
          <p className="text-xs" style={{ color: '#9A9A93' }}>
            Multi-tenant agency accounts. Manage separate social channels, content libraries, and approvals per brand.
          </p>
        </div>

        <button
          id="client-new-btn"
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 rounded text-xs font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: '#2B6E63' }}
        >
          + Add Client Workspace
        </button>
      </div>

      {/* Clients Grid */}
      {loading ? (
        <div className="text-center py-12 text-xs" style={{ color: '#9A9A93' }}>
          Loading agency clients…
        </div>
      ) : clients.length === 0 ? (
        <div className="p-12 rounded-xl border text-center space-y-3" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
          <p className="text-xs" style={{ color: '#9A9A93' }}>
            No client brands configured yet.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-1.5 rounded text-xs font-medium text-white"
            style={{ background: '#2B6E63' }}
          >
            Create Your First Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/connect/${c.id}`)}
              className="p-5 rounded-xl border space-y-3 hover:shadow-sm transition-shadow text-left cursor-pointer"
              style={{ background: '#fff', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white"
                  style={{ background: '#2B6E63' }}
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold truncate" style={{ color: '#1C2321' }}>
                    {c.name}
                  </h3>
                  <p className="text-[10px]" style={{ color: '#9A9A93' }}>
                    ID: {c.id.slice(0, 12)}…
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between text-[11px]" style={{ borderColor: '#E8EAE6' }}>
                <span className="text-[10px]" style={{ color: '#9A9A93' }}>
                  Created {new Date(c.created_at).toLocaleDateString()}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-medium text-green-700 bg-green-50">
                  Active
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal: New Client */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl p-5 shadow-xl space-y-4" style={{ background: '#fff' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Add Client Workspace
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Brand or Client Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Retail, Stark Digital"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border outline-none"
                  style={{ borderColor: '#D8DAD5' }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs rounded border"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="px-3 py-1.5 text-xs rounded font-medium text-white disabled:opacity-50"
                  style={{ background: '#2B6E63' }}
                >
                  {creating ? 'Creating…' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
