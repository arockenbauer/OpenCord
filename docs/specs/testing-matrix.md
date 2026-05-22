# Testing Matrix

This matrix defines what "fully tested" means for OpenCord. A feature is only considered covered when the listed layers exist and are part of the release gate driven by `npm run test`.

## Coverage levels

| Layer | Purpose |
| --- | --- |
| `shared` | Validate schemas, permissions, and shared utility contracts |
| `server-unit` | Validate isolated business logic |
| `server-integration` | Validate real HTTP contracts, auth, persistence, and permissions |
| `client` | Validate stores, rendering, and component/page interactions |
| `e2e` | Validate end-to-end user journeys in a real browser |
| `visual` | Detect visual regressions on critical screens and states |

## Feature inventory

| Area | Feature / flow | Shared | Server unit | Server integration | Client | E2E | Visual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Register / login / logout / refresh | `auth.validators.ts` | auth + token helpers | `/api/auth/*` | auth pages + auth store | `auth.spec.ts` | login + register screens |
| Auth | Forgot / reset password / 2FA | `auth.validators.ts` | auth / OTP helpers | `/api/auth/password/*`, `/api/auth/2fa/*` | auth pages | `auth.spec.ts` | forgot + reset screens |
| Social | Friends list / pending / blocked | `invite.validators.ts` | friends-related services | `/api/relationships/*` | `FriendsPage`, `FriendsView`, stores | `friends.spec.ts` | friends page |
| Social | DM creation / open DM | `invite.validators.ts` | DM helpers | `/api/dms/*` | friends flow + guild store | `friends.spec.ts` | DM shell state |
| Discovery | Browse and join public guilds | — | discovery service helpers | `/api/discover/*` | `DiscoveryPage` | discovery / guild join flow | discovery page |
| Invites | Resolve and accept invites | `invite.validators.ts` | invite helpers | `/api/invites/*`, `/api/guilds/:guildId/invites/*` | `InviteAcceptPage` | invite flow | invite page |
| Messaging | Send / edit / delete messages | `message.validators.ts` | message / permission helpers | `/api/channels/:channelId/messages/*` | `ChatArea`, message store | `messaging.spec.ts` | chat shell |
| Messaging | Search / pins / reactions | `message.validators.ts` | message helpers | messages search / reactions routes | chat components | `messaging.spec.ts` | chat state variants |
| Guilds | Create / update / delete guilds | `guild.validators.ts` | guild helpers | `/api/guilds/*` | create guild modal / settings | `guilds.spec.ts` | seeded guild shell |
| Guilds | Create / update / delete channels | `guild.validators.ts` | permission helpers | `/api/channels/*`, `/api/guilds/:guildId/channels/*` | `ChannelSidebar` | `channels.spec.ts` | sidebar layout |
| Guilds | Roles / member moderation | `role.validators.ts` | permission helpers | roles + members routes | server settings pages | `guilds.spec.ts` | server settings states |
| Premium | Tier list / subscribe / cancel | — | premium helpers | `/api/premium/*` | `PremiumPage` | `premium.spec.ts` | premium page |
| Admin | Dashboard / users / badges / reports / settings / backups | — | badge / backup / export helpers | `/api/admin/*`, `/api/badges/*`, `/api/reports/*` | admin pages | `admin.spec.ts` | admin dashboard / users |
| Connected accounts | List / callback / update / delete | `invite.validators.ts` where relevant | OAuth helpers | `/api/connected-accounts/*` | user settings connections | targeted E2E only if UI exposed | settings state |
| Platform shell | App layout, quick switcher, notifications, popouts | shared permissions/events | shell-related helpers | readiness via API + gateway | `AppLayout`, `ServerList`, `MemberList`, `QuickSwitcher` | app shell journeys | shell + popout snapshots |

## Release-gate rule

`npm run test` is considered sufficient only when:

1. every row above has at least one implemented test at its designated layers,
2. critical user journeys have a real browser test,
3. critical screens have deterministic visual snapshots,
4. failures in any of those layers break the command.
