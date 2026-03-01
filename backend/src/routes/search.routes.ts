/**
 * Search Routes
 * Handles universal search: messages, channels, and users
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/search/messages
 * Search messages across all accessible channels and conversations.
 * 
 * Query params:
 *   q        - Search query (required, min 2 chars)
 *   scope    - "all" | "channels" | "dms" (default: "all")
 *   limit    - Results per page (default: 20, max: 50)
 *   offset   - Pagination offset (default: 0)
 *   programId - Filter to a specific program's channels (optional)
 * 
 * Access control:
 *   - Channel messages: only from programs the user is a member of
 *   - DM messages: only from conversations the user participates in
 *   - Private channels: only if user has access (admin/owner or has override)
 * 
 * Returns messages with context: author, channel/conversation info, timestamps
 */
router.get('/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      q,
      scope = 'all',
      limit = '20',
      offset = '0',
      programId,
    } = req.query;

    // Validate query
    const query = (q as string || '').trim();
    if (!query || query.length < 2) {
      throw new BadRequestError('Search query must be at least 2 characters');
    }

    const take = Math.min(parseInt(limit as string, 10) || 20, 50);
    const skip = Math.max(parseInt(offset as string, 10) || 0, 0);
    const searchScope = scope as string;

    if (!['all', 'channels', 'dms'].includes(searchScope)) {
      throw new BadRequestError('Scope must be "all", "channels", or "dms"');
    }

    const results: SearchResult[] = [];

    // ============================================
    // SEARCH CHANNEL MESSAGES
    // ============================================
    if (searchScope === 'all' || searchScope === 'channels') {
      // Get all programs the user is a member of
      const memberships = await prisma.programMembership.findMany({
        where: { userId },
        select: { programId: true },
      });
      const memberProgramIds = memberships.map(m => m.programId);

      // Apply optional programId filter
      const targetProgramIds = programId
        ? memberProgramIds.filter(id => id === programId)
        : memberProgramIds;

      if (targetProgramIds.length > 0) {
        // Get accessible channels:
        // 1. Public channels in member programs
        // 2. Private channels where user has override OR user is admin/owner
        const accessibleChannels = await prisma.channel.findMany({
          where: {
            programId: { in: targetProgramIds },
            OR: [
              { isPrivate: false },
              {
                isPrivate: true,
                OR: [
                  {
                    permissionOverrides: {
                      some: {
                        userId,
                        allow: { not: BigInt(0) },
                      },
                    },
                  },
                  {
                    program: {
                      memberships: {
                        some: {
                          userId,
                          memberRoles: {
                            some: {
                              role: {
                                tier: { lte: 1 },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
            name: true,
            programId: true,
            program: {
              select: {
                name: true,
              },
            },
          },
        });

        const channelIds = accessibleChannels.map(c => c.id);

        if (channelIds.length > 0) {
          const channelMessages = await prisma.message.findMany({
            where: {
              channelId: { in: channelIds },
              content: {
                contains: query,
                mode: 'insensitive',
              },
            },
            orderBy: { createdAt: 'desc' },
            take: take,
            skip: searchScope === 'channels' ? skip : 0,
            include: {
              author: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          });

          const channelMap = new Map(accessibleChannels.map(c => [c.id, c]));

          for (const msg of channelMessages) {
            const channel = channelMap.get(msg.channelId!);
            if (!channel) continue;

            results.push({
              id: msg.id,
              content: msg.content,
              author: msg.author,
              createdAt: msg.createdAt.toISOString(),
              isEdited: msg.isEdited,
              parentMessageId: msg.parentMessageId,
              context: {
                type: 'channel',
                channelId: msg.channelId!,
                channelName: channel.name,
                programId: (channel as any).programId,
                programName: (channel as any).program.name,
              },
            });
          }
        }
      }
    }

    // ============================================
    // SEARCH DM MESSAGES
    // ============================================
    if (searchScope === 'all' || searchScope === 'dms') {
      const participations = await prisma.conversationParticipant.findMany({
        where: { userId },
        include: {
          conversation: {
            select: {
              id: true,
              isGroup: true,
              name: true,
              participants: {
                where: { userId: { not: userId } },
                select: {
                  user: {
                    select: {
                      id: true,
                      displayName: true,
                    },
                  },
                },
                take: 4,
              },
            },
          },
        },
      });

      const conversationIds = participations.map(p => p.conversationId);

      if (conversationIds.length > 0) {
        const dmMessages = await prisma.message.findMany({
          where: {
            conversationId: { in: conversationIds },
            content: {
              contains: query,
              mode: 'insensitive',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: take,
          skip: searchScope === 'dms' ? skip : 0,
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        });

        // Build conversation name lookup — handle group vs 1:1
        const conversationMap = new Map<string, string>();
        for (const p of participations) {
          const conv = p.conversation;
          if (conv.isGroup && conv.name) {
            conversationMap.set(p.conversationId, conv.name);
          } else if (conv.participants.length > 0) {
            const names = conv.participants.map((pp: any) => pp.user.displayName);
            conversationMap.set(p.conversationId, names.join(', '));
          } else {
            conversationMap.set(p.conversationId, 'Unknown');
          }
        }

        for (const msg of dmMessages) {
          results.push({
            id: msg.id,
            content: msg.content,
            author: msg.author,
            createdAt: msg.createdAt.toISOString(),
            isEdited: msg.isEdited,
            parentMessageId: msg.parentMessageId,
            context: {
              type: 'dm',
              conversationId: msg.conversationId!,
              conversationName: conversationMap.get(msg.conversationId!) || 'Unknown',
            },
          });
        }
      }
    }

    // Sort all results by date (newest first) and apply pagination for 'all' scope
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paginatedResults = searchScope === 'all'
      ? results.slice(skip, skip + take)
      : results;

    const totalBeforePagination = searchScope === 'all' ? results.length : paginatedResults.length;

    res.json({
      success: true,
      data: {
        results: paginatedResults.slice(0, take),
        query,
        scope: searchScope,
        total: totalBeforePagination,
        hasMore: searchScope === 'all'
          ? results.length > skip + take
          : paginatedResults.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/search/channels
 * Search channels by name across all programs the user is a member of.
 *
 * Query params:
 *   q     - Search query (required, min 1 char)
 *   limit - Max results (default: 10, max: 20)
 */
router.get('/channels', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { q, limit = '10' } = req.query;

    const query = (q as string || '').trim();
    if (!query || query.length < 1) {
      throw new BadRequestError('Search query is required');
    }

    const take = Math.min(parseInt(limit as string, 10) || 10, 20);

    // Get programs the user is a member of
    const memberships = await prisma.programMembership.findMany({
      where: { userId },
      select: { programId: true },
    });
    const memberProgramIds = memberships.map(m => m.programId);

    if (memberProgramIds.length === 0) {
      return res.json({ success: true, data: { channels: [] } });
    }

    const channels = await prisma.channel.findMany({
      where: {
        programId: { in: memberProgramIds },
        name: {
          contains: query,
          mode: 'insensitive',
        },
        isArchived: false,
        OR: [
          { isPrivate: false },
          {
            isPrivate: true,
            OR: [
              {
                permissionOverrides: {
                  some: { userId, allow: { not: BigInt(0) } },
                },
              },
              {
                program: {
                  memberships: {
                    some: {
                      userId,
                      memberRoles: {
                        some: { role: { tier: { lte: 1 } } },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      take,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        isPrivate: true,
        programId: true,
        program: {
          select: { name: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        channels: channels.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          isPrivate: c.isPrivate,
          programId: c.programId,
          programName: c.program.name,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TYPES
// ============================================

interface SearchResult {
  id: string;
  content: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  isEdited: boolean;
  parentMessageId: string | null;
  context: ChannelContext | DMContext;
}

interface ChannelContext {
  type: 'channel';
  channelId: string;
  channelName: string;
  programId: string;
  programName: string;
}

interface DMContext {
  type: 'dm';
  conversationId: string;
  conversationName: string;
}

export default router;
