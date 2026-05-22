# Plan pour les Bulk Actions et Corrections de Bugs

## Étapes

### [x] Step 1: Ajouter les bulk actions à AdminPluginsPage
- Ajouter les fonctionnalités d'activation/désactivation groupée pour les plugins
- Mettre à jour le serveur pour supporter les mises à jour groupées de plugins
- Modifier AdminPluginsPage avec des cases à cocher et boutons d'actions groupées

### [ ] Step 2: Ajouter les bulk actions à AdminBackupsPage
- Ajouter la fonctionnalité de suppression groupée des sauvegardes
- Mettre à jour le serveur pour supporter la suppression groupée
- Modifier AdminBackupsPage avec des cases à cocher et boutons d'actions groupées

### [ ] Step 3: Corriger l'affichage des pièces jointes
- Investiguer le problème d'ordre d'affichage (première vs deuxième pièce jointe)
- Vérifier l'ordre de stockage des pièces jointes côté serveur
- Corriger le rendu côté client si nécessaire

### [ ] Step 4: Corriger tous les bugs identifiés
- Supprimer le code inutilisé (ex: params redondants dans AdminUsersPage)
- Vérifier que les paramètres de requête API sont correctement passés
- Corriger les incohérences UI dans les composants admin et client

### [ ] Step 5: Rendre toutes les fonctionnalités 100% fonctionnelles
- Tester l'envoi de messages avec plusieurs pièces jointes
- Tester toutes les actions groupées admin
- Vérifier que les fonctionnalités core (auth, serveurs, salons, etc.) fonctionnent correctement
