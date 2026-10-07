'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ContentLibrary,
  LibraryPost,
  RecurringSchedule,
  SocialAccount,
  fetchLibraries,
  fetchLibrary,
  createLibrary,
  deleteLibrary,
  addLibraryPost,
  deleteLibraryPost,
  addRecurringSchedule,
  deleteRecurringSchedule,
  rotateLibrary,
  uploadMedia,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface Props {
  accounts: SocialAccount[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onPostScheduled?: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESET_COLORS = ['#2B6E63', '#1877F2', '#0A66C2', '#C13584', '#D97706', '#7C3AED', '#DC2626'];

export default function LibraryView({ accounts, showToast, onPostScheduled }: Props) {
  const [libraries, setLibraries] = useState<ContentLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<ContentLibrary | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal / Form States
  const [showNewLibModal, setShowNewLibModal] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [newLibColor, setNewLibColor] = useState('#2B6E63');

  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postMediaUrls, setPostMediaUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri default
  const [timeOfDay, setTimeOfDay] = useState('10:00');
  const [targetAccountIds, setTargetAccountIds] = useState<string[]>([]);

  const [rotating, setRotating] = useState(false);

  // Load list of libraries
  const loadLibraries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchLibraries();
      setLibraries(data);
      if (data.length > 0 && !selectedLibraryId) {
        setSelectedLibraryId(data[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load libraries', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedLibraryId, showToast]);

  // Load single library details
  const loadLibraryDetails = useCallback(async (id: string) => {
    try {
      const data = await fetchLibrary(id);
      setSelectedLibrary(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load library details', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadLibraries();
  }, [loadLibraries]);

  useEffect(() => {
    if (selectedLibraryId) {
      loadLibraryDetails(selectedLibraryId);
    }
  }, [selectedLibraryId, loadLibraryDetails]);

  // Create Library
  const handleCreateLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibName.trim()) return;
    try {
      const created = await createLibrary({ name: newLibName.trim(), color: newLibColor });
      showToast(`Created library "${created.name}"`);
      setNewLibName('');
      setShowNewLibModal(false);
      await loadLibraries();
      setSelectedLibraryId(created.id);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Delete Library
  const handleDeleteLibrary = async (lib: ContentLibrary) => {
    if (!confirm(`Are you sure you want to delete "${lib.name}" and all its recurring slots?`)) return;
    try {
      await deleteLibrary(lib.id);
      showToast(`Deleted library "${lib.name}"`);
      setSelectedLibraryId(null);
      setSelectedLibrary(null);
      await loadLibraries();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Add Post to Library
  const handleAddPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLibraryId || !postContent.trim()) return;
    try {
      await addLibraryPost(selectedLibraryId, {
        content: postContent.trim(),
        media_urls: postMediaUrls,
      });
      showToast('Added post to evergreen library!');
      setPostContent('');
      setPostMediaUrls([]);
      setShowAddPostModal(false);
      loadLibraryDetails(selectedLibraryId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Delete Post from Library
  const handleDeletePost = async (postId: string) => {
    if (!selectedLibraryId || !confirm('Remove this post from evergreen recycling?')) return;
    try {
      await deleteLibraryPost(selectedLibraryId, postId);
      showToast('Removed post from library');
      loadLibraryDetails(selectedLibraryId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadMedia(file);
      setPostMediaUrls((prev) => [...prev, url]);
      showToast('Media uploaded successfully');
    } catch (err: any) {
      showToast(err.message || 'Media upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Add Recurring Schedule Slot
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLibraryId) return;
    if (selectedDays.length === 0) {
      showToast('Please select at least one day of the week', 'error');
      return;
    }
    if (targetAccountIds.length === 0) {
      showToast('Please select at least one target social account', 'error');
      return;
    }

    try {
      await addRecurringSchedule(selectedLibraryId, {
        days_of_week: selectedDays,
        time_of_day: timeOfDay,
        social_account_ids: targetAccountIds,
      });
      showToast('Recurring publishing slot created!');
      setShowAddScheduleModal(false);
      loadLibraryDetails(selectedLibraryId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Delete Recurring Slot
  const handleDeleteSchedule = async (schedId: string) => {
    if (!selectedLibraryId || !confirm('Delete this recurring schedule slot?')) return;
    try {
      await deleteRecurringSchedule(selectedLibraryId, schedId);
      showToast('Removed recurring slot');
      loadLibraryDetails(selectedLibraryId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Manual Trigger: Rotate Library Post to Queue Now
  const handleRotateNow = async () => {
    if (!selectedLibraryId) return;
    setRotating(true);
    try {
      const res = await rotateLibrary(selectedLibraryId);
      showToast(`Rotated post! Created ${res.scheduled_posts?.length || 1} scheduled post(s).`);
      loadLibraryDetails(selectedLibraryId);
      if (onPostScheduled) onPostScheduled();
    } catch (err: any) {
      showToast(err.message || 'Rotation failed', 'error');
    } finally {
      setRotating(false);
    }
  };

  const toggleDay = (d: number) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const toggleTargetAccount = (id: string) => {
    setTargetAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#F4F5F2' }}>
      {/* Left Column: Libraries List */}
      <div
        className="w-72 shrink-0 border-r flex flex-col h-full"
        style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#D8DAD5' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Content Libraries
            </h2>
            <p className="text-xs" style={{ color: '#9A9A93' }}>
              RecurPost-Style Evergreen
            </p>
          </div>
          <button
            id="library-new-btn"
            onClick={() => setShowNewLibModal(true)}
            className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
            style={{ background: '#2B6E63', color: '#fff' }}
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {libraries.length === 0 && !loading && (
            <div className="text-center py-8 px-4 text-xs" style={{ color: '#9A9A93' }}>
              No libraries created yet. Click "+ New" to create an evergreen bucket.
            </div>
          )}
          {libraries.map((lib) => {
            const isSelected = selectedLibraryId === lib.id;
            return (
              <button
                key={lib.id}
                onClick={() => setSelectedLibraryId(lib.id)}
                className="w-full text-left p-3 rounded-lg flex items-center justify-between transition-all"
                style={{
                  background: isSelected ? '#fff' : 'transparent',
                  border: isSelected ? '1px solid #D8DAD5' : '1px solid transparent',
                  boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: lib.color || '#2B6E63' }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-medium truncate" style={{ color: '#1C2321' }}>
                      {lib.name}
                    </div>
                    <div className="text-[10px]" style={{ color: '#9A9A93' }}>
                      {lib.active ? 'Active Rotation' : 'Paused'}
                    </div>
                  </div>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0"
                  style={{ background: '#F4F5F2', color: '#9A9A93' }}
                >
                  {lib.total_posts ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: Library Details, Posts & Schedule Slots */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        {selectedLibrary ? (
          <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
            {/* Header Card */}
            <div
              className="p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              style={{ background: '#fff', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ background: selectedLibrary.color || '#2B6E63' }}
                />
                <div>
                  <h1 className="text-lg font-semibold" style={{ color: '#1C2321' }}>
                    {selectedLibrary.name}
                  </h1>
                  <p className="text-xs" style={{ color: '#9A9A93' }}>
                    Evergreen pool rotates posts across connected social channels on a recurring schedule.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="library-rotate-now-btn"
                  onClick={handleRotateNow}
                  disabled={rotating || (selectedLibrary.posts?.length ?? 0) === 0}
                  className="px-3 py-1.5 rounded text-xs font-medium border transition-colors hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  title="Queue next eligible post right now"
                >
                  {rotating ? 'Queuing…' : '⚡ Rotate Now'}
                </button>
                <button
                  id="library-add-post-btn"
                  onClick={() => setShowAddPostModal(true)}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{ background: '#2B6E63', color: '#fff' }}
                >
                  + Add Post
                </button>
                <button
                  onClick={() => handleDeleteLibrary(selectedLibrary)}
                  className="p-1.5 text-xs text-red-600 hover:bg-red-50 rounded"
                  title="Delete Library"
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* Recurring Schedule Slots Section */}
            <div
              className="p-5 rounded-xl border space-y-4"
              style={{ background: '#fff', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                    Recurring Schedule Slots (Auto-Publish)
                  </h2>
                  <p className="text-xs" style={{ color: '#9A9A93' }}>
                    Define the days and times when this library automatically picks and queues the least-recently used post.
                  </p>
                </div>
                <button
                  id="library-add-slot-btn"
                  onClick={() => {
                    setTargetAccountIds(accounts.map((a) => a.id));
                    setShowAddScheduleModal(true);
                  }}
                  className="text-xs px-2.5 py-1 rounded border font-medium hover:bg-gray-50"
                  style={{ borderColor: '#D8DAD5', color: '#2B6E63' }}
                >
                  + Add Recurring Slot
                </button>
              </div>

              {(!selectedLibrary.schedules || selectedLibrary.schedules.length === 0) ? (
                <div
                  className="p-6 rounded-lg text-center border border-dashed text-xs"
                  style={{ borderColor: '#D8DAD5', color: '#9A9A93' }}
                >
                  No recurring slots active. Add a slot (e.g., Every Monday & Friday at 10:00 AM) to automate evergreen posting.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedLibrary.schedules.map((slot) => {
                    const daysLabel = slot.days_of_week
                      .sort()
                      .map((d) => DAYS[d])
                      .join(', ');
                    const matchedAccounts = accounts.filter((a) => slot.social_account_ids.includes(a.id));

                    return (
                      <div
                        key={slot.id}
                        className="p-3 rounded-lg border flex items-center justify-between"
                        style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: '#1C2321' }}>
                              ⏰ {slot.time_of_day}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: '#EBF3F1', color: '#2B6E63' }}>
                              {daysLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            {matchedAccounts.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border"
                                style={{ borderColor: '#D8DAD5', background: '#fff' }}
                              >
                                <PlatformLogo platform={a.platform} size={10} />
                                <span className="truncate max-w-[80px]">{a.display_name}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteSchedule(slot.id)}
                          className="text-xs text-gray-400 hover:text-red-600 p-1"
                          title="Delete slot"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Posts Grid in Library */}
            <div
              className="p-5 rounded-xl border space-y-4"
              style={{ background: '#fff', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                    Library Posts ({selectedLibrary.posts?.length || 0})
                  </h2>
                  <p className="text-xs" style={{ color: '#9A9A93' }}>
                    Evergreen posts are cycled in round-robin fashion. Posts with 0 publications rotate first.
                  </p>
                </div>
              </div>

              {(!selectedLibrary.posts || selectedLibrary.posts.length === 0) ? (
                <div
                  className="p-10 rounded-lg text-center border border-dashed text-xs space-y-2"
                  style={{ borderColor: '#D8DAD5', color: '#9A9A93' }}
                >
                  <p>No content in this evergreen library yet.</p>
                  <button
                    onClick={() => setShowAddPostModal(true)}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{ background: '#2B6E63', color: '#fff' }}
                  >
                    + Add First Post
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedLibrary.posts.map((post) => (
                    <div
                      key={post.id}
                      className="p-4 rounded-lg border flex flex-col justify-between space-y-3"
                      style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
                    >
                      <div className="space-y-2">
                        <p className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-4" style={{ color: '#1C2321' }}>
                          {post.content}
                        </p>

                        {post.media_urls && post.media_urls.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto py-1">
                            {post.media_urls.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt="Post media"
                                className="w-16 h-16 rounded object-cover border"
                                style={{ borderColor: '#D8DAD5' }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t flex items-center justify-between text-[11px]" style={{ borderColor: '#E8EAE6', color: '#9A9A93' }}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">
                            🔄 {post.times_published || 0} times published
                          </span>
                          {post.last_published_at && (
                            <span>• Last: {new Date(post.last_published_at).toLocaleDateString()}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="hover:text-red-600 transition-colors"
                          title="Remove from library"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#9A9A93' }}>
            Select or create a content library to manage evergreen recycling
          </div>
        )}
      </div>

      {/* Modal: New Library */}
      {showNewLibModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl p-5 shadow-xl space-y-4" style={{ background: '#fff' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Create Evergreen Library
            </h3>
            <form onSubmit={handleCreateLibrary} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Library Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Evergreen Blog Tips, Promo Quotes"
                  value={newLibName}
                  onChange={(e) => setNewLibName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border outline-none"
                  style={{ borderColor: '#D8DAD5' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Color Badge
                </label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLibColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform"
                      style={{
                        background: c,
                        borderColor: newLibColor === c ? '#1C2321' : 'transparent',
                        transform: newLibColor === c ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewLibModal(false)}
                  className="px-3 py-1.5 text-xs rounded border"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded font-medium text-white"
                  style={{ background: '#2B6E63' }}
                >
                  Create Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Post to Library */}
      {showAddPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl p-5 shadow-xl space-y-4" style={{ background: '#fff' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Add Evergreen Post
            </h3>
            <form onSubmit={handleAddPost} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Post Content
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Share timeless wisdom, tips, or regular updates..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border outline-none resize-none"
                  style={{ borderColor: '#D8DAD5' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Media Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="text-xs"
                />
                {isUploading && <span className="text-xs text-gray-500 ml-2">Uploading…</span>}
                {postMediaUrls.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {postMediaUrls.map((u, i) => (
                      <img key={i} src={u} alt="Preview" className="w-12 h-12 rounded object-cover border" />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPostModal(false)}
                  className="px-3 py-1.5 text-xs rounded border"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !postContent.trim()}
                  className="px-3 py-1.5 text-xs rounded font-medium text-white disabled:opacity-50"
                  style={{ background: '#2B6E63' }}
                >
                  Save to Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Recurring Schedule Slot */}
      {showAddScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl p-5 shadow-xl space-y-4" style={{ background: '#fff' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Add Recurring Publishing Slot
            </h3>
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1C2321' }}>
                  Days of Week
                </label>
                <div className="flex gap-1.5">
                  {DAYS.map((d, idx) => {
                    const active = selectedDays.includes(idx);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className="flex-1 py-1.5 text-xs font-medium rounded transition-colors"
                        style={{
                          background: active ? '#2B6E63' : '#F4F5F2',
                          color: active ? '#fff' : '#1C2321',
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                  Time of Day
                </label>
                <input
                  type="time"
                  required
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded border"
                  style={{ borderColor: '#D8DAD5' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1C2321' }}>
                  Target Social Accounts
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1 border rounded p-2" style={{ borderColor: '#D8DAD5' }}>
                  {accounts.map((acc) => {
                    const checked = targetAccountIds.includes(acc.id);
                    return (
                      <label key={acc.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTargetAccount(acc.id)}
                        />
                        <PlatformLogo platform={acc.platform} size={12} />
                        <span style={{ color: '#1C2321' }}>{acc.display_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddScheduleModal(false)}
                  className="px-3 py-1.5 text-xs rounded border"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded font-medium text-white"
                  style={{ background: '#2B6E63' }}
                >
                  Save Schedule Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
