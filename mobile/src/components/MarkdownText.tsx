/**
 * MarkdownText Component
 * Parses and renders markdown-style formatting in messages
 * 
 * Supported syntax:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - ~~strikethrough~~
 * - `inline code`
 * - ```code block```
 * - > blockquote
 * - @mentions (highlighted)
 */

import React, { useMemo } from 'react';
import { Text, TextStyle, View, StyleSheet, Platform } from 'react-native';
import { colors, typography } from '../constants/theme';

const MONOSPACE_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface MarkdownTextProps {
  children: string;
  style?: TextStyle;
  mentionedUsers?: string[];
  mentionedRoles?: string[];
  mentionEveryone?: boolean;
  onMentionPress?: (type: 'user' | 'role' | 'everyone', id?: string) => void;
}

interface TextSegment {
  type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'code' | 'codeblock' | 'mention';
  content: string;
  mentionType?: 'user' | 'role' | 'everyone' | 'here';
}

export default function MarkdownText({
  children,
  style,
  mentionedUsers = [],
  mentionedRoles = [],
  mentionEveryone = false,
  onMentionPress,
}: MarkdownTextProps) {
  // Create a set of valid mention names for quick lookup
  const validMentions = useMemo(() => {
    const set = new Set<string>();
    // Add @everyone and @here as always valid
    set.add('everyone');
    set.add('here');
    // Add user names (normalize by replacing spaces with non-breaking space)
    mentionedUsers.forEach(name => {
      set.add(name.toLowerCase());
      set.add(name.toLowerCase().replace(/ /g, '\u00A0'));
    });
    // Add role names
    mentionedRoles.forEach(name => {
      set.add(name.toLowerCase());
      set.add(name.toLowerCase().replace(/ /g, '\u00A0'));
    });
    return set;
  }, [mentionedUsers, mentionedRoles]);

  const segments = useMemo(() => parseMarkdown(children, validMentions), [children, validMentions]);

  const renderSegment = (segment: TextSegment, index: number) => {
    switch (segment.type) {
      case 'bold':
        return (
          <Text key={index} style={styles.bold}>
            {segment.content}
          </Text>
        );
      case 'italic':
        return (
          <Text key={index} style={styles.italic}>
            {segment.content}
          </Text>
        );
      case 'strikethrough':
        return (
          <Text key={index} style={styles.strikethrough}>
            {segment.content}
          </Text>
        );
      case 'code':
        return (
          <Text key={index} style={styles.inlineCode}>
            {segment.content}
          </Text>
        );
      case 'codeblock':
        return (
          <View key={index} style={styles.codeBlock}>
            <Text style={styles.codeBlockText}>{segment.content}</Text>
          </View>
        );
      case 'mention':
        // Convert non-breaking spaces back to regular spaces for display
        const displayContent = segment.content.replace(/\u00A0/g, ' ');
        return (
          <Text
            key={index}
            style={styles.mention}
            onPress={() => {
              if (onMentionPress && segment.mentionType) {
                onMentionPress(
                  segment.mentionType === 'here' ? 'everyone' : segment.mentionType,
                  displayContent.replace('@', '')
                );
              }
            }}
          >
            {displayContent}
          </Text>
        );
      default:
        return <Text key={index}>{segment.content}</Text>;
    }
  };

  // Check if content contains code blocks (need special handling)
  const hasCodeBlocks = segments.some(s => s.type === 'codeblock');

  if (hasCodeBlocks) {
    // Render with Views for code blocks
    return (
      <View>
        {segments.map((segment, index) => {
          if (segment.type === 'codeblock') {
            return renderSegment(segment, index);
          }
          return (
            <Text key={index} style={[styles.text, style]}>
              {renderSegment(segment, index)}
            </Text>
          );
        })}
      </View>
    );
  }

  return (
    <Text style={[styles.text, style]}>
      {segments.map(renderSegment)}
    </Text>
  );
}

function parseMarkdown(text: string, validMentions: Set<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  
  // Check for code blocks first (```...```)
  const codeBlockRegex = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  
  const parts: { start: number; end: number; content: string; isCodeBlock: boolean }[] = [];
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        start: lastIndex,
        end: match.index,
        content: text.slice(lastIndex, match.index),
        isCodeBlock: false,
      });
    }
    parts.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1].trim(),
      isCodeBlock: true,
    });
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push({
      start: lastIndex,
      end: text.length,
      content: text.slice(lastIndex),
      isCodeBlock: false,
    });
  }
  
  // If no parts, treat entire text as regular
  if (parts.length === 0) {
    parts.push({ start: 0, end: text.length, content: text, isCodeBlock: false });
  }
  
  for (const part of parts) {
    if (part.isCodeBlock) {
      segments.push({ type: 'codeblock', content: part.content });
    } else {
      segments.push(...parseInlineMarkdown(part.content, validMentions));
    }
  }
  
  return segments;
}

function parseInlineMarkdown(text: string, validMentions: Set<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  
  // Combined regex for all inline patterns (excluding mentions - handled separately)
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, type: 'bold' as const },           // **bold**
    { regex: /__(.+?)__/g, type: 'bold' as const },               // __bold__
    { regex: /\*(.+?)\*/g, type: 'italic' as const },             // *italic*
    { regex: /_(.+?)_/g, type: 'italic' as const },               // _italic_
    { regex: /~~(.+?)~~/g, type: 'strikethrough' as const },      // ~~strikethrough~~
    { regex: /`([^`]+)`/g, type: 'code' as const },               // `code`
  ];
  
  // Mention regex - matches @ followed by word chars and non-breaking spaces
  const mentionRegex = /@([\w\u00A0]+)/g;
  
  // Simple approach: process text sequentially
  let remaining = text;
  let result: TextSegment[] = [];
  
  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; content: string; type: TextSegment['type']; mentionType?: TextSegment['mentionType'] } | null = null;
    
    // Check formatting patterns
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(remaining);
      if (match && (!earliestMatch || match.index < earliestMatch.index)) {
        earliestMatch = {
          index: match.index,
          length: match[0].length,
          content: match[1],
          type: pattern.type,
        };
      }
    }
    
    // Check for mentions - only highlight if it's a valid mention
    mentionRegex.lastIndex = 0;
    const mentionMatch = mentionRegex.exec(remaining);
    if (mentionMatch && (!earliestMatch || mentionMatch.index < earliestMatch.index)) {
      const mentionName = mentionMatch[1];
      const isValid = validMentions.has(mentionName.toLowerCase());
      
      if (isValid) {
        // Valid mention - highlight it
        earliestMatch = {
          index: mentionMatch.index,
          length: mentionMatch[0].length,
          content: mentionMatch[0],
          type: 'mention',
          mentionType: (mentionName === 'everyone' || mentionName === 'here') ? 'everyone' : 'user',
        };
      } else if (!earliestMatch || mentionMatch.index < earliestMatch.index) {
        // Invalid mention - treat as plain text, but we need to skip past the @ to avoid infinite loop
        // Only set this if there's no other match before it
        if (!earliestMatch) {
          // Add the @ as plain text and continue from after it
          if (mentionMatch.index > 0) {
            result.push({ type: 'text', content: remaining.slice(0, mentionMatch.index + 1) });
          } else {
            result.push({ type: 'text', content: '@' });
          }
          remaining = remaining.slice(mentionMatch.index + 1);
          continue;
        }
      }
    }
    
    if (earliestMatch) {
      // Add text before the match
      if (earliestMatch.index > 0) {
        result.push({ type: 'text', content: remaining.slice(0, earliestMatch.index) });
      }
      // Add the formatted segment
      result.push({
        type: earliestMatch.type,
        content: earliestMatch.content,
        mentionType: earliestMatch.mentionType,
      });
      remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
    } else {
      // No more matches, add remaining text
      result.push({ type: 'text', content: remaining });
      break;
    }
  }
  
  return result;
}

const styles = StyleSheet.create({
  text: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: MONOSPACE_FONT,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    fontSize: typography.fontSize.sm,
    color: colors.primary,
  },
  codeBlock: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 6,
    marginVertical: 4,
  },
  codeBlockText: {
    fontFamily: MONOSPACE_FONT,
    fontSize: typography.fontSize.sm,
    color: colors.text,
  },
  mention: {
    color: colors.primary,
    fontWeight: '600',
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 2,
    borderRadius: 3,
  },
});
