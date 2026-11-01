import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch created rooms
    const createdRooms = await prisma.room.findMany({
      where: { hostId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    // Fetch joined rooms where user is a collaborator
    const joinedMemberships = await prisma.roomMember.findMany({
      where: {
        userId,
        role: 'collaborator',
      },
      orderBy: { lastActiveAt: 'desc' },
      include: {
        room: {
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
        },
      },
    });

    const joinedRooms = joinedMemberships.map((m) => m.room);

    return NextResponse.json({
      success: true,
      data: {
        createdRooms,
        joinedRooms,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard rooms:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch rooms' }, { status: 500 });
  }
}
