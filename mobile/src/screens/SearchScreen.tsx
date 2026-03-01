/**
 * Search Screen — Universal Search
 *
 * Searches messages, channels, and people from a single bar.
 * "All" scope shows sectioned results; specific scopes show flat lists.
 * Matches the app's dark theme with Ionicons throughout.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Alert,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { searchApi, userApi } from '../services/api';
import { SearchResult, ChannelSearchResult } from '../types';
import { navigationRef } from '../services/navigationRef';
import UserAvatar from '../components/UserAvatar';

// ─── Constants ────────────────────────────────────────────
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;
const CHANNEL_LIMIT = 5;
const PEOPLE_LIMIT = 5;

type Scope = 'all' | 'channels' | 'people' | 'dms';
type UserResult = { id: string; displayName: string; email: string; avatarUrl: string | null };

const SCOPE_OPTIONS: { key: Scope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'channels', label: 'Channels', icon: 'chatbox-outline' },
  { key: 'people', label: 'People', icon: 'people-outline' },
  { key: 'dms', label: 'DMs', icon: 'mail-outline' },
];

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ─── State ──────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [messageResults, setMessageResults] = useState<SearchResult[]>([]);
  const [channelResults, setChannelResults] = useState<ChannelSearchResult[]>([]);
  const [peopleResults, setPeopleResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const currentQuery = useRef('');
  const currentScope = useRef<Scope>('all');

  // Auto-focus on mount + cleanup debounce timer
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => {
      clearTimeout(timer);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ─── Search Logic ───────────────────────────────────────

  const performSearch = useCallback(async (searchQuery: string, searchScope: Scope, offset = 0) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      if (offset === 0) {
        setMessageResults([]);
        setChannelResults([]);
        setPeopleResults([]);
        setHasSearched(false);
        setHasMore(false);
      }
      return;
    }

    if (offset === 0) setIsLoading(true);
    else setIsLoadingMore(true);
    setError(null);

    try {
      // Determine what to fetch based on scope
      const fetchMessages = searchScope === 'all' || searchScope === 'channels' || searchScope === 'dms';
      const fetchChannels = searchScope === 'all' || searchScope === 'channels';
      const fetchPeople = searchScope === 'all' || searchScope === 'people';

      const promises: Promise<any>[] = [];

      // Messages
      if (searchScope === 'all' || searchScope === 'dms') {
        const msgScope: 'all' | 'channels' | 'dms' = searchScope === 'all' ? 'all' : 'dms';
        promises.push(
          searchApi.searchMessages({
            query: trimmed,
            scope: msgScope,
            limit: PAGE_SIZE,
            offset,
          })
        );
      } else if (searchScope === 'channels') {
        // Scope=channels means search channel messages
        promises.push(
          searchApi.searchMessages({
            query: trimmed,
            scope: 'channels',
            limit: PAGE_SIZE,
            offset,
          })
        );
      } else {
        promises.push(Promise.resolve(null));
      }

      // Channels (name search, only on first page)
      if (fetchChannels && offset === 0) {
        promises.push(
          searchApi.searchChannels(trimmed, searchScope === 'channels' ? 20 : CHANNEL_LIMIT)
        );
      } else {
        promises.push(Promise.resolve(null));
      }

      // People (only on first page)
      if (fetchPeople && offset === 0) {
        promises.push(
          userApi.searchUsers(trimmed)
        );
      } else {
        promises.push(Promise.resolve(null));
      }

      const [msgRes, chRes, pplRes] = await Promise.all(promises);

      // Guard against stale results
      if (trimmed !== currentQuery.current || searchScope !== currentScope.current) return;

      // Messages
      if (msgRes?.success && msgRes.data) {
        if (offset === 0) {
          setMessageResults(msgRes.data.results);
        } else {
          setMessageResults(prev => [...prev, ...msgRes.data.results]);
        }
        setHasMore(msgRes.data.hasMore);
      } else if (searchScope === 'people') {
        // People-only scope has no messages
        setMessageResults([]);
        setHasMore(false);
      }

      // Channels
      if (chRes?.success && chRes.data && offset === 0) {
        setChannelResults(chRes.data.channels || []);
      }

      // People
      if (pplRes?.success && pplRes.data && offset === 0) {
        const users = pplRes.data.users || [];
        setPeopleResults(searchScope === 'people' ? users : users.slice(0, PEOPLE_LIMIT));
      }

      setHasSearched(true);
    } catch (err: any) {
      if (trimmed === currentQuery.current) {
        setError(err.message || 'Search failed');
        if (offset === 0) {
          setMessageResults([]);
          setChannelResults([]);
          setPeopleResults([]);
        }
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    currentQuery.current = text.trim();

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.trim().length < 2) {
      setMessageResults([]);
      setChannelResults([]);
      setPeopleResults([]);
      setHasSearched(false);
      setHasMore(false);
      setError(null);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      performSearch(text, scope);
    }, DEBOUNCE_MS);
  }, [scope, performSearch]);

  const handleScopeChange = useCallback((newScope: Scope) => {
    setScope(newScope);
    currentScope.current = newScope;
    // Reset results for scope change
    setMessageResults([]);
    setChannelResults([]);
    setPeopleResults([]);
    setHasMore(false);
    if (query.trim().length >= 2) {
      performSearch(query, newScope);
    }
  }, [query, performSearch]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && query.trim().length >= 2) {
      performSearch(query, scope, messageResults.length);
    }
  }, [isLoadingMore, hasMore, query, scope, messageResults.length, performSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    currentQuery.current = '';
    setMessageResults([]);
    setChannelResults([]);
    setPeopleResults([]);
    setHasSearched(false);
    setHasMore(false);
    setError(null);
    inputRef.current?.focus();
  }, []);

  // ─── Navigation Handlers ────────────────────────────────

  const handleMessagePress = useCallback((result: SearchResult) => {
    Keyboard.dismiss();
    if (!navigationRef.isReady()) return;

    if (result.context.type === 'channel') {
      const channelParams = {
        channelId: result.context.channelId,
        channelName: result.context.channelName,
        programId: result.context.programId,
      };

      if (result.parentMessageId) {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 3,
            routes: [
              { name: 'Main' },
              { name: 'ProgramDetail', params: { programId: result.context.programId } },
              { name: 'Channel', params: channelParams },
              { name: 'Thread', params: { messageId: result.parentMessageId, channelId: result.context.channelId, channelName: result.context.channelName } },
            ],
          })
        );
      } else {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 2,
            routes: [
              { name: 'Main' },
              { name: 'ProgramDetail', params: { programId: result.context.programId } },
              { name: 'Channel', params: { ...channelParams, highlightMessageId: result.id } },
            ],
          })
        );
      }
    } else {
      const conversationParams = {
        conversationId: result.context.conversationId,
        name: result.context.conversationName,
      };

      if (result.parentMessageId) {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 2,
            routes: [
              { name: 'Main' },
              { name: 'Conversation', params: conversationParams },
              { name: 'Thread', params: { messageId: result.parentMessageId, conversationId: result.context.conversationId, conversationName: result.context.conversationName } },
            ],
          })
        );
      } else {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              { name: 'Conversation', params: { ...conversationParams, highlightMessageId: result.id } },
            ],
          })
        );
      }
    }
  }, []);

  const handleChannelPress = useCallback((channel: ChannelSearchResult) => {
    Keyboard.dismiss();
    if (!navigationRef.isReady()) return;

    navigationRef.dispatch(
      CommonActions.reset({
        index: 2,
        routes: [
          { name: 'Main' },
          { name: 'ProgramDetail', params: { programId: channel.programId } },
          { name: 'Channel', params: { channelId: channel.id, channelName: channel.name, programId: channel.programId } },
        ],
      })
    );
  }, []);

  const handlePersonPress = useCallback(async (person: UserResult) => {
    Keyboard.dismiss();
    try {
      const res = await userApi.getSharedProgram(person.id);
      if (res.success && res.data.programId) {
        navigation.navigate('MemberProfile', {
          programId: res.data.programId,
          userId: person.id,
          memberName: person.displayName,
        });
      } else {
        Alert.alert('Profile Unavailable', "You don't share any programs with this user.");
      }
    } catch {
      Alert.alert('Error', 'Could not load profile.');
    }
  }, [navigation]);

  // ─── Helpers ────────────────────────────────────────────

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const highlightText = (content: string, searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) return <Text style={styles.msgContent}>{content}</Text>;

    const trimmedQuery = searchQuery.trim();
    const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const splitRegex = new RegExp(`(${escaped})`, 'gi');
    const queryLower = trimmedQuery.toLowerCase();

    const matchIndex = content.toLowerCase().indexOf(queryLower);
    let displayContent = content;
    const MAX_LEN = 150;

    if (content.length > MAX_LEN && matchIndex >= 0) {
      const start = Math.max(0, matchIndex - 40);
      const end = Math.min(content.length, matchIndex + trimmedQuery.length + 80);
      displayContent = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
    } else if (content.length > MAX_LEN) {
      displayContent = content.slice(0, MAX_LEN) + '…';
    }

    const parts = displayContent.split(splitRegex);

    return (
      <Text style={styles.msgContent}>
        {parts.map((part, i) =>
          part.toLowerCase() === queryLower
            ? <Text key={i} style={styles.highlight}>{part}</Text>
            : <Text key={i}>{part}</Text>
        )}
      </Text>
    );
  };

  // ─── Determine total result count (for empty state) ─────
  const totalResults = channelResults.length + peopleResults.length + messageResults.length;

  // ─── Render Pieces ──────────────────────────────────────

  // Search bar
  const renderSearchBar = () => (
    <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchBarIcon} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search messages, channels, people…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Filter chips
  const renderChips = () => (
    <View style={styles.chipRow}>
      {SCOPE_OPTIONS.map(opt => {
        const active = scope === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => handleScopeChange(opt.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={opt.icon}
              size={14}
              color={active ? colors.white : colors.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ─── Section: Channel Results ───────────────────────────

  const renderChannelItem = (channel: ChannelSearchResult) => (
    <TouchableOpacity
      key={channel.id}
      style={styles.channelItem}
      onPress={() => handleChannelPress(channel)}
      activeOpacity={0.7}
    >
      <View style={styles.channelIconWrap}>
        <Ionicons
          name={channel.isPrivate ? 'lock-closed' : channel.type === 'ANNOUNCEMENT' ? 'megaphone' : 'chatbox'}
          size={16}
          color={colors.textSecondary}
        />
      </View>
      <View style={styles.channelTextWrap}>
        <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
        <Text style={styles.channelProgram} numberOfLines={1}>{channel.programName}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );

  // ─── Section: People Results ────────────────────────────

  const renderPersonItem = (person: UserResult) => (
    <TouchableOpacity
      key={person.id}
      style={styles.personItem}
      onPress={() => handlePersonPress(person)}
      activeOpacity={0.7}
    >
      <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} size={36} />
      <View style={styles.personTextWrap}>
        <Text style={styles.personName} numberOfLines={1}>{person.displayName}</Text>
        <Text style={styles.personEmail} numberOfLines={1}>{person.email}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );

  // ─── Section: Message Results ───────────────────────────

  const renderMessageItem = (item: SearchResult) => {
    const isChannel = item.context.type === 'channel';

    return (
      <TouchableOpacity
        style={styles.msgItem}
        onPress={() => handleMessagePress(item)}
        activeOpacity={0.7}
      >
        {/* Context line */}
        <View style={styles.msgContextRow}>
          <Ionicons
            name={isChannel ? 'chatbox-outline' : 'mail-outline'}
            size={12}
            color={colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.msgContextText} numberOfLines={1}>
            {item.context.type === 'channel'
              ? `#${item.context.channelName}  ·  ${item.context.programName}`
              : item.context.type === 'dm'
              ? item.context.conversationName
              : ''}
          </Text>
          <Text style={styles.msgTime}>{formatTime(item.createdAt)}</Text>
        </View>

        {/* Author + content */}
        <View style={styles.msgBody}>
          <UserAvatar
            name={item.author.displayName}
            avatarUrl={item.author.avatarUrl}
            size={30}
          />
          <View style={styles.msgTextWrap}>
            <Text style={styles.msgAuthor}>{item.author.displayName}</Text>
            {highlightText(item.content, query)}
            {item.isEdited && <Text style={styles.msgEdited}>(edited)</Text>}
            {item.parentMessageId && (
              <View style={styles.threadChip}>
                <Ionicons name="chatbubble-outline" size={10} color={colors.primary} />
                <Text style={styles.threadChipText}>Thread reply</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Sectioned "All" View ──────────────────────────────

  const renderSectionedAll = () => {
    if (isLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateSubtitle}>Searching…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Search failed</Text>
          <Text style={styles.stateSubtitle}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => performSearch(query, scope, 0)}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.white} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!hasSearched) {
      return renderInitialState();
    }

    if (totalResults === 0) {
      return (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={48} color={colors.textMuted} />
          <Text style={styles.stateTitle}>No results</Text>
          <Text style={styles.stateSubtitle}>Try a different search term or filter.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={[1]} // single item wrapper to enable scroll
        renderItem={() => (
          <View>
            {/* Channels section */}
            {channelResults.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="chatbox-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sectionTitle}>Channels</Text>
                  <Text style={styles.sectionCount}>{channelResults.length}</Text>
                  {channelResults.length >= CHANNEL_LIMIT && (
                    <TouchableOpacity onPress={() => handleScopeChange('channels')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.seeAll}>See all</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {channelResults.map(renderChannelItem)}
              </View>
            )}

            {/* People section */}
            {peopleResults.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sectionTitle}>People</Text>
                  <Text style={styles.sectionCount}>{peopleResults.length}</Text>
                  {peopleResults.length >= PEOPLE_LIMIT && (
                    <TouchableOpacity onPress={() => handleScopeChange('people')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.seeAll}>See all</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {peopleResults.map(renderPersonItem)}
              </View>
            )}

            {/* Messages section */}
            {messageResults.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sectionTitle}>Messages</Text>
                  <Text style={styles.sectionCount}>{messageResults.length}{hasMore ? '+' : ''}</Text>
                </View>
                {messageResults.map(item => (
                  <View key={item.id}>{renderMessageItem(item)}</View>
                ))}
                {hasMore && (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                    {isLoadingMore
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Text style={styles.loadMoreText}>Load more messages</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
        keyExtractor={() => 'all-sections'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
    );
  };

  // ─── Flat List Views (specific scopes) ──────────────────

  const renderFlatChannels = () => {
    if (isLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateSubtitle}>Searching…</Text>
        </View>
      );
    }

    // "Channels" scope shows both channel name matches AND channel message matches
    const hasChannelNames = channelResults.length > 0;
    const hasMessages = messageResults.length > 0;

    if (!hasSearched) return renderInitialState();
    if (!hasChannelNames && !hasMessages) return renderNoResults();

    return (
      <FlatList
        data={[1]}
        renderItem={() => (
          <View>
            {hasChannelNames && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="chatbox-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sectionTitle}>Channel Names</Text>
                  <Text style={styles.sectionCount}>{channelResults.length}</Text>
                </View>
                {channelResults.map(renderChannelItem)}
              </View>
            )}
            {hasMessages && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sectionTitle}>Channel Messages</Text>
                  <Text style={styles.sectionCount}>{messageResults.length}{hasMore ? '+' : ''}</Text>
                </View>
                {messageResults.map(item => (
                  <View key={item.id}>{renderMessageItem(item)}</View>
                ))}
                {hasMore && (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                    {isLoadingMore
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Text style={styles.loadMoreText}>Load more messages</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
        keyExtractor={() => 'channels-flat'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
    );
  };

  const renderFlatPeople = () => {
    if (isLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateSubtitle}>Searching…</Text>
        </View>
      );
    }
    if (!hasSearched) return renderInitialState();
    if (peopleResults.length === 0) return renderNoResults();

    return (
      <FlatList
        data={peopleResults}
        renderItem={({ item }) => renderPersonItem(item)}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
    );
  };

  const renderFlatDMs = () => {
    if (isLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateSubtitle}>Searching…</Text>
        </View>
      );
    }
    if (!hasSearched) return renderInitialState();
    if (messageResults.length === 0) return renderNoResults();

    return (
      <FlatList
        data={messageResults}
        renderItem={({ item }) => renderMessageItem(item)}
        keyExtractor={item => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore
            ? <View style={styles.loadMoreBtn}><ActivityIndicator size="small" color={colors.primary} /></View>
            : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
    );
  };

  // ─── Empty / Initial States ─────────────────────────────

  const renderInitialState = () => (
    <View style={styles.centerState}>
      <Ionicons name="search" size={52} color={colors.textMuted} />
      <Text style={styles.stateTitle}>Search everything</Text>
      <Text style={styles.stateSubtitle}>
        Find messages, channels, and people{'\n'}across all your programs.
      </Text>
    </View>
  );

  const renderNoResults = () => (
    <View style={styles.centerState}>
      <Ionicons name="file-tray-outline" size={48} color={colors.textMuted} />
      <Text style={styles.stateTitle}>No results</Text>
      <Text style={styles.stateSubtitle}>Try a different search term or filter.</Text>
    </View>
  );

  // ─── Main Render ────────────────────────────────────────

  return (
    <View style={styles.container}>
      {renderSearchBar()}
      {renderChips()}

      {scope === 'all' && renderSectionedAll()}
      {scope === 'channels' && renderFlatChannels()}
      {scope === 'people' && renderFlatPeople()}
      {scope === 'dms' && renderFlatDMs()}
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header / Search Bar ──────────────────────
  header: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  searchBarIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.text,
    padding: 0,
  },
  clearBtn: {
    marginLeft: spacing.xs,
    padding: 2,
  },

  // ── Filter Chips ─────────────────────────────
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500' as const,
  },
  chipTextActive: {
    color: colors.white,
  },

  // ── Sections ─────────────────────────────────
  section: {
    paddingTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 6,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600' as const,
  },
  seeAll: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600' as const,
    marginLeft: spacing.sm,
  },

  // ── Channel Results ──────────────────────────
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: spacing.md,
    marginBottom: 1,
  },
  channelIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  channelTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  channelName: {
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    color: colors.text,
  },
  channelProgram: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },

  // ── People Results ───────────────────────────
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: spacing.md,
    marginBottom: 1,
  },
  personTextWrap: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  personName: {
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    color: colors.text,
  },
  personEmail: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },

  // ── Message Results ──────────────────────────
  msgItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  msgContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  msgContextText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500' as const,
  },
  msgTime: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  msgBody: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  msgTextWrap: {
    flex: 1,
  },
  msgAuthor: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 2,
  },
  msgContent: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  highlight: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    color: colors.text,
    fontWeight: '600' as const,
  },
  msgEdited: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  threadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  threadChipText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: '500' as const,
  },

  // ── Load More ────────────────────────────────
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadMoreText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600' as const,
  },

  // ── Empty / Center States ────────────────────
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  stateTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  stateSubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  retryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
});
