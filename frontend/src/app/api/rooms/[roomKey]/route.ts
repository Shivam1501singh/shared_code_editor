import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roomKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { roomKey } = await params;

    const room = await prisma.room.findUnique({
      where: { roomKey },
      include: {
        host: {
          select: { id: true, name: true, image: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // If authenticated user visits, record membership if not already a member
    if (session?.user?.id) {
      await prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: session.user.id,
          },
        },
        update: {
          lastActiveAt: new Date(),
        },
        create: {
          roomId: room.id,
          userId: session.user.id,
          role: room.hostId === session.user.id ? 'host' : 'collaborator',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error('Error fetching room details:', error);
    return NextResponse.json({ success: false, error: 'Failed to load room' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roomKey: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { roomKey } = await params;
    const body = await req.json();

    const room = await prisma.room.findUnique({
      where: { roomKey },
    });

    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Only the room creator (host) can update the room title
    if (body.title && body.title.trim() !== room.title) {
      if (!session?.user?.id || session.user.id !== room.hostId) {
        return NextResponse.json(
          { success: false, error: 'Only the room host can rename this workspace' },
          { status: 403 }
        );
      }
    }

    const updatedRoom = await prisma.room.update({
      where: { roomKey },
      data: {
        ...(body.title ? { title: body.title.trim() } : {}),
        ...(body.language ? { language: body.language.trim() } : {}),
        ...(body.codeContent !== undefined ? { codeContent: body.codeContent } : {}),
      },
    });

    if (body.createSnapshot && body.codeContent) {
      await prisma.codeSnapshot.create({
        data: {
          roomId: room.id,
          savedById: session?.user?.id || null,
          codeContent: body.codeContent,
          note: body.note || 'Version snapshot',
        },
      });
    }

    return NextResponse.json({ success: true, data: updatedRoom });
  } catch (error) {
    console.error('Error updating room:', error);
    return NextResponse.json({ success: false, error: 'Failed to update room' }, { status: 500 });
  }
}
