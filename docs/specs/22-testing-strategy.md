# Spécification 22 — Stratégie de Tests

> Spécification de la stratégie de tests du projet : frameworks, conventions, couverture, organisation.
>
> Dépendances : `00-architecture.md` (stack, structure monorepo).

---

## 1. Vue d'ensemble

OpenCord adopte une pyramide de tests classique : une base large de tests unitaires, une couche intermédiaire de tests d'intégration, et un sommet de tests end-to-end (E2E). L'objectif est de garantir la stabilité et la maintenabilité du code tout en permettant des itérations rapides.

---

## 2. Stack de tests

### Backend (`packages/server`)

| Outil | Version | Rôle |
|---|---|---|
| Vitest | 1+ | Framework de test (runner, assertions, mocks) |
| supertest | 7+ | Tests HTTP des routes Express |
| @faker-js/faker | 8+ | Génération de données de test |

### Frontend (`packages/client`)

| Outil | Version | Rôle |
|---|---|---|
| Vitest | 1+ | Framework de test (runner, assertions) |
| @testing-library/react | 15+ | Tests de composants React |
| @testing-library/user-event | 14+ | Simulation d'interactions utilisateur |
| jsdom | 24+ | Environnement DOM simulé |
| msw (Mock Service Worker) | 2+ | Interception et mock des requêtes HTTP/WebSocket |

### End-to-End

| Outil | Version | Rôle |
|---|---|---|
| Playwright | 1.40+ | Tests E2E multi-navigateur |

### Partagé (`packages/shared`)

| Outil | Version | Rôle |
|---|---|---|
| Vitest | 1+ | Tests unitaires des validateurs et utilitaires |

---

## 3. Organisation des fichiers

### Convention de nommage

- Tests unitaires : `<nom>.test.ts` (colocalisés avec le fichier source)
- Tests d'intégration : `<nom>.integration.test.ts`
- Tests E2E : `packages/e2e/tests/<feature>.spec.ts`

### Structure

```
packages/
├── server/
│   ├── src/
│   │   ├── services/
│   │   │   ├── badge.service.ts
│   │   │   └── badge.service.test.ts        # Test unitaire
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.controller.test.ts      # Test unitaire
│   │   └── routes/
│   │       └── __tests__/
│   │           ├── auth.integration.test.ts # Test d'intégration
│   │           └── guilds.integration.test.ts
│   ├── vitest.config.ts
│   └── vitest.setup.ts
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MessageInput.tsx
│   │   │   └── MessageInput.test.tsx         # Test composant
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   └── useAuth.test.ts               # Test hook
│   │   └── stores/
│   │       ├── authStore.ts
│   │       └── authStore.test.ts             # Test store
│   ├── vitest.config.ts
│   └── vitest.setup.ts
│
├── shared/
│   ├── src/
│   │   ├── validators/
│   │   │   ├── auth.validators.ts
│   │   │   └── auth.validators.test.ts
│   │   └── constants/
│   │       ├── permissions.ts
│   │       └── permissions.test.ts
│   └── vitest.config.ts
│
└── e2e/
    ├── tests/
    │   ├── auth.spec.ts
    │   ├── messaging.spec.ts
    │   ├── guilds.spec.ts
    │   └── admin.spec.ts
    ├── fixtures/
    │   ├── users.ts                          # Données de test partagées
    │   └── guilds.ts
    ├── pages/                                # Page Object Models
    │   ├── LoginPage.ts
    │   ├── ChatPage.ts
    │   └── AdminPage.ts
    └── playwright.config.ts
```

---

## 4. Configuration

### 4.1 Vitest — Backend

```typescript
// packages/server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/prisma/**', 'src/types/**'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    testTimeout: 10000,
  },
});
```

### 4.2 Vitest — Frontend

```typescript
// packages/client/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/types/**', 'src/locales/**'],
      thresholds: {
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
});
```

### 4.3 Playwright

```typescript
// packages/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

---

## 5. Tests unitaires

### 5.1 Backend — Services

Tester la logique métier isolée. Les dépendances externes (Prisma, Socket.IO) sont mockées via `vi.mock()`.

**Conventions :**
- Un `describe` par fonction publique du service
- Tests positifs ET négatifs (cas d'erreur, edge cases)
- Mock Prisma via un objet `mockPrisma` injecté ou via `vi.mock('@prisma/client')`

**Exemple de pattern :**
```typescript
describe('BadgeService', () => {
  describe('assignBadge', () => {
    it('should assign badge to user');
    it('should not duplicate existing badge');
    it('should throw if badge does not exist');
  });
});
```

### 5.2 Backend — Controllers

Tester la logique de validation et de transformation des données.

**Conventions :**
- Mock du `req`/`res`/`next` Express
- Vérifier les codes de statut HTTP et les réponses JSON
- Tester la validation Zod (entrées invalides)

### 5.3 Frontend — Composants

Tester le rendu et les interactions des composants React.

**Conventions :**
- Utiliser `@testing-library/react` : `render`, `screen`, `fireEvent`, `waitFor`
- Pas de test sur l'implémentation interne (pas de snapshot tests sauf exception)
- Mock des stores Zustand via `vi.mock()`
- Mock des appels API via MSW

### 5.4 Frontend — Hooks

Tester les custom hooks via `renderHook` de `@testing-library/react`.

### 5.5 Frontend — Stores Zustand

Tester les actions et sélecteurs des stores isolément.

### 5.6 Shared — Validateurs

Tester chaque schéma Zod avec des entrées valides et invalides.

---

## 6. Tests d'intégration

### Backend — Routes API

Tester les routes Express avec une base de données SQLite **en mémoire** ou une base de test dédiée.

**Setup :**
```typescript
// vitest.setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

beforeAll(async () => {
  await prisma.$executeRaw`PRAGMA journal_mode=WAL`;
  // Appliquer les migrations
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Nettoyer toutes les tables entre chaque test
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%'
  `;
  for (const { name } of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
  }
});
```

**Pattern de test :**
```typescript
describe('POST /api/auth/register', () => {
  it('should create a new user and return tokens');
  it('should return 409 if email already exists');
  it('should return 422 if validation fails');
  it('should hash password with bcrypt');
  it('should assign default discriminator');
});
```

**Couverture cible des routes :**

| Domaine | Routes à couvrir |
|---|---|
| Auth | register, login, 2FA, refresh, reset password |
| Users | profil, settings, relations, présence |
| Guilds | CRUD, membres, invitations |
| Channels | CRUD, permissions, threads |
| Messages | CRUD, réactions, pins, recherche |
| Admin | users, badges, reports, settings |

---

## 7. Tests End-to-End (Playwright)

### 7.1 Scénarios prioritaires

| Fichier | Scénarios |
|---|---|
| `auth.spec.ts` | Inscription, connexion, 2FA, déconnexion, reset password |
| `messaging.spec.ts` | Envoi de message, réponse, édition, suppression, réaction, upload fichier |
| `guilds.spec.ts` | Création serveur, rejoindre via invite, quitter, modifier paramètres |
| `channels.spec.ts` | Créer/supprimer canal, threads, forum posts |
| `friends.spec.ts` | Demande d'ami, accepter, bloquer, DM |
| `admin.spec.ts` | Dashboard, gestion users, badges, signalements |
| `premium.spec.ts` | Page premium, gestion abonnement (mock Stripe) |

### 7.2 Page Object Model

Chaque page/composant majeur a un POM :

```typescript
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="submit"]');
  }

  async expectError(message: string) {
    await expect(this.page.locator('[data-testid="error"]')).toContainText(message);
  }
}
```

### 7.3 Convention `data-testid`

Tous les éléments interactifs majeurs du frontend doivent avoir un attribut `data-testid` pour les sélecteurs Playwright. Convention de nommage : `kebab-case` descriptif.

| Élément | `data-testid` |
|---|---|
| Champ email login | `login-email` |
| Bouton envoyer message | `message-send` |
| Carte de serveur (sidebar) | `guild-card-{id}` |
| Canal dans la sidebar | `channel-{id}` |
| Message dans le chat | `message-{id}` |

---

## 8. Scripts npm

### Package root (`package.json`)

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "npm run test:unit -w packages/server && npm run test:unit -w packages/client && npm run test:unit -w packages/shared",
    "test:integration": "npm run test:integration -w packages/server",
    "test:e2e": "npm run test -w packages/e2e",
    "test:coverage": "npm run test:coverage -w packages/server && npm run test:coverage -w packages/client",
    "test:ci": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

### Package server

```json
{
  "scripts": {
    "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest run --include '**/*.integration.test.ts'",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

### Package client

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

### Package E2E

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed"
  }
}
```

---

## 9. Données de test (Fixtures & Factories)

### Factory pattern

```typescript
// packages/server/src/__tests__/factories/user.factory.ts
import { faker } from '@faker-js/faker';

export function buildUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.nanoid(),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    discriminator: faker.string.numeric(4),
    password_hash: '$2b$12$fakehash',
    ...overrides,
  };
}
```

Chaque domaine (user, guild, channel, message) a sa factory dans `packages/server/src/__tests__/factories/`.

---

## 10. Objectifs de couverture

| Package | Branches | Fonctions | Lignes |
|---|---|---|---|
| `server` | 70% | 70% | 70% |
| `client` | 60% | 60% | 60% |
| `shared` | 90% | 90% | 90% |

Ces seuils sont configurés dans `vitest.config.ts` et font échouer le build CI si non atteints.

---

## 11. Bonnes pratiques

1. **Isolation** : chaque test est indépendant, pas de dépendance d'ordre
2. **Nommage** : `should <action> when <condition>` pour les `it()`
3. **AAA** : Arrange / Act / Assert dans chaque test
4. **Pas de sleep** : utiliser `waitFor`, `waitForSelector`, polling — jamais de `setTimeout` fixe
5. **Données uniques** : utiliser Faker pour les données, jamais de données en dur partagées entre tests
6. **Tests négatifs** : toujours tester les cas d'erreur (validation, permissions, rate limiting)
7. **Pas de test d'implémentation** : tester le comportement, pas les détails internes

---

## Références croisées

- `00-architecture.md` — Stack, structure du monorepo
- `15-rate-limiting-security.md` — Tester le rate limiting
