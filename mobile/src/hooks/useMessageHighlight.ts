/**
 * useMessageHighlight — shared scroll-to-highlight logic
 *
 * Used by ChannelScreen and ConversationScreen when navigating from
 * search results or pinned messages with a highlightMessageId param.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList } from 'react-native';

interface UseMessageHighlightOptions {
  messages: { id: string }[];
  flatListRef: React.RefObject<FlatList>;
  highlightMessageId: string | undefined;
  routeHighlightMessageId: string | undefined;
  isLoading: boolean;
}

export function useMessageHighlight({
  messages,
  flatListRef,
  highlightMessageId,
  routeHighlightMessageId,
  isLoading,
}: UseMessageHighlightOptions) {
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [highlightedId, setHighlightedId] = useState<string | null>(
    highlightMessageId || null,
  );
  const hasScrolledToHighlight = useRef(false);
  const prevHighlightRef = useRef(highlightMessageId);

  // Track active timers/animations for cleanup
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Re-trigger highlight when the param changes (e.g. tapping a second pinned message)
  useEffect(() => {
    if (
      routeHighlightMessageId &&
      routeHighlightMessageId !== prevHighlightRef.current
    ) {
      prevHighlightRef.current = routeHighlightMessageId;
      hasScrolledToHighlight.current = false;
      setHighlightedId(routeHighlightMessageId);
    }
  }, [routeHighlightMessageId]);

  // Scroll to and animate the highlight
  const activeHighlightId = routeHighlightMessageId || highlightMessageId;
  useEffect(() => {
    if (
      !activeHighlightId ||
      hasScrolledToHighlight.current ||
      messages.length === 0 ||
      isLoading
    )
      return;

    const messageIndex = messages.findIndex(m => m.id === activeHighlightId);
    if (messageIndex >= 0) {
      hasScrolledToHighlight.current = true;

      scrollTimerRef.current = setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: messageIndex,
          animated: true,
          viewPosition: 0.3,
        });
        highlightAnim.setValue(1);
        const anim = Animated.timing(highlightAnim, {
          toValue: 0,
          duration: 2000,
          delay: 500,
          useNativeDriver: false,
        });
        activeAnimRef.current = anim;
        anim.start(({ finished }) => {
          if (finished) setHighlightedId(null);
          activeAnimRef.current = null;
        });
      }, 400);
    } else {
      // Message not loaded — fall back to scrolling to bottom
      hasScrolledToHighlight.current = true;
      fallbackTimerRef.current = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }

    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (activeAnimRef.current) activeAnimRef.current.stop();
    };
  }, [messages, activeHighlightId, isLoading, highlightAnim, flatListRef]);

  return {
    highlightedId,
    highlightAnim,
    hasScrolledToHighlight,
  };
}
