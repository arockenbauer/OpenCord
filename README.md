# OpenCord

An open-source alternative to Discord, built with a modern monorepo architecture.

## 🚀 Features

### Core
- **Full Authentication**: Registration, login, 2FA, password reset
- **Guilds (Servers)**: Creation, management, roles, permissions, verification
- **Channels**: Text, voice, forums, categories with granular permissions
- **Messages**: Send messages, attachments, embeds, reactions, polls
- **Friends System**: Add friends, DMs, request management

### Advanced
- **Voice & Video**: Voice channels with WebRTC (mediasoup)
- **Premium**: Subscriptions with Stripe, server boosts
- **Discovery**: Public servers, search, categories
- **Administration**: Complete admin panel (users, servers, badges, plugins)
- **OAuth2**: Application and bot support
- **Customization**: Emojis, stickers, badges, roles
- **Plugins**: Extension system
- **Internationalization**: Multilingual support (i18n)

## 🛠️ Tech Stack

### Frontend (`@opencord/client`)
- React 18 + TypeScript
- Vite
- Zustand (state management)
- React Query (data fetching)
- React Router DOM
- Socket.io-client
- i18next
- Lucide React
- @dnd-kit (drag & drop)

### Backend (`@opencord/server`)
- Express + TypeScript
- Prisma ORM (SQLite)
- Socket.io
- mediasoup (WebRTC)
- Stripe (payments)
- Nodemailer
- JWT + bcrypt
- Zod (validation)

### Shared (`@opencord/shared`)
- Shared types
- Common utilities

## 📦 Installation

```bash
# Install dependencies
npm run install:all

# Setup database
npm run setup

# Start development
npm run dev
```

## 🔧 Available Scripts

```bash
npm run dev          # Development
npm run build        # Production build
npm run prod         # Run in production
npm run test         # Full test suite
npm run typecheck    # Type checking
npm run lint         # Linting
```

## 🏗️ Architecture

```
packages/
├── client/          # React Frontend
├── server/          # Express Backend
├── shared/          # Shared code
└── e2e/             # End-to-end tests
```

## 💡 About this project

This project was created for the **Zencoder AI Program**.

It was **100% vibecoded** - developed entirely with AI assistance via Zencoder, demonstrating the capabilities of generative AI in modern software development.

## 📄 License

You can do whatever you want since it's AI-generated ;)
