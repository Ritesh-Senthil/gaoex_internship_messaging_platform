/**
 * Channel Screen
 * Displays messages in a channel with send functionality.
 *
 * Refactored: shared hooks for reactions, highlights, attachments, mute, edit,
 * actions; shared components for loading/error states, thread indicator.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';

import StackBackButton from '../components/StackBackButton';
import { useKeyboardScrollOnShow } from '../hooks/useKeyboardScrollOnShow';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { CHAT_LIST_PERF_PROPS } from '../constants/listPerf';
import { RootStackParamList, Message, Attachment } from '../types';
import { channelApi, programApi, roleApi, uploadApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore } from '../store/unreadStore';
import { useConnectionStore } from '../store/connectionStore';
import { useMessageStore, useCachedMessages, hasCachedMessages, reconcileCatchUp, mergeMessagesById, upsertMessage, newClientId } from '../store/messageStore';
import { useActiveChatStore } from '../store/activeChatStore';
import { openForwardPicker } from '../utils/forwardMessage';
import {
  joinChannel,
  leaveChannel,
  joinProgram,
  leaveProgram,
  subscribeToChannelEvents,
  subscribeToChannelCategoryEvents,
  sendTypingStart,
  sendTypingStop,
  ChannelEventData,
  ChannelDeletedEventData,
  ThreadReplyAddedData,
  MessagePinnedData,
  MessageUnpinnedData,
  ChannelTypingEventData,
} from '../services/socket';

// Shared hooks
import { useReactions } from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useMessageHighlight } from '../hooks/useMessageHighlight';
import { useAttachments } from '../hooks/useAttachments';
import { useMute } from '../hooks/useMute';
import { useMessageEdit } from '../hooks/useMessageEdit';
import { useDraft } from '../hooks/useDraft';

// Shared components
import { ChatLoadingState, ChatErrorState } from '../components/ChatStates';
import ThreadIndicator from '../components/ThreadIndicator';
import MessageActions from '../components/MessageActions';
import MarkdownText from '../components/MarkdownText';
import ReactionBar from '../components/ReactionBar';
import MessageInput from '../components/MessageInput';
import { MentionUser, MentionRole } from '../components/MentionAutocomplete';
import { toMentionTokens } from '../utils/mentions';
import AttachmentPicker, { SelectedFile } from '../components/AttachmentPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import { AttachmentList } from '../components/FileCard';
import UserAvatar from '../components/UserAvatar';
import SwipeableMessage from '../components/SwipeableMessage';
import ConnectionBanner from '../components/ConnectionBanner';
import ScrollToBottomFAB from '../components/ScrollToBottomFAB';
import TypingIndicator, { TypingUser } from '../components/TypingIndicator';
import * as Haptics from 'expo-haptics';
import { formatMessageTime, formatDateHeader, shouldShowDateHeader } from '../utils/dateFormatters';

type RouteProps = RouteProp<RootStackParamList, 'Channel'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChannelScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  const { channelId, channelName, programId, highlightMessageId } = route.params;
  const { user } = useAuthStore();
  const { markChannelRead } = useUnreadStore();

  // --- Message state (backed by the central cache — ST-01) ---
  const cacheKey = `channel:${channelId}`;
  const [currentChannelName, setCurrentChannelName] = useState(channelName);
  const messages = useCachedMessages<Message>(cacheKey);
  // setState-compatible dispatcher so existing handlers/hooks work unchanged.
  const setMessages = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) =>
      useMessageStore.getState().setMessages<Message>(cacheKey, value),
    [cacheKey],
  );
  // Skip the full-screen spinner when we already have cached messages to show.
  const [isLoading, setIsLoading] = useState(() => !hasCachedMessages(cacheKey));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messageText, setMessageText, clearDraft } = useDraft(`channel:${channelId}`);

  // Channel permission state
  const [canPost, setCanPost] = useState(true);
  const [canManageMessages, setCanManageMessages] = useState(false);
  const [channelType, setChannelType] = useState<'TEXT' | 'ANNOUNCEMENT'>('TEXT');

  // Mention autocomplete state
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionRoles, setMentionRoles] = useState<MentionRole[]>([]);

  // Tap-to-show timestamp (iMessage-style)
  const [tappedMessageId, setTappedMessageId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const isNearBottom = useRef(true);
  // While a programmatic scroll-to-bottom is settling, ignore transient onScroll
  // readings. Variable-height rows finish measuring after the scroll fires, and
  // those reflow events would otherwise flip us out of "stick to bottom" and park
  // the list just above the end (the chat opens/sends short of the newest message).
  const programmaticScrollUntil = useRef(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showScrollFAB, setShowScrollFAB] = useState(false);

  // Typing indicator (UX-06) — mirrors the DM implementation in ConversationScreen.
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isTypingRef = useRef(false);
  const typingEmitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((animated: boolean) => {
    programmaticScrollUntil.current = Date.now() + 350;
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  useKeyboardScrollOnShow(flatListRef, isNearBottom, scrollToBottom);

  // --- Shared hooks ---
  const { isMuted, isMuteLoading, handleToggleMute } = useMute('channel', channelId);
  const { handleAddReaction, handleToggleReaction, applyReactionAdded, applyReactionRemoved } =
    useReactions(user?.id, user?.displayName);
  const { selectedMessage, showActions, openActions, closeActions } =
    useMessageActions<Message>();
  const { editingMessage, editText, setEditText, inputRef, startEdit, cancelEdit, saveEdit } =
    useMessageEdit<Message>(channelApi.editMessage, channelId, setMessages);
  const {
    selectedFiles, showPicker, uploadProgress, isUploading,
    openPicker, closePicker, addFiles, removeFile, clearFiles,
  } = useAttachments();
  // Per-upload progress (UX-01): keyed by the optimistic message's clientId, so a
  // file send renders an immediate placeholder and reconciles in the background
  // like text sends. `pendingUploadsRef` keeps the picked files for an in-flight
  // upload so a failed row can be retried with the same files + clientId.
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<string, number>>({});
  const pendingUploadsRef = useRef<Map<string, SelectedFile[]>>(new Map());
  const { highlightedId, highlightAnim, hasScrolledToHighlight } = useMessageHighlight({
    messages,
    flatListRef: flatListRef as React.RefObject<FlatList>,
    highlightMessageId,
    routeHighlightMessageId: route.params.highlightMessageId,
    isLoading,
  });

  // --- Header with pin + mute (Ionicons) ---
  const headerRight = useMemo(
    () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('PinnedMessages', { channelId, title: `#${currentChannelName}`, programId })}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="pin-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleToggleMute}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          disabled={isMuteLoading}
        >
          <Ionicons
            name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
            size={22}
            color={colors.text}
            style={{ opacity: isMuteLoading ? 0.4 : 1 }}
          />
        </TouchableOpacity>
      </View>
    ),
    [navigation, channelId, currentChannelName, programId, handleToggleMute, isMuted, isMuteLoading],
  );

  useEffect(() => {
    navigation.setOptions({
      title: `#${currentChannelName}`,
      headerBackVisible: false,
      headerLeft: () => <StackBackButton />,
      headerRight: () => headerRight,
    });
  }, [currentChannelName, navigation, headerRight]);

  // --- Fetch messages ---
  const fetchMessages = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        if (!hasMore || isLoadingMore) return;
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const options: { limit: number; before?: string } = { limit: 50 };
      if (loadMore && messages.length > 0) {
        options.before = messages[0].createdAt;
      }

      const response = await channelApi.getMessages(channelId, options);
      if (response.success) {
        if (loadMore) {
          setMessages(prev => [...response.data.messages, ...prev]);
        } else {
          const prev = (useMessageStore.getState().slices[cacheKey] as Message[] | undefined) ?? [];
          setMessages(mergeMessagesById(prev, response.data.messages));
        }
        setHasMore(response.data.hasMore);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
      if (!loadMore) {
        useMessageStore.getState().clearKey(cacheKey);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [channelId, hasMore, isLoadingMore, messages, cacheKey]);

  // Mark this channel as actively viewed (Search / push / list all route here).
  useFocusEffect(
    useCallback(() => {
      useActiveChatStore.getState().setActiveChannel(channelId);
      return () => useActiveChatStore.getState().setActiveChannel(null);
    }, [channelId]),
  );

  // --- Catch-up: refetch the latest page and merge into the cache (RT-01).
  // Runs in the background (no spinner) when the screen regains focus or the
  // socket reconnects, so messages missed during a disconnect/while-away appear.
  const catchUp = useCallback(async () => {
    try {
      const response = await channelApi.getMessages(channelId, { limit: 50 });
      if (!response.success) return;
      // Read the latest cached slice imperatively so reconciliation sees the
      // freshest messages (not a stale closure) and can compute the gap once.
      const prev = (useMessageStore.getState().slices[cacheKey] as Message[] | undefined) ?? [];
      const { messages: reconciled, gap } = reconcileCatchUp(prev, response.data.messages);
      setMessages(reconciled);
      // A gap means >1 page arrived while away; re-enable "load earlier" so the
      // user can scroll up and backfill the missing range.
      if (gap) setHasMore(true);
    } catch {
      // Best-effort; live socket events and the next focus will reconcile.
    }
  }, [channelId, cacheKey, setMessages]);

  // Re-focus catch-up (skip the first focus — the initial load below covers it).
  const skipFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
      catchUp();
    }, [catchUp]),
  );

  // Reconnect catch-up: assume connected at mount so the initial connect doesn't
  // double-fetch; only a genuine reconnect after a drop triggers a catch-up.
  const wasConnected = useRef(true);
  useEffect(() => {
    const unsub = useConnectionStore.subscribe((state) => {
      if (state.status === 'connected') {
        if (!wasConnected.current) { wasConnected.current = true; catchUp(); }
      } else {
        wasConnected.current = false;
      }
    });
    return unsub;
  }, [catchUp]);

  // --- Initial data load ---
  useEffect(() => {
    let isMounted = true;

    fetchMessages();

    // Fetch channel details for posting permissions
    (async () => {
      try {
        const response = await channelApi.getChannel(channelId);
        if (isMounted && response.success && response.data.channel) {
          setCanPost(response.data.channel.canPost ?? true);
          setCanManageMessages(response.data.channel.canManageMessages ?? false);
          setChannelType(response.data.channel.type || 'TEXT');
        }
      } catch {}
    })();

    // Mark channel as read
    markChannelRead(channelId);
    const markAsReadTimeout = setTimeout(async () => {
      if (!isMounted) return;
      try { await channelApi.markAsRead(channelId); } catch {}
    }, 500);

    return () => { isMounted = false; clearTimeout(markAsReadTimeout); };
  }, [channelId, markChannelRead]);

  // --- Fetch members + roles for mention autocomplete ---
  useEffect(() => {
    (async () => {
      try {
        const membersResponse = await programApi.getMembers(programId);
        if (membersResponse.success) {
          setMentionUsers(membersResponse.data.members.map((m: any) => ({
            id: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl,
          })));
        }
        const rolesResponse = await roleApi.getRoles(programId);
        if (rolesResponse.success) {
          setMentionRoles(rolesResponse.data.roles
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({ id: r.id, name: r.name, color: r.color || colors.primary })));
        }
      } catch {}
    })();
  }, [programId]);

  // --- Real-time socket subscriptions ---
  useEffect(() => {
    joinChannel(channelId);

    const unsubscribe = subscribeToChannelEvents({
      onNewMessage: (message: Message) => {
        if (message.channelId === channelId && message.author.id !== user?.id && !message.parentMessageId) {
          setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
          // onContentSizeChange snaps us to the new bottom while we're pinned there;
          // otherwise surface the unread pill instead of yanking the user down.
          if (!isNearBottom.current) setNewMessageCount(c => c + 1);
        }
      },
      onMessageUpdated: (message: Message) => {
        if (message.channelId === channelId) {
          setMessages(prev => prev.map(m => m.id === message.id ? message : m));
        }
      },
      onMessageDeleted: (data: { messageId: string; channelId: string }) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
      },
      onReactionAdded: (data: any) => {
        if (data.channelId === channelId) {
          applyReactionAdded(data, setMessages);
        }
      },
      onReactionRemoved: (data: any) => {
        if (data.channelId === channelId) {
          applyReactionRemoved(data, setMessages);
        }
      },
      onThreadReplyAdded: (data: ThreadReplyAddedData) => {
        setMessages(prev => prev.map(msg =>
          msg.id !== data.parentMessageId ? msg : {
            ...msg,
            replyCount: data.replyCount,
            lastReplyAt: data.lastReplyAt,
            latestReplyAuthors: data.latestReplyAuthors,
          },
        ));
      },
      onMessagePinned: (data: MessagePinnedData) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.map(msg =>
            msg.id === (data.message as Message).id ? { ...msg, isPinned: true } : msg,
          ));
        }
      },
      onMessageUnpinned: (data: MessageUnpinnedData) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId ? { ...msg, isPinned: false } : msg,
          ));
        }
      },
      onUserTyping: (data: ChannelTypingEventData) => {
        if (data.channelId !== channelId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.some(u => u.userId === data.userId) ? prev : [...prev, { userId: data.userId, displayName: data.displayName, avatarUrl: data.avatarUrl }]);
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        const timeout = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
          typingTimeouts.current.delete(data.userId);
        }, 3000);
        typingTimeouts.current.set(data.userId, timeout);
      },
      onUserStoppedTyping: (data: ChannelTypingEventData) => {
        if (data.channelId !== channelId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        typingTimeouts.current.delete(data.userId);
      },
    });

    return () => {
      leaveChannel(channelId);
      unsubscribe();
      typingTimeouts.current.forEach(t => clearTimeout(t));
      typingTimeouts.current.clear();
      setTypingUsers([]);
      if (isTypingRef.current && user?.id) {
        sendTypingStop(channelId, user.id);
        isTypingRef.current = false;
      }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    };
  }, [channelId, user?.id, applyReactionAdded, applyReactionRemoved]);

  // Channel update / delete events
  useEffect(() => {
    joinProgram(programId);
    const unsubscribe = subscribeToChannelCategoryEvents({
      onChannelUpdated: (data: ChannelEventData) => {
        if (data.channel.id !== channelId) return;
        if (data.channel.name !== currentChannelName) {
          setCurrentChannelName(data.channel.name);
          navigation.setOptions({ title: `#${data.channel.name}` });
        }
      },
      onChannelDeleted: (data: ChannelDeletedEventData) => {
        if (data.channelId !== channelId) return;
        Alert.alert('Channel Deleted', 'This channel has been deleted.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      },
    });
    return () => { leaveProgram(programId); unsubscribe(); };
  }, [channelId, programId, currentChannelName, navigation]);

  // --- Send message ---
  // Fire the actual request for an optimistic message and reconcile the result.
  // Used by both first-send and retry (same clientId so it dedupes on the server
  // echo). Marks the row 'failed' on error so it can be retried.
  const deliverChannelMessage = useCallback(async (content: string, clientId: string) => {
    setMessages(prev => prev.map(m =>
      m.clientId === clientId ? { ...m, sendStatus: 'sending' as const } : m,
    ));
    try {
      const response = await channelApi.sendMessage(channelId, content, undefined, clientId);
      if (!response.success) throw new Error('send failed');
      setMessages(prev => upsertMessage(prev, { ...response.data.message, sendStatus: undefined }));
    } catch {
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, sendStatus: 'failed' as const } : m,
      ));
    }
  }, [channelId, setMessages]);

  // Upload variant of deliverChannelMessage (UX-01): runs the multipart upload for
  // an optimistic file message and reconciles on success. The picked files live in
  // pendingUploadsRef so a failed upload can be retried with the same clientId.
  const deliverChannelUpload = useCallback(async (clientId: string) => {
    const files = pendingUploadsRef.current.get(clientId);
    if (!files || files.length === 0) return;
    // Read the caption off the optimistic row so retries reuse it without extra state.
    const slice = useMessageStore.getState().slices[cacheKey] as Message[] | undefined;
    const caption = slice?.find(m => m.clientId === clientId)?.content || undefined;
    setMessages(prev => prev.map(m =>
      m.clientId === clientId ? { ...m, sendStatus: 'sending' as const } : m,
    ));
    setUploadProgressMap(prev => ({ ...prev, [clientId]: 0 }));
    try {
      const filesToUpload = files.map(f => ({ uri: f.uri, name: f.name, type: f.type }));
      const response = await uploadApi.uploadToChannel(channelId, filesToUpload, caption, (p) =>
        setUploadProgressMap(prev => ({ ...prev, [clientId]: p })),
      );
      if (!response.success) throw new Error('upload failed');
      pendingUploadsRef.current.delete(clientId);
      setUploadProgressMap(prev => { const next = { ...prev }; delete next[clientId]; return next; });
      // The server doesn't echo clientId for uploads (idempotency is out of scope),
      // so re-attach it here to reconcile against the optimistic row by clientId.
      setMessages(prev => upsertMessage(prev, { ...response.data.message, clientId, sendStatus: undefined }));
    } catch {
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, sendStatus: 'failed' as const } : m,
      ));
    }
  }, [channelId, cacheKey, setMessages]);

  const handleRetryMessage = useCallback((message: Message) => {
    if (!message.clientId) return;
    if (pendingUploadsRef.current.has(message.clientId)) {
      deliverChannelUpload(message.clientId);
    } else {
      deliverChannelMessage(message.content, message.clientId);
    }
  }, [deliverChannelMessage, deliverChannelUpload]);

  // --- Typing emission (UX-06) ---
  const handleTextChange = useCallback((text: string) => {
    setMessageText(text);
    if (!user?.id) return;
    if (text.length > 0) {
      if (!isTypingRef.current) { isTypingRef.current = true; sendTypingStart(channelId, user.id); }
      if (typingEmitTimeout.current) clearTimeout(typingEmitTimeout.current);
      typingEmitTimeout.current = setTimeout(() => {
        if (isTypingRef.current) { isTypingRef.current = false; sendTypingStop(channelId, user.id); }
      }, 3000);
    } else {
      if (isTypingRef.current) { isTypingRef.current = false; sendTypingStop(channelId, user.id); }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    }
  }, [channelId, user?.id, setMessageText]);

  const handleSendMessage = async () => {
    // Convert the displayed `@DisplayName` mentions into stable `<@id>` / `<@&id>`
    // tokens (PE-04) before persisting/optimistic-rendering.
    const content = toMentionTokens(messageText.trim(), mentionUsers, mentionRoles);
    const hasFiles = selectedFiles.length > 0;
    if (!content && !hasFiles) return;
    if (isUploading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Stop the typing indicator immediately on send.
    if (isTypingRef.current && user?.id) { isTypingRef.current = false; sendTypingStop(channelId, user.id); }
    if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }

    // Clear the input draft once, up front, mirroring ConversationScreen (UX-12).
    // The typed text/caption is captured in `content` and carried onto the
    // optimistic row, so a send/upload failure surfaces as a failed, retriable
    // row (UX-01) without losing what the user wrote.
    clearDraft();

    // Optimistic file send (UX-01): render a placeholder with local previews now,
    // then upload + reconcile in the background — consistent with text sends.
    if (hasFiles) {
      const clientId = newClientId();
      const now = new Date().toISOString();
      const optimisticAttachments: Attachment[] = selectedFiles.map((f, i) => ({
        id: `temp-att-${clientId}-${i}`,
        fileName: f.name,
        // Use the picked file's local uri so image previews render immediately.
        fileUrl: f.uri,
        mimeType: f.type,
        fileSize: f.size ?? 0,
      }));
      const optimistic: Message = {
        id: `temp-${clientId}`,
        clientId,
        sendStatus: 'sending',
        content,
        authorId: user?.id ?? '',
        author: { id: user?.id ?? '', displayName: user?.displayName ?? 'You', avatarUrl: user?.avatarUrl ?? null },
        channelId,
        conversationId: null,
        mentionedUsers: [],
        mentionedRoles: [],
        mentionEveryone: false,
        isEdited: false,
        isPinned: false,
        attachments: optimisticAttachments,
        reactions: [],
        parentMessageId: null,
        replyCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      pendingUploadsRef.current.set(clientId, selectedFiles);
      isNearBottom.current = true;
      setMessages(prev => [...prev, optimistic]);
      clearFiles();
      deliverChannelUpload(clientId);
      return;
    }

    // Optimistic text send: render immediately, then reconcile in the background.
    const clientId = newClientId();
    const now = new Date().toISOString();
    const optimistic: Message = {
      id: `temp-${clientId}`,
      clientId,
      sendStatus: 'sending',
      content,
      authorId: user?.id ?? '',
      author: { id: user?.id ?? '', displayName: user?.displayName ?? 'You', avatarUrl: user?.avatarUrl ?? null },
      channelId,
      conversationId: null,
      mentionedUsers: [],
      mentionedRoles: [],
      mentionEveryone: false,
      isEdited: false,
      isPinned: false,
      attachments: [],
      reactions: [],
      parentMessageId: null,
      replyCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    // Pin to bottom before inserting so onContentSizeChange snaps to the newest row.
    isNearBottom.current = true;
    setMessages(prev => [...prev, optimistic]);
    deliverChannelMessage(content, clientId);
  };

  // --- Delete + Pin ---
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await channelApi.deleteMessage(channelId, selectedMessage.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete message');
    }
    closeActions();
  };

  const handlePinMessage = async () => {
    if (!selectedMessage) return;
    const wasPinned = selectedMessage.isPinned;
    try {
      if (wasPinned) {
        await channelApi.unpinMessage(channelId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: false } : m));
      } else {
        await channelApi.pinMessage(channelId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: true } : m));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || `Failed to ${wasPinned ? 'unpin' : 'pin'} message`);
    }
    closeActions();
  };

  // --- Render message ---
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.author.id === user?.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showHeader = !prevMessage ||
      prevMessage.author.id !== item.author.id ||
      new Date(item.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000;

    const isEditing = editingMessage?.id === item.id;
    const isHighlighted = highlightedId === item.id;
    const showTimestamp = tappedMessageId === item.id;
    const showDate = shouldShowDateHeader(item.createdAt, prevMessage?.createdAt ?? null);
    const hasMetaBadges = item.isEdited || item.isPinned;

    const messageContent = (
      <>
        {showDate && (
          <View style={styles.dateHeader}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDateHeader(item.createdAt)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.messageContainer, isEditing && styles.messageContainerEditing]}
          onPress={() => setTappedMessageId(prev => prev === item.id ? null : item.id)}
          onLongPress={() => openActions(item)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          {showHeader && (
            <View style={styles.messageHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (item.author.id !== user?.id) {
                    navigation.navigate('MemberProfile', { programId, userId: item.author.id, memberName: item.author.displayName });
                  }
                }}
                activeOpacity={0.7}
              >
                <UserAvatar name={item.author.displayName} avatarUrl={item.author.avatarUrl} size={36} style={{ marginRight: spacing.sm }} />
              </TouchableOpacity>
              <View style={styles.messageHeaderText}>
                <Text style={styles.authorName}>{item.author.displayName}</Text>
                {/* Inline timestamp (tap to reveal) */}
                {showTimestamp && (
                  <Text style={styles.timestamp}>
                    {formatMessageTime(item.createdAt)}
                    {item.isEdited && '  (edited)'}
                  </Text>
                )}
                {showTimestamp && item.isPinned && (
                  <Ionicons name="pin" size={11} color={colors.textMuted} style={{ marginLeft: 2 }} />
                )}
                {/* Compact meta badges (visible when timestamp hidden) */}
                {hasMetaBadges && !showTimestamp && (
                  <View style={styles.metaBadgeRow}>
                    {item.isEdited && <Text style={styles.metaBadge}>edited</Text>}
                    {item.isPinned && <Ionicons name="pin" size={10} color={colors.textMuted} style={{ marginLeft: 2 }} />}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Timestamp for continuation messages (no header) */}
          {!showHeader && showTimestamp && (
            <View style={styles.timestampRowContinuation}>
              <Text style={styles.timestamp}>
                {formatMessageTime(item.createdAt, { includeDate: false })}
                {item.isEdited && '  (edited)'}
              </Text>
            </View>
          )}

          <View style={[styles.messageContent, !showHeader && styles.messageContentContinued, item.sendStatus === 'sending' && styles.messageContentSending]}>
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  ref={inputRef}
                  style={styles.editInput}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEdit} style={styles.editButton}>
                    <Text style={styles.editButtonTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveEdit} style={[styles.editButton, styles.editButtonSave]}>
                    <Text style={styles.editButtonTextSave}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {item.content ? (
                  <MarkdownText
                    style={styles.messageText}
                    mentionedUsers={mentionUsers.map(u => u.displayName)}
                    mentionedRoles={mentionRoles.map(r => r.name)}
                    mentionUsers={mentionUsers}
                    mentionRoles={mentionRoles}
                    mentionEveryone
                  >
                    {item.content}
                  </MarkdownText>
                ) : null}
                {item.attachments && item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}
                {item.reactions && item.reactions.length > 0 && (
                  <ReactionBar
                    reactions={item.reactions}
                    currentUserId={user?.id}
                    onReactionPress={(emoji, hasReacted) => handleToggleReaction(item.id, emoji, hasReacted, setMessages)}
                    onAddReaction={() => openActions(item)}
                    isOwnMessage={isOwn}
                  />
                )}
                <ThreadIndicator
                  replyCount={item.replyCount ?? 0}
                  lastReplyAt={item.lastReplyAt}
                  latestReplyAuthors={item.latestReplyAuthors}
                  onPress={() => navigation.navigate('Thread', { messageId: item.id, channelId, channelName: currentChannelName, programId })}
                />
                {item.sendStatus === 'sending' && (
                  <Text style={styles.sendStatusSending}>
                    {item.clientId !== undefined && uploadProgressMap[item.clientId] !== undefined
                      ? `Uploading… ${Math.round(uploadProgressMap[item.clientId] * 100)}%`
                      : 'Sending…'}
                  </Text>
                )}
                {item.sendStatus === 'failed' && (
                  <TouchableOpacity onPress={() => handleRetryMessage(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.sendStatusFailed}>
                      <Ionicons name="alert-circle" size={12} color={colors.error} /> Failed to send. Tap to retry.
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </>
    );

    const handleSwipeReply = () => {
      navigation.navigate('Thread', { messageId: item.id, channelId, channelName: currentChannelName, programId });
    };

    if (isHighlighted) {
      const backgroundColor = highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['transparent', colors.highlightBg],
      });
      return (
        <SwipeableMessage onSwipeReply={handleSwipeReply}>
          <Animated.View style={{ backgroundColor }}>{messageContent}</Animated.View>
        </SwipeableMessage>
      );
    }

    return (
      <SwipeableMessage onSwipeReply={handleSwipeReply}>
        {messageContent}
      </SwipeableMessage>
    );
  };

  // --- Loading / Error ---
  if (isLoading && messages.length === 0) return <ChatLoadingState />;
  if (error && messages.length === 0) return <ChatErrorState error={error} onRetry={() => fetchMessages()} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ConnectionBanner />
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.clientId ?? item.id}
          renderItem={renderMessage}
          {...CHAT_LIST_PERF_PROPS}
          keyboardDismissMode="on-drag"
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Welcome to #{currentChannelName}</Text>
              <Text style={styles.emptySubtitle}>This is the beginning of the channel. Send the first message!</Text>
            </View>
          }
          ListHeaderComponent={isLoadingMore ? (
            <View style={styles.loadingMore}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : null}
          onEndReachedThreshold={0.5}
          onEndReached={() => {}}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            if (contentOffset.y < 50 && hasMore && !isLoadingMore) {
              fetchMessages(true);
            }
            // Don't let reflow events during a programmatic scroll un-pin us.
            if (Date.now() < programmaticScrollUntil.current) return;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            const nearBottom = distanceFromBottom < 150;
            isNearBottom.current = nearBottom;
            setShowScrollFAB(!nearBottom);
            if (nearBottom) {
              setNewMessageCount(0);
            }
          }}
          scrollEventThrottle={16}
          inverted={false}
          // Anchor the visible messages when older history is prepended (UX-04) so
          // loading earlier messages doesn't teleport the viewport. minIndexForVisible:1
          // keeps the load-more header (index 0) from fighting the anchor.
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          onContentSizeChange={() => {
            if ((route.params.highlightMessageId || highlightMessageId) && !hasScrolledToHighlight.current) return;
            if (messages.length > 0 && !isLoadingMore && isNearBottom.current) {
              scrollToBottom(false);
            }
          }}
        />

        <ScrollToBottomFAB
          visible={showScrollFAB}
          newMessageCount={newMessageCount}
          onPress={() => {
            isNearBottom.current = true;
            scrollToBottom(true);
            setNewMessageCount(0);
            setShowScrollFAB(false);
          }}
        />

        {/* Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* Attachment Preview */}
        {selectedFiles.length > 0 && (
          <AttachmentPreview files={selectedFiles} onRemove={removeFile} isUploading={isUploading} uploadProgress={uploadProgress} />
        )}

        {/* Message Input */}
        {!editingMessage && (
          canPost ? (
            <View style={styles.inputWrapper}>
              <TouchableOpacity style={styles.attachButton} onPress={openPicker} disabled={isUploading}>
                <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.inputFlex}>
                <MessageInput
                  value={messageText}
                  onChangeText={handleTextChange}
                  onSend={handleSendMessage}
                  placeholder={`Message #${channelName}`}
                  isSending={isUploading}
                  users={mentionUsers}
                  roles={mentionRoles}
                  includeSpecialMentions
                  canSendOverride={selectedFiles.length > 0 ? true : undefined}
                />
              </View>
            </View>
          ) : (
            <View style={styles.readOnlyBanner}>
              <Ionicons name="megaphone-outline" size={18} color={colors.warning} />
              <Text style={styles.readOnlyText}>Only administrators can post in announcement channels</Text>
            </View>
          )
        )}

        {/* Attachment Picker Modal */}
        <AttachmentPicker
          visible={showPicker}
          onClose={closePicker}
          onFilesSelected={addFiles}
          maxFiles={5}
          currentFileCount={selectedFiles.length}
        />
      </KeyboardAvoidingView>

      {/* Unified Message Actions (includes quick-react row) */}
      <MessageActions
        visible={showActions}
        onClose={closeActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.author.id === user?.id}
        canDelete={canManageMessages}
        isPinned={selectedMessage?.isPinned}
        onEdit={() => { if (selectedMessage) startEdit(selectedMessage); }}
        onDelete={handleDeleteMessage}
        onQuickReact={(emoji) => {
          if (selectedMessage) handleAddReaction(selectedMessage.id, emoji, setMessages);
        }}
        onPin={selectedMessage && !selectedMessage.parentMessageId ? handlePinMessage : undefined}
        onReply={selectedMessage ? () => {
          const msg = selectedMessage;
          closeActions();
          const threadMessageId = msg.parentMessageId || msg.id;
          navigation.navigate('Thread', { messageId: threadMessageId, channelId, channelName: currentChannelName, programId });
        } : undefined}
        onForward={selectedMessage ? () => {
          openForwardPicker(
            navigation,
            selectedMessage,
            selectedMessage.author.displayName,
            { channelId },
          );
        } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardAvoid: { flex: 1 },
  messageList: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  emptyList: { flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { fontSize: typography.fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  loadingMore: { padding: spacing.md, alignItems: 'center' },

  // Date header
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, paddingHorizontal: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { marginHorizontal: spacing.md, fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium },

  // Message
  messageContainer: { paddingHorizontal: spacing.md, paddingVertical: 2 },
  messageContainerEditing: { backgroundColor: colors.primary + '10', borderLeftWidth: 3, borderLeftColor: colors.primary },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  messageHeaderText: { flexDirection: 'row', alignItems: 'baseline', flex: 1, flexWrap: 'wrap', gap: spacing.xs },
  authorName: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text },
  metaBadgeRow: { flexDirection: 'row', alignItems: 'center' },
  metaBadge: { fontSize: typography.fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  timestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted },
  timestampRowContinuation: { marginLeft: 44, marginBottom: 1 },
  messageContent: { marginLeft: 44, marginTop: 1 },
  messageContentContinued: { marginTop: 1 },
  messageContentSending: { opacity: 0.6 },
  messageText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 22 },
  sendStatusSending: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },
  sendStatusFailed: { fontSize: typography.fontSize.xs, color: colors.error, marginTop: 2 },

  // Edit
  editContainer: { flex: 1 },
  editInput: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: typography.fontSize.md, color: colors.text, minHeight: 40, maxHeight: 100 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs, gap: spacing.sm },
  editButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  editButtonSave: { backgroundColor: colors.primary },
  editButtonTextCancel: { color: colors.textMuted, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  editButtonTextSave: { color: colors.white, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },

  // Input area
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  attachButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs, marginBottom: spacing.xs },
  inputFlex: { flex: 1 },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warning + '20', borderTopWidth: 1, borderTopColor: colors.warning + '50', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  readOnlyText: { color: colors.warning, fontSize: typography.fontSize.sm, textAlign: 'center', fontWeight: typography.fontWeight.medium },
});
