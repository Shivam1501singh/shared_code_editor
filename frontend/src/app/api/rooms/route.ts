import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = (body.title || 'Untitled Room').trim();
    const language = body.language || 'javascript';

    // Generate readable random roomKey: code-xxxxxx (e.g. code-8f2a1b)
    const randomHex = Math.random().toString(16).substring(2, 8);
    const roomKey = `code-${randomHex}`;

    const newRoom = await prisma.room.create({
      data: {
        roomKey,
        title,
        language,
        hostId: session.user.id,
        codeContent: "// Start coding collaboratively here...\nconsole.log('Welcome to SynCode!');\n",
        members: {
          create: {
            userId: session.user.id,
            role: 'host',
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newRoom.id,
        roomKey: newRoom.roomKey,
        title: newRoom.title,
        language: newRoom.language,
        hostId: newRoom.hostId,
        createdAt: newRoom.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json({ success: false, error: 'Failed to create room' }, { status: 500 });
  }
}
