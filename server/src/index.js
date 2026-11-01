import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'syncode-realtime-server', timestamp: new Date().toISOString() });
});

// In-memory room store: roomKey -> { codeContent, language, users: Map(socketId -> userData) }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket connected] ${socket.id}`);

  // Room Join
  socket.on('room:join', ({ roomKey, user }) => {
    socket.join(roomKey);

    if (!rooms.has(roomKey)) {
      rooms.set(roomKey, {
        codeContent: "// Start coding collaboratively here...\nconsole.log('Hello, SynCode World!');",
        language: 'javascript',
        users: new Map(),
      });
    }

    const room = rooms.get(roomKey);
    const userPayload = {
      id: user?.id || socket.id,
      name: user?.name || 'Guest Developer',
      image: user?.image || null,
      color: user?.color || '#818cf8',
      socketId: socket.id,
    };

    room.users.set(socket.id, userPayload);

    // Send initial room state to joining peer
    socket.emit('room:init', {
      roomKey,
      codeContent: room.codeContent,
      language: room.language,
      activeUsers: Array.from(room.users.values()),
    });

    // Broadcast new user to existing peers
    socket.to(roomKey).emit('user:joined', { user: userPayload });
    console.log(`[Room: ${roomKey}] User joined: ${userPayload.name} (${socket.id})`);
  });

  // Code Synchronization
  socket.on('code:update', ({ roomKey, codeContent }) => {
    const room = rooms.get(roomKey);
    if (room) {
      room.codeContent = codeContent;
      // Broadcast to other peers in the room (excluding sender)
      socket.to(roomKey).emit('code:broadcast', {
        codeContent,
        senderSocketId: socket.id,
      });
    }
  });

  // Remote Cursor Tracking
  socket.on('cursor:update', ({ roomKey, position, user }) => {
    socket.to(roomKey).emit('cursor:broadcast', {
      socketId: socket.id,
      user,
      position,
    });
  });

  // WebRTC Signaling Events
  socket.on('voice:join', ({ roomKey }) => {
    socket.to(roomKey).emit('voice:peer-joined', { socketId: socket.id });
  });

  socket.on('voice:offer', ({ roomKey, targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('voice:offer', {
      senderSocketId: socket.id,
      sdp,
    });
  });

  socket.on('voice:answer', ({ roomKey, targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('voice:answer', {
      senderSocketId: socket.id,
      sdp,
    });
  });

  socket.on('voice:ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('voice:ice-candidate', {
      senderSocketId: socket.id,
      candidate,
    });
  });

  socket.on('voice:speaking', ({ roomKey, isSpeaking }) => {
    socket.to(roomKey).emit('voice:speaking', {
      socketId: socket.id,
      isSpeaking,
    });
  });

  // Disconnection cleanup
  socket.on('disconnecting', () => {
    for (const roomKey of socket.rooms) {
      if (rooms.has(roomKey)) {
        const room = rooms.get(roomKey);
        room.users.delete(socket.id);

        socket.to(roomKey).emit('user:left', { socketId: socket.id });

        if (room.users.size === 0) {
          // Keep in memory for 10 minutes or until DB persistence
          setTimeout(() => {
            if (rooms.has(roomKey) && rooms.get(roomKey).users.size === 0) {
              rooms.delete(roomKey);
              console.log(`[Room: ${roomKey}] Cleaned up empty room`);
            }
          }, 10 * 60 * 1000);
        }
      }
    }
    console.log(`[Socket disconnected] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 SynCode Real-Time Engine running on http://localhost:${PORT}`);
});
