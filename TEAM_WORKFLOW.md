# Team Workflow & Review Roles Protocol

## 1. Overview
To ensure production quality, stability, and clean Git commits before pushing to GitHub, each phase will cycle through three specialized roles:

```
[ 1. Software Engineer (Dev) ]
       │
       ▼ (Implementation & Unit Checks)
[ 2. Manual Tester (QA) ]
       │
       ▼ (Test Scenarios, Edge Cases, Verification)
[ 3. Code Reviewer (Review) ]
       │
       ▼ (Architecture, Security, Clean Code Approval)
[ GitHub Push / Merge ]
```

---

## 2. Role Responsibilities

### Role 1: Software Engineer (Dev)
- Implements features strictly based on `PRD.md`, `SYSTEM_DESIGN.md`, and `API_DESIGN.md`.
- Maintains TypeScript types, Next.js conventions, and Socket.io event contracts.
- Confirms local build & compile without errors (`npm run build`).

### Role 2: Manual Tester (QA)
- Verifies user flows against acceptance criteria.
- Tests edge cases:
  - Network disconnect / reconnect.
  - Multi-user race conditions (concurrent typing).
  - Malformed room keys / unauthorized joins.
  - Empty or invalid JavaScript execution.
- Generates a QA sign-off checklist per phase.

### Role 3: Code Reviewer (Review)
- Audits for security vulnerabilities (e.g. secret leaks, unvalidated socket inputs).
- Audits performance (unnecessary re-renders, memory leaks in Web Workers / WebSockets).
- Enforces clean code standards before commits are staged.

---

## 3. GitHub Staging & Commit Strategy

- Root `.gitignore` configured to prevent committing `.env`, `node_modules`, or build artifacts.
- Atomic commits mapped to phases:
  - `feat(phase-1): scaffold next.js frontend and node.js socket server`
  - `feat(phase-2): configure nextauth dual oauth and prisma models`
  - `feat(phase-3): implement landing and dashboard UI`
  - ...and so on.
- Once you provide the remote GitHub URL, we will connect it via:
  ```bash
  git remote add origin <YOUR_GITHUB_REPO_URL>
  ```
