# Plan d'implémentation - Bulk Actions & Refonte UI Discord

Ce plan détaille les étapes pour ajouter des actions groupées dans le panneau d'administration et aligner l'interface utilisateur sur celle de Discord.

## Étapes de réalisation

### [ ] Étape 1 : Investigation et Analyse des bugs
- Analyser les composants UI pour identifier les écarts avec Discord.
- Identifier les bugs fonctionnels dans le serveur et le client.
- Définir précisément les actions groupées pour chaque page admin.

### [ ] Étape 2 : Implémentation des Bulk Actions (Admin)
- **AdminGuildsPage** : Sélection multiple, suppression en masse, activation/désactivation de features en masse.
- **AdminBadgesPage** : Sélection multiple, suppression en masse, attribution en masse.
- **AdminReportsPage** : Sélection multiple, résolution/rejet en masse.
- **AdminAnnouncementsPage** & **AdminPluginsPage** : Actions en masse correspondantes.

### [ ] Étape 3 : Refonte UI - Sidebar & Liste des serveurs
- Mise à jour de `ServerList` : formes des icônes, animations, indicateurs de messages non lus.
- Mise à jour de `ChannelSidebar` : Catégories pliables, design des salons, nouveau `UserPanel` fidèle à Discord.

### [ ] Étape 4 : Refonte UI - Chat & Membres
- Amélioration de `ChatArea` : Barre d'outils, champ de saisie riche, formatage des messages.
- Mise à jour de `MemberList` : Groupement par rôles, statuts détaillés.

### [ ] Étape 5 : Correction des Bugs & Finalisation
- Fixer tous les bugs identifiés à l'étape 1.
- S'assurer que les fonctionnalités (DM, Vocal, Threads) sont 100% opérationnelles.
- Vérification finale (Lint, Typecheck, Tests).

## Spécifications techniques
- Utilisation de React & Lucide React pour les icônes.
- CSS Modules pour les styles.
- API REST pour les actions en masse.
