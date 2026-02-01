/**
 * MarkdownText Component
 * Parses and renders markdown-style formatting in messages
 * 
 * Supported syntax:
 * - **bold** or *bold*
 * - _italic_ or *italic* (single asterisk when not bold)
 * - ~~strikethrough~~
 * - `inline code`
 * - ```code block```
 * - > blockquote
 * - @mentions (highlighted)
 */

import React, { useMemo } from 'react';
import { Text, TextStyle, View, StyleSheet } from 'react-native';
import { colors, typography } from '../constants/theme';

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
  const segments = useMemo(() => parseMarkdown(children), [children]);

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
        return (
          <Text
            key={index}
            style={styles.mention}
            onPress={() => {
              if (onMentionPress && segment.mentionType) {
                onMentionPress(
                  segment.mentionType === 'here' ? 'everyone' : segment.mentionType,
                  segment.content.replace('@', '')
                );
              }
            }}
          >
            {segment.content}
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

function parseMarkdown(text: string): TextSegment[] {
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
      segments.push(...parseInlineMarkdown(part.content));
    }
  }
  
  return segments;
}

function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  
  // Combined regex for all inline patterns
  // Order matters: more specific patterns first
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, type: 'bold' as const },           // **bold**
    { regex: /\*(.+?)\*/g, type: 'bold' as const },               // *bold* (Discord style)
    { regex: /__(.+?)__/g, type: 'italic' as const },             // __italic__ 
    { regex: /_(.+?)_/g, type: 'italic' as const },               // _italic_
    { regex: /~~(.+?)~~/g, type: 'strikethrough' as const },      // ~~strikethrough~~
    { regex: /`([^`]+)`/g, type: 'code' as const },               // `code`
    { regex: /@(everyone|here)\b/g, type: 'mention' as const, mentionType: 'everyone' as const },
    { regex: /@(\w+)/g, type: 'mention' as const, mentionType: 'user' as const },
  ];
  
  // Simple approach: process text sequentially
  let remaining = text;
  let result: TextSegment[] = [];
  
  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; content: string; type: TextSegment['type']; mentionType?: TextSegment['mentionType'] } | null = null;
    
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(remaining);
      if (match && (!earliestMatch || match.index < earliestMatch.index)) {
        earliestMatch = {
          index: match.index,
          length: match[0].length,
          content: pattern.type === 'mention' ? match[0] : match[1],
          type: pattern.type,
          mentionType: pattern.type === 'mention' 
            ? (match[1] === 'everyone' || match[1] === 'here' ? 'everyone' : 'user')
            : undefined,
        };
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
    fontFamily: 'Courier',
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
    fontFamily: 'Courier',
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
