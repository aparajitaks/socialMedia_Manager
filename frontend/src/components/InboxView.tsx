'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  InboxConversation,
  InboxMessage,
  fetchInboxConversations,
  fetchInboxMessages,
  sendInboxReply,
  Platform,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function InboxView({ showToast }: Props) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchInboxConversations();
      setConversations(data);
      if (data.length > 0 && !selectedConvId) {
        setSelectedConvId(data[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load inbox conversations', 'error');
    }
  }, [selectedConvId, showToast]);

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingConv(true);
    try {
      const data = await fetchInboxMessages(convId);
      setMessages(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load conversation messages', 'error');
    } finally {
      setLoadingConv(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    }
  }, [selectedConvId, loadMessages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || !replyText.trim()) return;
    setSending(true);
    try {
      const created = await sendInboxReply(selectedConvId, replyText.trim());
      setMessages((prev) => [...prev, created]);
      setReplyText('');
      showToast('Reply dispatched!');
      loadConversations();
    } catch (err: any) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#F4F5F2' }}>
      {/* Left Column: Conversation List */}
      <div
        className="w-80 shrink-0 border-r flex flex-col h-full"
        style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#D8DAD5' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Social Inbox
            </h2>
            <p className="text-xs" style={{ color: '#9A9A93' }}>
              Direct Messages & Post Comments
            </p>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: '#EBF3F1', color: '#2B6E63' }}>
            {conversations.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <div className="text-center py-8 text-xs" style={{ color: '#9A9A93' }}>
              Inbox clean! No new incoming messages or comments.
            </div>
          )}
          {conversations.map((c) => {
            const isSelected = selectedConvId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedConvId(c.id)}
                className="w-full text-left p-3 rounded-lg flex items-start gap-2.5 transition-all"
                style={{
                  background: isSelected ? '#fff' : 'transparent',
                  border: isSelected ? '1px solid #D8DAD5' : '1px solid transparent',
                  boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ background: '#2B6E63' }}
                  >
                    {c.sender_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-1 -right-1">
                    <PlatformLogo platform={c.platform} size={10} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate" style={{ color: '#1C2321' }}>
                      {c.sender_name}
                    </span>
                    <span className="text-[10px]" style={{ color: '#9A9A93' }}>
                      {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#9A9A93' }}>
                    {c.last_message_text}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: Chat Thread & Dispatch */}
      <div className="flex-1 flex flex-col h-full bg-white">
        {selectedConv ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#D8DAD5' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  style={{ background: '#2B6E63' }}
                >
                  {selectedConv.sender_name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#1C2321' }}>
                    {selectedConv.sender_name}
                    <PlatformLogo platform={selectedConv.platform} size={12} />
                  </div>
                  <div className="text-[10px]" style={{ color: '#9A9A93' }}>
                    Channel conversation via {selectedConv.platform}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingConv ? (
                <div className="text-center py-6 text-xs" style={{ color: '#9A9A93' }}>
                  Loading conversation thread…
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-6 text-xs" style={{ color: '#9A9A93' }}>
                  No previous messages in this conversation.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.is_from_us ? 'items-end' : 'items-start'}`}
                  >
                    <div className="text-[10px] mb-1 px-1" style={{ color: '#9A9A93' }}>
                      {m.sender_name} • {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div
                      className="max-w-[75%] px-3.5 py-2 rounded-xl text-xs leading-relaxed"
                      style={{
                        background: m.is_from_us ? '#2B6E63' : '#F4F5F2',
                        color: m.is_from_us ? '#fff' : '#1C2321',
                        borderBottomRightRadius: m.is_from_us ? 2 : 12,
                        borderBottomLeftRadius: !m.is_from_us ? 2 : 12,
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply Input Box */}
            <form onSubmit={handleSendReply} className="p-3 border-t flex gap-2" style={{ borderColor: '#D8DAD5' }}>
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${selectedConv.sender_name} as Agency Community Manager…`}
                className="flex-1 px-3 py-2 text-xs rounded-lg border outline-none"
                style={{ borderColor: '#D8DAD5' }}
              />
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: '#2B6E63' }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#9A9A93' }}>
            Select an inbox conversation to view thread and send replies
          </div>
        )}
      </div>
    </div>
  );
}
