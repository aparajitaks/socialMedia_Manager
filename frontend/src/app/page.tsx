'use client';

import { useCallback, useEffect, useState } from 'react';
import Sidebar, { NavSection } from '@/components/Sidebar';
import CalendarView from '@/components/CalendarView';
import StatusView from '@/components/StatusView';
import AnalyticsView from '@/components/AnalyticsView';
import AccountsView from '@/components/AccountsView';
import LibraryView from '@/components/LibraryView';
import BulkScheduleView from '@/components/BulkScheduleView';
import ReportsView from '@/components/ReportsView';
import InboxView from '@/components/InboxView';
import ClientsView from '@/components/ClientsView';
import SettingsView from '@/components/SettingsView';
import ComposerPanel from '@/components/ComposerPanel';
import { PostDetailsModal } from '@/components/PostDetailsModal';
import { ToastContainer, ToastMessage } from '@/components/Toast';
import NotificationsPanel from '@/components/NotificationsPanel';
import { Client, Post, SocialAccount, fetchAccounts, fetchClients, fetchPosts, runScheduler } from '@/lib/api';

export type Section = NavSection;

export default function Home() {
  const [section, setSection] = useState<Section>('clients');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [role, setRole] = useState<'admin' | 'editor'>('admin');
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const loadClients = useCallback(async () => {
    try {
      setClients(await fetchClients());
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await fetchAccounts());
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      setPosts(await fetchPosts());
    } catch (error) {
      console.error('Failed to load posts:', error);
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unreadOnly=true');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Array.isArray(data) ? data.length : (data.notifications?.length ?? 0));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadClients();
    loadAccounts();
    loadPosts();
    loadUnreadCount();
  }, [loadClients, loadAccounts, loadPosts, loadUnreadCount]);

  useEffect(() => {
    const interval = setInterval(loadUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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
  }, [loadAccounts, showToast]);

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
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSchedulerRunning(false);
    }
  };

  const openComposer = (date?: string) => {
    setComposerDate(date || null);
    setComposerOpen(true);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const connectedChannels = accounts.length;
  const scheduledPosts = posts.filter((post) => post.status === 'scheduled').length;
  const publishedPosts = posts.filter((post) => post.status === 'published').length;
  const activePlatforms = new Set(accounts.map((account) => account.platform)).size;

  const summaryCards = [
    { label: 'Client workspaces', value: String(clients.length || 0), detail: 'Separate brands and access scopes' },
    { label: 'Connected channels', value: String(connectedChannels || 0), detail: 'LinkedIn, Meta, Google, X' },
    { label: 'Scheduled posts', value: String(scheduledPosts || 0), detail: 'Queued in the content calendar' },
    { label: 'Active platforms', value: String(activePlatforms || 0), detail: 'Publishing destinations live' },
  ];

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: '#F4F5F2', color: '#1C2321' }}>
      <header className="border-b backdrop-blur-xl" style={{ background: 'rgba(244,245,242,0.9)', borderColor: '#D8DAD5' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: '#2B6E63', color: '#F4F5F2' }}>
              <span className="text-sm font-semibold">P</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Postline</div>
              <div className="text-[11px]" style={{ color: '#9A9A93' }}>Agency console for client workspaces and OAuth connections</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() => setSection('clients')}
              className="rounded-full border px-4 py-2 text-xs font-medium transition-colors hover:bg-white"
              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
            >
              Client workspaces
            </button>
            <button
              onClick={() => openComposer()}
              className="rounded-full px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#2B6E63' }}
            >
              New post
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border bg-white/90 p-4 shadow-sm" style={{ borderColor: '#D8DAD5' }}>
              <div className="text-xs" style={{ color: '#9A9A93' }}>{card.label}</div>
              <div className="mt-2 text-3xl font-semibold" style={{ color: '#1C2321' }}>{card.value}</div>
              <div className="mt-1 text-[11px] leading-5" style={{ color: '#6A6F68' }}>{card.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border bg-white p-5 shadow-[0_24px_80px_rgba(28,35,33,0.08)]" style={{ borderColor: '#D8DAD5' }}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: '#9A9A93' }}>Client onboarding</div>
                <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                  Connect social accounts per client, not per company.
                </h1>
              </div>
              <button
                onClick={() => setSection('clients')}
                className="rounded-full border px-4 py-2 text-xs font-medium hover:bg-[#FAFAF8]"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              >
                Manage clients
              </button>
            </div>

            {clients.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-sm" style={{ borderColor: '#D8DAD5', color: '#6A6F68' }}>
                Add a client workspace first. Each client gets its own OAuth state, connected social accounts, and publishing queue.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {clients.map((client) => (
                  <a
                    key={client.id}
                    href={`/connect/${client.id}`}
                    className="rounded-2xl border p-4 transition-shadow hover:shadow-sm"
                    style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
                  >
                    <div className="text-xs font-medium uppercase tracking-[0.16em]" style={{ color: '#9A9A93' }}>Client workspace</div>
                    <div className="mt-2 text-lg font-semibold">{client.name}</div>
                    <div className="mt-1 text-[11px]" style={{ color: '#6A6F68' }}>{client.id}</div>
                    <div className="mt-4 inline-flex rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: '#EBF3F1', color: '#2B6E63' }}>
                      Open connect portal
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border bg-[#1C2321] p-5 text-white shadow-[0_24px_80px_rgba(28,35,33,0.18)]" style={{ borderColor: '#1C2321' }}>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">Flow summary</div>
            <h2 className="mt-2 text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              Agency OAuth is client-scoped end to end.
            </h2>
            <div className="mt-5 space-y-3 text-sm text-white/75">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">1. Select a client workspace.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">2. Start OAuth for the platform you want to connect.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">3. Discover the actual Page, Organization, or Business location.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">4. Store encrypted tokens against that client only.</div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border bg-white shadow-[0_30px_100px_rgba(28,35,33,0.12)]" style={{ borderColor: '#D8DAD5' }}>
          <div className="flex h-[calc(100vh-24rem)] min-h-[760px] overflow-hidden">
            <Sidebar
              section={section}
              setSection={setSection}
              openComposer={() => openComposer()}
              role={role}
              setRole={(nextRole) => {
                setRole(nextRole);
                showToast(`Switched active role to: ${nextRole.toUpperCase()}`);
              }}
              onRunScheduler={triggerScheduler}
              schedulerRunning={schedulerRunning}
              unreadNotifications={unreadCount}
              onOpenNotifications={() => setNotificationsOpen(true)}
            />

            <main className="relative flex-1 overflow-hidden">
              {section === 'calendar' && <CalendarView posts={posts} accounts={accounts} openComposer={openComposer} onSelectPost={setSelectedPost} />}
              {section === 'status' && <StatusView posts={posts} accounts={accounts} role={role} onPostUpdated={loadPosts} onSelectPost={setSelectedPost} showToast={showToast} />}
              {section === 'analytics' && <AnalyticsView posts={posts} showToast={showToast} />}
              {section === 'accounts' && <AccountsView accounts={accounts} onRefresh={() => { loadAccounts(); loadPosts(); }} showToast={showToast} onNavigateToSettings={() => setSection('settings')} />}
              {section === 'library' && <LibraryView accounts={accounts} showToast={showToast} onPostScheduled={loadPosts} />}
              {section === 'bulk' && <BulkScheduleView accounts={accounts} showToast={showToast} onImportComplete={() => { loadPosts(); setSection('calendar'); }} />}
              {section === 'reports' && <ReportsView showToast={showToast} />}
              {section === 'inbox' && <InboxView showToast={showToast} />}
              {section === 'clients' && <ClientsView showToast={showToast} />}
              {section === 'settings' && <SettingsView showToast={showToast} />}

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

              {selectedPost && (
                <PostDetailsModal
                  post={selectedPost}
                  accounts={accounts}
                  role={role}
                  onClose={() => setSelectedPost(null)}
                  onPostUpdated={() => {
                    loadPosts();
                    fetch(`/api/posts/${selectedPost.id}`)
                      .then((r) => r.json())
                      .then((post) => {
                        if (post && !post.error) setSelectedPost(post);
                      })
                      .catch(() => {});
                  }}
                  showToast={showToast}
                />
              )}
            </main>
          </div>
        </section>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {notificationsOpen && (
        <NotificationsPanel
          onClose={() => {
            setNotificationsOpen(false);
            loadUnreadCount();
          }}
        />
      )}
    </div>
  );
}