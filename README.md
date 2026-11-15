# SynCode — Real-Time Collaborative Code Editor

A full-stack, real-time collaborative coding platform powered by **Next.js 16**, **Monaco Editor**, **Socket.io**, **WebRTC Voice Calling**, **Google Gemini AI Code Review**, and **Judge0 Multi-Language Execution**.

---

## ✨ Features

- **⚡ Real-Time Collaborative Editing**: Sub-millisecond peer keystroke synchronization and live cursor tracking with user badges powered by Socket.io.
- **🌐 Multi-Language Execution**: Code and run **JavaScript**, **Python**, **Java**, **C**, and **C++** with instant output, compilation diagnostics, and runtime execution time.
- **🎙️ WebRTC P2P Voice Channels**: High-clarity, in-browser voice communication with speaking indicators and mute controls.
- **🤖 Gemini AI Code Review**: Automated algorithmic analysis using Google Gemini (`gemini-3.5-flash`), detecting syntax mistakes, logic errors, Big-O time & space complexity, and 1-click refactoring.
- **🖥️ Interactive Draggable Console**: Resizable output drawer with text copy capabilities, status badges, and automatic clearing between test runs.
- **🛡️ Host-Protected Workspaces**: Dynamic in-place workspace renaming restricted to room hosts and persisted to Neon PostgreSQL.
- **☁️ Cloud Persistence & Auto-Save**: Real-time room persistence and snapshot checkpoints backed by Prisma ORM and Neon DB.
- **📦 Monorepo & Docker Ready**: Single-command local startup and multi-stage Docker containerization.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Monaco Editor (`@monaco-editor/react`)
- **Backend / Real-Time**: Node.js, Express, Socket.io, WebRTC (Mesh signaling)
- **Database & Auth**: Neon PostgreSQL, Prisma ORM, NextAuth.js (GitHub & Google OAuth)
- **AI & Sandbox**: Google Generative AI (Gemini 3.5), Judge0 Community Engine
- **DevOps**: Docker, Docker Compose, Concurrently

---

## 📁 Repository Structure

```text
shared_code_editor/
├── frontend/               # Next.js 16 Frontend & API Routes
│   ├── src/
│   │   ├── app/            # App Router (Dashboard, Room, API endpoints)
│   │   ├── components/     # UI & Provider components
│   │   └── lib/            # Prisma, Auth, WebRTC manager
│   ├── prisma/             # Prisma schema & migrations
│   └── Dockerfile          # Multi-stage frontend Docker build
│
├── server/                 # Express & Socket.io Signaling Server
│   ├── src/
│   │   └── index.js        # WebSocket event handlers & room state
│   └── Dockerfile          # Node.js Alpine backend Docker build
│
├── docker-compose.yml      # Multi-container orchestration
├── package.json            # Root monorepo configuration
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** >= 18.x
- **npm** >= 9.x
- *(Optional)* **Docker Desktop**

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/Shivam1501singh/shared_code_editor.git
cd shared_code_editor

# Install monorepo dependencies
npm install
```

### 3. Environment Variables

Create `frontend/.env.local`:
```env
DATABASE_URL="your-neon-postgres-connection-string"
NEXTAUTH_SECRET="your-random-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"

# Optional OAuth (GitHub / Google)
GITHUB_ID=""
GITHUB_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# AI Review & Sockets
GEMINI_API_KEY="your-gemini-api-key"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4000"
```

Create `server/.env`:
```env
PORT=4000
CLIENT_URL=http://localhost:3000
```

### 4. Run Both Servers (Single Command)
```bash
# Starts both Backend (:4000) and Frontend (:3000) concurrently
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## 🐳 Running with Docker

You can run the entire platform with Docker Compose:

```bash
# Build and start both containers
docker compose up --build

# Stop the containers
docker compose down
```

---

## 🚢 Deployment Guide

### Recommended: Split Deployment (Vercel + Render)

- **Frontend on Vercel**:
  1. Import the repository into [Vercel](https://vercel.com).
  2. Set **Root Directory** to `frontend`.
  3. Add environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SOCKET_URL`).
  4. Deploy!

- **Backend on Render / Railway**:
  1. Create a **New Web Service** on [Render](https://render.com).
  2. Connect the repository and set **Root Directory** to `server`.
  3. Set **Build Command**: `npm install` and **Start Command**: `node src/index.js`.
  4. Set `PORT=4000` and `CLIENT_URL=https://<your-vercel-domain>.vercel.app`.
  5. Copy your Render service URL into `NEXT_PUBLIC_SOCKET_URL` on Vercel.

---

## 📄 License
MIT License. Created by Shivam Singh.
