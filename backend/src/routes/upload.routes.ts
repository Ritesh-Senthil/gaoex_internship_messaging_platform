/**
 * File Upload Routes
 * Handles file uploads to Supabase Storage
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { Permissions, hasPermission } from '../utils/permissions';
import { getUserPermissions } from '../utils/roleHelpers';
import { canAccessChannel } from '../utils/access';
import {
  resolveChannelMentions,
  collectChannelMentionRecipients,
  incrementMentionCounts,
  emitChannelUnreadEvents,
  pushChannelMessage,
} from '../services/messageDispatch';
import { sendPushToUsers, buildDMNotification } from '../services/pushNotification';
import { messageRateLimiter } from '../middleware/rateLimit';
import {
  supabase,
  STORAGE_BUCKET,
  ALLOWED_FILE_TYPES,
  MAX_FILES_PER_MESSAGE,
  getFileCategory,
  generateStoragePath,
} from '../config/supabase';

const router = Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (we'll check per-type limits later)
    files: MAX_FILES_PER_MESSAGE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_FILE_TYPES[file.mimetype as keyof typeof ALLOWED_FILE_TYPES]) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

/**
 * POST /api/upload/channel/:channelId
 * Upload files to a channel message
 */
router.post(
  '/channel/:channelId',
  authenticate,
  messageRateLimiter,
  upload.array('files', MAX_FILES_PER_MESSAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channelId } = req.params;
      const { content } = req.body; // Optional caption
      const userId = req.user!.id;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new BadRequestError('No files provided');
      }

      // Verify channel exists and user has access
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: {
          id: true,
          programId: true,
          type: true,
          name: true,
          isPrivate: true,
          program: { select: { name: true } },
        },
      });

      if (!channel) {
        throw new NotFoundError('Channel not found');
      }

      // Check membership
      const membership = await prisma.programMembership.findUnique({
        where: { userId_programId: { userId, programId: channel.programId } },
      });

      if (!membership && !req.user!.isSuperAdmin) {
        throw new ForbiddenError('You are not a member of this program');
      }

      // Private channel access (SEC-03)
      if (channel.isPrivate && !(await canAccessChannel(userId, channelId, req.user!.isSuperAdmin))) {
        throw new ForbiddenError('You do not have access to this private channel');
      }

      // Check ATTACH_FILES permission
      const userPerms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(userPerms, Permissions.ATTACH_FILES)) {
        throw new ForbiddenError('You do not have permission to upload files');
      }

      // Announcement channels require SEND_IN_ANNOUNCEMENTS to post at all
      if (channel.type === 'ANNOUNCEMENT' && !hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS)) {
        throw new ForbiddenError('You do not have permission to post in announcement channels');
      }

      // Validate file sizes
      for (const file of files) {
        const typeConfig = ALLOWED_FILE_TYPES[file.mimetype as keyof typeof ALLOWED_FILE_TYPES];
        if (file.size > typeConfig.maxSize) {
          throw new BadRequestError(
            `File "${file.originalname}" exceeds maximum size of ${Math.round(typeConfig.maxSize / 1024 / 1024)}MB`
          );
        }
      }

      // Upload files to Supabase Storage
      const uploadedFiles: { fileName: string; fileUrl: string; mimeType: string; fileSize: number }[] = [];

      for (const file of files) {
        const storagePath = generateStoragePath('channel', channelId, userId, file.originalname);
        
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error('Supabase upload error:', error);
          throw new BadRequestError(`Failed to upload file: ${file.originalname}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        uploadedFiles.push({
          fileName: file.originalname,
          fileUrl: urlData.publicUrl,
          mimeType: file.mimetype,
          fileSize: file.size,
        });
      }

      // Resolve mentions from the optional caption (@everyone gated — SEC-04)
      const caption = content || '';
      const canMentionEveryone = hasPermission(userPerms, Permissions.MENTION_EVERYONE);
      const mentions = await resolveChannelMentions(caption, channel.programId, canMentionEveryone);

      // Create message with attachments + mention metadata
      const message = await prisma.message.create({
        data: {
          content: caption,
          authorId: userId,
          channelId,
          mentionedUsers: mentions.mentionedUsers,
          mentionedRoles: mentions.mentionedRoles,
          mentionEveryone: mentions.mentionEveryone,
          attachments: {
            create: uploadedFiles,
          },
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              mimeType: true,
              fileSize: true,
            },
          },
        },
      });

      // Bump unread mention counters for mentioned users (RT-03 parity with text).
      const mentionRecipientIds = await collectChannelMentionRecipients(
        channel.programId,
        mentions,
        userId,
      );
      await incrementMentionCounts(prisma, channelId, mentionRecipientIds);

      // Format response to match Message interface
      const formattedMessage = {
        id: message.id,
        content: message.content,
        authorId: message.authorId,
        author: message.author,
        channelId: message.channelId,
        conversationId: null,
        parentMessageId: message.parentMessageId ?? null,
        mentionedUsers: mentions.mentionedUsers,
        mentionedRoles: mentions.mentionedRoles,
        mentionEveryone: mentions.mentionEveryone,
        isEdited: message.isEdited,
        isPinned: message.isPinned,
        attachments: message.attachments.map(att => ({
          id: att.id,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          category: getFileCategory(att.mimeType),
        })),
        reactions: [],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      };

      // Emit socket event + unread events (RT-03)
      const io = req.app.get('io');
      if (io) {
        io.to(`channel:${channelId}`).emit('new_message', formattedMessage);
        emitChannelUnreadEvents(io, {
          channelId,
          programId: channel.programId,
          authorId: userId,
          mentionRecipientIds,
        });
      }

      // Push notifications (fire-and-forget) — uploads notify like text (RT-03)
      pushChannelMessage({
        channelId,
        programId: channel.programId,
        channelName: channel.name,
        programName: channel.program.name,
        authorId: userId,
        authorName: message.author.displayName,
        content: caption,
        mentions,
        mentionRecipientIds,
        hasAttachments: true,
      });

      res.status(201).json({
        success: true,
        data: { message: formattedMessage },
      });
    } catch (error) {
      console.error('Upload to channel error:', error);
      next(error);
    }
  }
);

/**
 * POST /api/upload/conversation/:conversationId
 * Upload files to a DM conversation
 */
router.post(
  '/conversation/:conversationId',
  authenticate,
  messageRateLimiter,
  upload.array('files', MAX_FILES_PER_MESSAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const { content } = req.body; // Optional caption
      const userId = req.user!.id;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new BadRequestError('No files provided');
      }

      // Verify conversation exists and user is a participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: { userId_conversationId: { userId, conversationId } },
      });

      if (!participant) {
        throw new ForbiddenError('You are not a participant in this conversation');
      }

      // Validate file sizes
      for (const file of files) {
        const typeConfig = ALLOWED_FILE_TYPES[file.mimetype as keyof typeof ALLOWED_FILE_TYPES];
        if (file.size > typeConfig.maxSize) {
          throw new BadRequestError(
            `File "${file.originalname}" exceeds maximum size of ${Math.round(typeConfig.maxSize / 1024 / 1024)}MB`
          );
        }
      }

      // Upload files to Supabase Storage
      const uploadedFiles: { fileName: string; fileUrl: string; mimeType: string; fileSize: number }[] = [];

      for (const file of files) {
        const storagePath = generateStoragePath('dm', conversationId, userId, file.originalname);
        
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error('Supabase upload error:', error);
          throw new BadRequestError(`Failed to upload file: ${file.originalname}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        uploadedFiles.push({
          fileName: file.originalname,
          fileUrl: urlData.publicUrl,
          mimeType: file.mimetype,
          fileSize: file.size,
        });
      }

      // Create message with attachments
      const message = await prisma.message.create({
        data: {
          content: content || '',
          authorId: userId,
          conversationId,
          attachments: {
            create: uploadedFiles,
          },
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              mimeType: true,
              fileSize: true,
            },
          },
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // Format response for DM to match DMMessage interface
      const formattedMessage = {
        id: message.id,
        content: message.content,
        authorId: message.author.id,
        authorName: message.author.displayName,
        authorAvatar: message.author.avatarUrl,
        parentMessageId: message.parentMessageId ?? null,
        isEdited: message.isEdited,
        attachments: message.attachments.map(att => ({
          id: att.id,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          category: getFileCategory(att.mimeType),
        })),
        reactions: [],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      };

      // Emit socket event + unread events for other participants (RT-03)
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('new_dm_message', {
          conversationId,
          message: formattedMessage,
        });

        const otherParticipants = await prisma.conversationParticipant.findMany({
          where: { conversationId, userId: { not: userId } },
          select: { userId: true },
        });
        for (const p of otherParticipants) {
          // Exclude sockets already in the conversation room server-side (RT-02).
          io.to(`user:${p.userId}`)
            .except(`conversation:${conversationId}`)
            .emit('unread:dm', {
              conversationId,
              recipientUserId: p.userId,
              senderId: userId,
            });
        }
      }

      // Push notifications (fire-and-forget) — DM uploads notify like text (RT-03)
      (async () => {
        try {
          const recipients = await prisma.conversationParticipant.findMany({
            where: { conversationId, userId: { not: userId }, isMuted: false },
            select: { userId: true },
          });
          const recipientIds = recipients.map((p) => p.userId);
          if (recipientIds.length === 0) return;
          await sendPushToUsers(
            recipientIds,
            buildDMNotification({
              authorName: message.author.displayName,
              messagePreview: (content || '').trim() || '📎 Sent an attachment',
              conversationId,
            }),
            { excludeActiveInRoom: `conversation:${conversationId}` },
          );
        } catch (pushError) {
          console.error('[Push] DM upload push failed:', pushError);
        }
      })();

      res.status(201).json({
        success: true,
        data: { message: formattedMessage },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/upload/:attachmentId
 * Delete an attachment (only author can delete)
 */
router.delete('/:attachmentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user!.id;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: { authorId: true },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    if (attachment.message.authorId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You can only delete your own attachments');
    }

    // Extract storage path from URL
    const url = new URL(attachment.fileUrl);
    const pathParts = url.pathname.split('/storage/v1/object/public/');
    if (pathParts.length > 1) {
      const storagePath = pathParts[1].replace(`${STORAGE_BUCKET}/`, '');
      
      // Delete from Supabase Storage
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (error) {
        console.error('Failed to delete file from storage:', error);
      }
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id: attachmentId },
    });

    res.json({
      success: true,
      message: 'Attachment deleted',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
