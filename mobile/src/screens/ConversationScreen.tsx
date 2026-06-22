/**
 * Conversation Screen
 * Displays messages in a DM conversation with send functionality.
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
import { RootStackParamList, DMMessage, Attachment } from '../types';
import { conversationApi, uploadApi, userApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore } from '../store/unreadStore';
import { useConnectionStore } from '../store/connectionStore';
import { useMessageStore, useCachedMessages, hasCachedMessages, reconcileCatchUp, mergeMessagesById, upsertMessage, newClientId } from '../store/messageStore';
import { useActiveChatStore } from '../store/activeChatStore';
import {
  joinConversation,
  leaveConversation,
  subscribeToConversationEvents,
  subscribeToGroupEvents,
  sendDMTypingStart,
  sendDMTypingStop,
  GroupUpdatedEventData,
  GroupParticipantAddedEventData,
  GroupParticipantLeftEventData,
  ThreadReplyAddedData,
  MessagePinnedData,
  MessageUnpinnedData,
  TypingEventData,
} from '../services/socket';

// Shared hooks
import { useReactions } from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useMessageHighlight } from '../hooks/useMessageHighlight';
import { useAttachments } from '../hooks/useAttachments';
import { useMute } from '../hooks/useMute';
import { openForwardPicker } from '../utils/forwardMessage';
import { useMessageEdit } from '../hooks/useMessageEdit';
import { useDraft } from '../hooks/useDraft';

// Shared components
import { ChatLoadingState, ChatErrorState } from '../components/ChatStates';
import ThreadIndicator from '../components/ThreadIndicator';
import MessageActions from '../components/MessageActions';
import MarkdownText from '../components/MarkdownText';
import ReactionBar from '../components/ReactionBar';
import MessageInput from '../components/MessageInput';
import { MentionUser } from '../components/MentionAutocomplete';
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

type RouteProps = RouteProp<RootStackParamList, 'Conversation'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  const { conversationId, name: initialName, highlightMessageId } = route.params;
  const { user } = useAuthStore();
  const { markConversationRead } = useUnreadStore();

  // --- Message state (backed by the central cache — ST-01) ---
  const cacheKey = `conversation:${conversationId}`;
  const messages = useCachedMessages<DMMessage>(cacheKey);
  const setMessages = useCallback(
    (value: DMMessage[] | ((prev: DMMessage[]) => DMMessage[])) =>
      useMessageStore.getState().setMessages<DMMessage>(cacheKey, value),
    [cacheKey],
  );
  const [isLoading, setIsLoading] = useState(() => !hasCachedMessages(cacheKey));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messageText, setMessageText, clearDraft } = useDraft(`conversation:${conversationId}`);

  // Group state
  const [isGroup, setIsGroup] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [displayName, setDisplayName] = useState(initialName);

  // Mention autocomplete
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isTypingRef = useRef(false);
  const typingEmitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scrollToBottom = useCallback((animated: boolean) => {
    programmaticScrollUntil.current = Date.now() + 350;
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  useKeyboardScrollOnShow(flatListRef, isNearBottom, scrollToBottom);

  // --- Shared hooks ---
  const { isMuted, isMuteLoading, handleToggleMute } = useMute('conversation', conversationId);
  const { handleAddReaction, handleToggleReaction, applyReactionAdded, applyReactionRemoved } =
    useReactions(user?.id, user?.displayName);
  const { selectedMessage, showActions, openActions, closeActions } =
    useMessageActions<DMMessage>();
  const { editingMessage, editText, setEditText, inputRef, startEdit, cancelEdit, saveEdit } =
    useMessageEdit<DMMessage>(conversationApi.editMessage, conversationId, setMessages);
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

  // --- Navigate to Group Info ---
  const handleGroupInfoPress = useCallback(() => {
    navigation.navigate('GroupInfo', { conversationId, groupName: displayName });
  }, [navigation, conversationId, displayName]);

  // --- Header ---
  const headerRight = useMemo(
    () => (
      <View style={headerStyles.rightContainer}>
        <TouchableOpacity
          onPress={() => navigation.navigate('PinnedMessages', { conversationId, title: displayName })}
          style={headerStyles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="pin-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        {isGroup ? (
          <TouchableOpacity
            onPress={handleGroupInfoPress}
            style={headerStyles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleToggleMute}
            style={headerStyles.iconButton}
            disabled={isMuteLoading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
              size={22}
              color={colors.text}
              style={{ opacity: isMuteLoading ? 0.4 : 1 }}
            />
          </TouchableOpacity>
        )}
      </View>
    ),
    [
      navigation,
      conversationId,
      displayName,
      isGroup,
      handleGroupInfoPress,
      handleToggleMute,
      isMuted,
      isMuteLoading,
    ],
  );

  useEffect(() => {
    navigation.setOptions({
      title: displayName,
      headerBackVisible: false,
      headerLeft: () => <StackBackButton />,
      headerTitle: isGroup
        ? () => (
            <TouchableOpacity onPress={handleGroupInfoPress} activeOpacity={0.7} style={headerStyles.titleContainer}>
              <Text style={headerStyles.titleText} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={headerStyles.subtitleText}>
                {participantCount} members
              </Text>
            </TouchableOpacity>
          )
        : undefined,
      headerRight: () => headerRight,
    });
  }, [displayName, navigation, isGroup, participantCount, handleGroupInfoPress, headerRight]);

  // --- Fetch messages ---
  const fetchMessages = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      const beforeDate = loadMore && messages.length > 0 ? messages[0].createdAt : undefined;
      const response = await conversationApi.getMessages(conversationId, 50, beforeDate);
      if (response.success) {
        if (loadMore) {
          setMessages(prev => [...response.data.messages, ...prev]);
        } else {
          const prev = (useMessageStore.getState().slices[cacheKey] as DMMessage[] | undefined) ?? [];
          setMessages(mergeMessagesById(prev, response.data.messages));
        }
        setHasMore(response.data.hasMore);
      }
    } catch (err: any) {
      if (!loadMore) {
        setError(err.message || 'Failed to load messages');
        useMessageStore.getState().clearKey(cacheKey);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId, messages, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      useActiveChatStore.getState().setActiveConversation(conversationId);
      return () => useActiveChatStore.getState().setActiveConversation(null);
    }, [conversationId]),
  );

  // --- Catch-up: refetch the latest page and merge into the cache (RT-01).
  // Background reconcile (no spinner) on re-focus / socket reconnect so DMs
  // missed during a disconnect or while away show up.
  const catchUp = useCallback(async () => {
    try {
      const response = await conversationApi.getMessages(conversationId, 50);
      if (!response.success) return;
      // Read the latest cached slice imperatively so reconciliation sees the
      // freshest messages (not a stale closure) and can compute the gap once.
      const prev = (useMessageStore.getState().slices[cacheKey] as DMMessage[] | undefined) ?? [];
      const { messages: reconciled, gap } = reconcileCatchUp(prev, response.data.messages);
      setMessages(reconciled);
      // A gap means >1 page arrived while away; re-enable "load earlier" so the
      // user can scroll up and backfill the missing range.
      if (gap) setHasMore(true);
    } catch {
      // Best-effort; live socket events and the next focus will reconcile.
    }
  }, [conversationId, cacheKey, setMessages]);

  const skipFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
      catchUp();
    }, [catchUp]),
  );

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

  // --- Initial load + socket join ---
  useEffect(() => {
    let isMounted = true;

    fetchMessages();
    joinConversation(conversationId);

    markConversationRead(conversationId);
    const markAsReadTimeout = setTimeout(async () => {
      if (!isMounted) return;
      try { await conversationApi.markAsRead(conversationId); } catch {}
    }, 500);

    // Subscribe to real-time events
    const unsubscribe = subscribeToConversationEvents({
      onNewDMMessage: (data) => {
        if (data.conversationId === conversationId && !data.message.parentMessageId) {
          // Own messages echo back here too — reconcile by clientId/id so the
          // optimistic placeholder is replaced rather than duplicated (UX-01).
          const isOwnEcho = data.message.authorId === user?.id;
          setMessages(prev => upsertMessage(prev, data.message));
          if (isOwnEcho) return;
          // onContentSizeChange snaps us to the new bottom while we're pinned there;
          // otherwise surface the unread pill instead of yanking the user down.
          if (!isNearBottom.current) setNewMessageCount(c => c + 1);
        }
      },
      onDMMessageUpdated: (data) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
        }
      },
      onDMMessageDeleted: (data) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
      },
      onReactionAdded: (data: any) => {
        if (data.conversationId === conversationId) applyReactionAdded(data, setMessages);
      },
      onReactionRemoved: (data: any) => {
        if (data.conversationId === conversationId) applyReactionRemoved(data, setMessages);
      },
      onThreadReplyAdded: (data: ThreadReplyAddedData) => {
        setMessages(prev => prev.map(msg =>
          msg.id !== data.parentMessageId ? msg : {
            ...msg, replyCount: data.replyCount, lastReplyAt: data.lastReplyAt, latestReplyAuthors: data.latestReplyAuthors,
          },
        ));
      },
      onMessagePinned: (data: MessagePinnedData) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(msg => msg.id === (data.message as DMMessage).id ? { ...msg, isPinned: true } : msg));
        }
      },
      onMessageUnpinned: (data: MessageUnpinnedData) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(msg => msg.id === data.messageId ? { ...msg, isPinned: false } : msg));
        }
      },
      onUserTyping: (data: TypingEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.some(u => u.userId === data.userId) ? prev : [...prev, { userId: data.userId, displayName: data.displayName, avatarUrl: data.avatarUrl }]);
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        const timeout = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
          typingTimeouts.current.delete(data.userId);
        }, 3000);
        typingTimeouts.current.set(data.userId, timeout);
      },
      onUserStoppedTyping: (data: TypingEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        typingTimeouts.current.delete(data.userId);
      },
    });

    return () => {
      isMounted = false;
      clearTimeout(markAsReadTimeout);
      leaveConversation(conversationId);
      unsubscribe();
      typingTimeouts.current.forEach(t => clearTimeout(t));
      typingTimeouts.current.clear();
      setTypingUsers([]);
      if (isTypingRef.current && user?.id) {
        sendDMTypingStop(conversationId, user.id);
        isTypingRef.current = false;
      }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    };
  }, [conversationId, markConversationRead]);

  // Fetch conversation details (participants, group info)
  useEffect(() => {
    (async () => {
      try {
        const response = await conversationApi.getConversation(conversationId);
        if (response.success) {
          const conv = response.data.conversation;
          setIsGroup(conv.isGroup);
          setParticipantCount(conv.participants?.length || 0);
          setDisplayName(conv.name);
          if (conv.participants) {
            setMentionUsers(
              conv.participants
                .filter((p: any) => p.userId !== user?.id)
                .map((p: any) => ({ id: p.userId, displayName: p.displayName, avatarUrl: p.avatarUrl })),
            );
          }
        }
      } catch {}
    })();
  }, [conversationId, user?.id]);

  // Subscribe to group events
  useEffect(() => {
    const unsubscribe = subscribeToGroupEvents({
      onGroupUpdated: (data: GroupUpdatedEventData) => {
        if (data.conversationId === conversationId) setDisplayName(data.displayName);
      },
      onGroupParticipantAdded: (data: GroupParticipantAddedEventData) => {
        if (data.conversationId !== conversationId) return;
        setParticipantCount(prev => prev + data.addedUsers.length);
        setMentionUsers(prev => {
          const existingIds = new Set(prev.map(u => u.id));
          const newUsers = data.addedUsers
            .filter(u => u.userId !== user?.id && !existingIds.has(u.userId))
            .map(u => ({ id: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl }));
          return [...prev, ...newUsers];
        });
      },
      onGroupParticipantLeft: (data: GroupParticipantLeftEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setParticipantCount(prev => Math.max(0, prev - 1));
        setMentionUsers(prev => prev.filter(u => u.id !== data.userId));
      },
    });
    return () => unsubscribe();
  }, [conversationId, user?.id]);

  // --- Typing emission ---
  const handleTextChange = useCallback((text: string) => {
    setMessageText(text);
    if (!user?.id) return;
    if (text.length > 0) {
      if (!isTypingRef.current) { isTypingRef.current = true; sendDMTypingStart(conversationId, user.id); }
      if (typingEmitTimeout.current) clearTimeout(typingEmitTimeout.current);
      typingEmitTimeout.current = setTimeout(() => {
        if (isTypingRef.current) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
      }, 3000);
    } else {
      if (isTypingRef.current) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    }
  }, [conversationId, user?.id, setMessageText]);

  // --- Send message ---
  const deliverDMMessage = useCallback(async (content: string, clientId: string) => {
    setMessages(prev => prev.map(m =>
      m.clientId === clientId ? { ...m, sendStatus: 'sending' as const } : m,
    ));
    try {
      const response = await conversationApi.sendMessage(conversationId, content, undefined, clientId);
      if (!response.success) throw new Error('send failed');
      setMessages(prev => upsertMessage(prev, { ...response.data.message, sendStatus: undefined }));
    } catch {
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, sendStatus: 'failed' as const } : m,
      ));
    }
  }, [conversationId, setMessages]);

  // Upload variant of deliverDMMessage (UX-01): runs the multipart upload for an
  // optimistic file message and reconciles on success. The picked files live in
  // pendingUploadsRef so a failed upload can be retried with the same clientId.
  const deliverDMUpload = useCallback(async (clientId: string) => {
    const files = pendingUploadsRef.current.get(clientId);
    if (!files || files.length === 0) return;
    // Read the caption off the optimistic row so retries reuse it without extra state.
    const slice = useMessageStore.getState().slices[cacheKey] as DMMessage[] | undefined;
    const caption = slice?.find(m => m.clientId === clientId)?.content || undefined;
    setMessages(prev => prev.map(m =>
      m.clientId === clientId ? { ...m, sendStatus: 'sending' as const } : m,
    ));
    setUploadProgressMap(prev => ({ ...prev, [clientId]: 0 }));
    try {
      const filesToUpload = files.map(f => ({ uri: f.uri, name: f.name, type: f.type }));
      const response = await uploadApi.uploadToConversation(conversationId, filesToUpload, caption, (p) =>
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
  }, [conversationId, cacheKey, setMessages]);

  const handleRetryMessage = useCallback((message: DMMessage) => {
    if (!message.clientId) return;
    if (pendingUploadsRef.current.has(message.clientId)) {
      deliverDMUpload(message.clientId);
    } else {
      deliverDMMessage(message.content, message.clientId);
    }
  }, [deliverDMMessage, deliverDMUpload]);

  const handleSendMessage = async () => {
    const content = messageText.trim();
    const hasFiles = selectedFiles.length > 0;
    if (!content && !hasFiles) return;
    if (isUploading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Stop typing
    if (isTypingRef.current && user?.id) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
    if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }

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
      const optimistic: DMMessage = {
        id: `temp-${clientId}`,
        clientId,
        sendStatus: 'sending',
        content,
        authorId: user?.id ?? '',
        authorName: user?.displayName ?? 'You',
        authorAvatar: user?.avatarUrl ?? null,
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
      deliverDMUpload(clientId);
      return;
    }

    const clientId = newClientId();
    const now = new Date().toISOString();
    const optimistic: DMMessage = {
      id: `temp-${clientId}`,
      clientId,
      sendStatus: 'sending',
      content,
      authorId: user?.id ?? '',
      authorName: user?.displayName ?? 'You',
      authorAvatar: user?.avatarUrl ?? null,
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
    deliverDMMessage(content, clientId);
  };

  // --- Delete + Pin ---
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await conversationApi.deleteMessage(conversationId, selectedMessage.id);
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
        await conversationApi.unpinMessage(conversationId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: false } : m));
      } else {
        await conversationApi.pinMessage(conversationId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: true } : m));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || `Failed to ${wasPinned ? 'unpin' : 'pin'} message`);
    }
    closeActions();
  };

  // --- Avatar tap -> profile ---
  const handleAvatarTap = useCallback(async (authorId: string, authorName: string) => {
    try {
      const res = await userApi.getSharedProgram(authorId);
      if (res.success && res.data.programId) {
        navigation.navigate('MemberProfile', { programId: res.data.programId, userId: authorId, memberName: authorName });
      } else {
        Alert.alert('Profile Unavailable', "You don't share any programs with this user.");
      }
    } catch {
      Alert.alert('Error', 'Could not load profile.');
    }
  }, [navigation]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore && messages.length > 0) fetchMessages(true);
  };

  // --- Render message ---
  const renderMessage = ({ item, index }: { item: DMMessage; index: number }) => {
    const isOwnMessage = item.authorId === user?.id;
    const showDate = shouldShowDateHeader(item.createdAt, index > 0 ? messages[index - 1].createdAt : null);
    const isEditing = editingMessage?.id === item.id;
    const isHighlighted = highlightedId === item.id;
    const showTimestamp = tappedMessageId === item.id;
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
          style={[styles.messageContainer, isOwnMessage && styles.ownMessageContainer, isEditing && styles.messageContainerEditing]}
          onPress={() => setTappedMessageId(prev => prev === item.id ? null : item.id)}
          onLongPress={() => openActions(item)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          {!isOwnMessage && (
            <TouchableOpacity onPress={() => handleAvatarTap(item.authorId, item.authorName)} activeOpacity={0.7}>
              <UserAvatar name={item.authorName} avatarUrl={item.authorAvatar} size={36} style={{ marginRight: spacing.sm }} />
            </TouchableOpacity>
          )}

          <View style={[styles.messageBubble, isOwnMessage && styles.ownMessageBubble, item.sendStatus === 'sending' && styles.messageBubbleSending]}>
            {!isOwnMessage && <Text style={styles.authorName}>{item.authorName}</Text>}
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput ref={inputRef} style={styles.editInput} value={editText} onChangeText={setEditText} multiline autoFocus />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEdit} style={styles.editButton}><Text style={styles.editButtonTextCancel}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity onPress={saveEdit} style={[styles.editButton, styles.editButtonSave]}><Text style={styles.editButtonTextSave}>Save</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {item.content ? (
                  <MarkdownText style={isOwnMessage ? styles.ownMessageContent : styles.messageContentText} mentionedUsers={mentionUsers.map(u => u.displayName)} mentionedRoles={[]} mentionEveryone={false}>
                    {item.content}
                  </MarkdownText>
                ) : null}
                {item.attachments && item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}

                {/* Inline meta badges (always visible when present) */}
                {hasMetaBadges && !showTimestamp && (
                  <View style={styles.metaBadgeRow}>
                    {item.isEdited && <Text style={[styles.metaBadge, isOwnMessage && styles.metaBadgeOwn]}>edited</Text>}
                    {item.isPinned && <Ionicons name="pin" size={10} color={isOwnMessage ? colors.textOnPrimary : colors.textMuted} style={{ marginLeft: 2 }} />}
                  </View>
                )}

                {/* Full timestamp row (tap to reveal) */}
                {showTimestamp && (
                  <View style={styles.timestampRow}>
                    <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
                      {formatMessageTime(item.createdAt, { includeDate: false })}
                      {item.isEdited && ' (edited)'}
                    </Text>
                    {item.isPinned && <Ionicons name="pin" size={12} color={isOwnMessage ? colors.textOnPrimary : colors.textMuted} style={{ marginLeft: 4 }} />}
                  </View>
                )}

                {item.reactions && item.reactions.length > 0 && (
                  <ReactionBar
                    reactions={item.reactions}
                    currentUserId={user?.id}
                    onReactionPress={(emoji, hasReacted) => handleToggleReaction(item.id, emoji, hasReacted, setMessages)}
                    onAddReaction={() => openActions(item)}
                    isOwnMessage={isOwnMessage}
                  />
                )}
                <ThreadIndicator
                  replyCount={item.replyCount ?? 0}
                  lastReplyAt={item.lastReplyAt}
                  latestReplyAuthors={item.latestReplyAuthors}
                  onPress={() => navigation.navigate('Thread', { messageId: item.id, conversationId, conversationName: displayName })}
                />
                {item.sendStatus === 'sending' && (
                  <Text style={[styles.sendStatusSending, isOwnMessage && styles.sendStatusSendingOwn]}>
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
      navigation.navigate('Thread', { messageId: item.id, conversationId, conversationName: displayName });
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

    return <SwipeableMessage onSwipeReply={handleSwipeReply}>{messageContent}</SwipeableMessage>;
  };

  // --- Loading / Error ---
  if (isLoading && messages.length === 0) return <ChatLoadingState />;
  if (error && messages.length === 0) return <ChatErrorState error={error} onRetry={() => fetchMessages()} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
        <ConnectionBanner />
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.clientId ?? item.id}
          renderItem={renderMessage}
          {...CHAT_LIST_PERF_PROPS}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.messageList}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            if (contentOffset.y < 50 && hasMore && !isLoadingMore) {
              handleLoadMore();
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
          onScrollToIndexFailed={info => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          onContentSizeChange={() => {
            if ((route.params.highlightMessageId || highlightMessageId) && !hasScrolledToHighlight.current) return;
            if (messages.length > 0 && !isLoadingMore && isNearBottom.current) scrollToBottom(false);
          }}
          ListHeaderComponent={
            isLoadingMore ? <ActivityIndicator style={styles.loadingMore} color={colors.primary} /> :
            hasMore && messages.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}><Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} /><Text style={styles.emptyText}>Start the conversation!</Text></View>
          }
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
        {selectedFiles.length > 0 && <AttachmentPreview files={selectedFiles} onRemove={removeFile} isUploading={isUploading} uploadProgress={uploadProgress} />}

        {/* Message Input */}
        {!editingMessage && (
          <View style={styles.inputWrapper}>
            <TouchableOpacity style={[styles.attachButton, isUploading && { opacity: 0.4 }]} onPress={openPicker} disabled={isUploading}>
              <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.inputFlex}>
              <MessageInput
                value={messageText}
                onChangeText={handleTextChange}
                onSend={handleSendMessage}
                placeholder={`Message ${displayName}`}
                isSending={isUploading}
                users={mentionUsers}
                roles={[]}
                includeSpecialMentions={false}
                sendButtonText="Send"
                maxLength={2000}
                canSendOverride={selectedFiles.length > 0 ? true : undefined}
              />
            </View>
          </View>
        )}

        <AttachmentPicker visible={showPicker} onClose={closePicker} onFilesSelected={addFiles} maxFiles={5} currentFileCount={selectedFiles.length} />
      </KeyboardAvoidingView>

      {/* Unified Message Actions */}
      <MessageActions
        visible={showActions}
        onClose={closeActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.authorId === user?.id}
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
          navigation.navigate('Thread', { messageId: threadMessageId, conversationId, conversationName: displayName });
        } : undefined}
        onForward={selectedMessage ? () => {
          openForwardPicker(
            navigation,
            selectedMessage,
            selectedMessage.authorName,
            { conversationId },
          );
        } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  messageList: { paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  loadingMore: { padding: spacing.md },
  loadMoreButton: { padding: spacing.md, alignItems: 'center' },
  loadMoreText: { color: colors.primary, fontSize: typography.fontSize.sm },

  // Date header
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { marginHorizontal: spacing.md, fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium },

  // Message
  messageContainer: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-end' },
  ownMessageContainer: { justifyContent: 'flex-end' },
  messageContainerEditing: { backgroundColor: colors.primary + '10', padding: spacing.xs, borderRadius: borderRadius.md },
  messageBubble: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '80%', borderBottomLeftRadius: borderRadius.sm },
  ownMessageBubble: { backgroundColor: colors.primary, borderBottomLeftRadius: borderRadius.lg, borderBottomRightRadius: borderRadius.sm },
  messageBubbleSending: { opacity: 0.6 },
  sendStatusSending: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2, alignSelf: 'flex-end' },
  sendStatusSendingOwn: { color: colors.white, opacity: 0.85 },
  sendStatusFailed: { fontSize: typography.fontSize.xs, color: colors.error, marginTop: 2, alignSelf: 'flex-end' },
  authorName: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.primary, marginBottom: 2 },
  messageContentText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 20 },
  ownMessageContent: { fontSize: typography.fontSize.md, color: colors.white, lineHeight: 20 },
  metaBadgeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  metaBadge: { fontSize: typography.fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  metaBadgeOwn: { color: colors.textOnPrimary },
  timestampRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  timestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted },
  ownTimestamp: { color: colors.textOnPrimary },

  // Edit
  editContainer: { flex: 1 },
  editInput: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: typography.fontSize.md, color: colors.text, minHeight: 40, maxHeight: 100 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs, gap: spacing.sm },
  editButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  editButtonSave: { backgroundColor: colors.primary },
  editButtonTextCancel: { color: colors.textMuted, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  editButtonTextSave: { color: colors.white, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyText: { fontSize: typography.fontSize.md, color: colors.textMuted },

  // Input area
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  attachButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs, marginBottom: spacing.xs },
  inputFlex: { flex: 1 },
});

// Header styles (extracted from inline)
const headerStyles = StyleSheet.create({
  titleContainer: { alignItems: 'center', maxWidth: 200 },
  titleText: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text },
  subtitleText: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 1 },
  rightContainer: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { paddingHorizontal: 8, paddingVertical: 6 },
});
