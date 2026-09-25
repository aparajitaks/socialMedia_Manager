'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import CalendarView from '@/components/CalendarView';
import StatusView from '@/components/StatusView';
import AnalyticsView from '@/components/AnalyticsView';
import AccountsView from '@/components/AccountsView';
import ComposerPanel from '@/components/ComposerPanel';
import { PostDetailsModal } from '@/components/PostDetailsModal';
import { ToastContainer, ToastMessage } from '@/components/Toast';
import {
  Post,
  SocialAccount,
  fetchAccounts,
  fetchPosts,
  runScheduler,
} from '@/lib/api';

export type Section = 'calendar' | 'status' | 'analytics' | 'accounts';

export default function Home() {
  const [section, setSection] = useState<Section>('calendar');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const [role, setRole] = useState<'admin' | 'editor'>('admin');
  const [schedulerRunning, setSchedulerRunning] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Accounts & Posts
  const loadAccounts = useCallback(async () => {
    try {
      const data = await fetchAccounts();
      setAccounts(data);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts();
      setPosts(data);
    } catch (err: any) {
      console.error('Failed to load posts:', err);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadPosts();
  }, [loadAccounts, loadPosts]);

  // Read URL params (e.g. ?connected=linkedin or ?error=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('connected');
      const error = params.get('error');
      if (connected) {
        showToast(`${connected.toUpperCase()} channel successfully connected!`);
        setSection('accounts');
        loadAccounts();
        window.history.replaceState({}, '', window.location.pathname);
      } else if (error) {
        showToast(`Connection failed: ${error}`, 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [showToast, loadAccounts]);

  const triggerScheduler = async () => {
    setSchedulerRunning(true);
    try {
      const res = await runScheduler();
      if (res.processed_count > 0) {
        showToast(`Scheduler published ${res.processed_count} post(s)!`);
        loadPosts();
      } else {
        showToast('Scheduler ran: no posts due right now');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSchedulerRunning(false);
    }
  };


  const openComposer = (date?: string) => {
    setComposerDate(date || null);
    setComposerOpen(true);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F4F5F2' }}>
      {/* Figma Sidebar */}
      <Sidebar
        section={section}
        setSection={setSection}
        openComposer={() => openComposer()}
        role={role}
        setRole={(r) => {
          setRole(r);
          showToast(`Switched active role to: ${r.toUpperCase()}`);
        }}
        onRunScheduler={triggerScheduler}
        schedulerRunning={schedulerRunning}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden relative">
        {section === 'calendar' && (
          <CalendarView
            posts={posts}
            accounts={accounts}
            openComposer={openComposer}
            onSelectPost={setSelectedPost}
          />
        )}

        {section === 'status' && (
          <StatusView
            posts={posts}
            accounts={accounts}
            role={role}
            onPostUpdated={loadPosts}
            onSelectPost={setSelectedPost}
            showToast={showToast}
          />
        )}

        {section === 'analytics' && (
          <AnalyticsView posts={posts} showToast={showToast} />
        )}

        {section === 'accounts' && (
          <AccountsView
            accounts={accounts}
            onRefresh={() => {
              loadAccounts();
              loadPosts();
            }}
            showToast={showToast}
          />
        )}

        {/* Figma Composer Slide-Over Panel */}
        {composerOpen && (
          <ComposerPanel
            accounts={accounts}
            initialDate={composerDate}
            onClose={() => setComposerOpen(false)}
            onCreated={() => {
              loadPosts();
              setSection('calendar');
            }}
            showToast={showToast}
          />
        )}

        {/* Post Inspector / Editor Modal */}
        {selectedPost && (
          <PostDetailsModal
            post={selectedPost}
            accounts={accounts}
            role={role}
            onClose={() => setSelectedPost(null)}
            onPostUpdated={() => {
              loadPosts();
              // refresh selected post from current list if updated
              fetch(`/api/posts/${selectedPost.id}`)
                .then((r) => r.json())
                .then((p) => {
                  if (p && !p.error) setSelectedPost(p);
                })
                .catch(() => {});
            }}
            showToast={showToast}
          />
        )}
      </main>

      {/* Floating Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
