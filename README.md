# Reactive Multi-Provider Social Authentication Ecosystem

A lightweight, production-ready full-stack authentication platform. It features an **Angular standalone architecture** on the frontend and an **Express/NodeJS engine** on the backend, supporting seamless Google and GitHub OAuth 2.0 logins with automatic email-based account merging.

---

## 🚀 Key Architectural Features

- **Angular Standalone & RxJS:** Built completely without legacy NgModules. Uses a central `BehaviorSubject` data stream as a single source of truth for auth states.
- **Route Protection & AuthGuard:** Functional guards secure internal views, eliminating vulnerabilities from deep-linking or browser back-buttons after logging out.
- **Automated HTTP Interceptor:** Intercepts client-side API traffic to automatically inject standard `Authorization: Bearer <token>` structures.
- **Atomic Account Consolidation:** Automatically links Google and GitHub provider profiles under a single database record if their verified emails match, preventing profile fragmentation.
- **Modern Bootstrap 5 Layout:** A fully responsive user layout built with custom branded buttons and adaptive profile tracking cards.

---

## 🛠️ Tech Stack

- **Frontend:** Angular (v17+), TypeScript, RxJS, Bootstrap 5
- **Backend:** NodeJS, ExpressJS, PassportJS, JSON Web Tokens (JWT)
- **Database:** MongoDB, Mongoose ODM

---

## ⚙️ Quick Setup

### 1. Backend Server Setup
```bash
cd server
npm install


Create a .env file in the /server root directory:
PORT=3000
MONGO_URI=mongodb://localhost:27017/your_db
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret

GITHUB_CLIENT_ID=your_github_id
GITHUB_CLIENT_SECRET=your_github_secret




Run the server:
npm run dev



2. Frontend Angular Setup
cd frontend
npm install
ng serve


Open http://localhost:4200 inside your web browser.
