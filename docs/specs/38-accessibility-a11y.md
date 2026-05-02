# Spécification 38 — Accessibilité (a11y)

## 1. Principes WCAG 2.1 AA appliqués
- Contraste minimum 4.5:1 pour le texte (3:1 pour les titres > 24 px).
- Navigation 100 % clavier : tous les éléments interactifs sont focusables.
- ARIA : chaque composant possède les attributs `role`, `aria-label`, `aria-labelledby`, `aria-describedby` appropriés.
- Alternatives textuelles : images significatives ont `alt`, icônes décoratives ont `aria-hidden="true"`.

## 2. Composants ARIA
| Composant | `role` | Attributs clés |
|-----------|--------|----------------|
| Zone de saisie de message | `textbox` | `aria-label="Message #${channelName}"`, `aria-multiline="true"` |
| Liste des messages | `list` | chaque message `role="listitem"`, `aria-label="Message de ${username} à ${time}"` |
| Liste des membres | `listbox` | sections `role="group"` avec `aria-labelledby` (nom de la catégorie) |
| Modale | `dialog` | `aria-modal="true"`, `aria-labelledby="modal-title"`, focus trap |
| Menu contextuel | `menu` | items `role="menuitem"`, navigation flèches + Entrée + Échap |
| Bouton toggle (micro, caméra) | `button` | `aria-pressed="true|false"` |
| Notification | `alert` (critique) ou `status` (information) |

## 3. Mouvement réduit
- Détecter `@media (prefers-reduced-motion: reduce)`.
- Si activé : désactiver toutes les transitions CSS (`--transition-speed: 0ms`), supprimer les animations de burst des super réactions, remplacer les skeleton loaders par un simple fade.
- Token CSS : `--transition-speed: 150ms` (valeur normale) → `0ms` quand réduit.

## 4. Support des lecteurs d’écran
- Zone de chat : `aria-live="polite"` sur un conteneur hors‑écran qui annonce chaque nouveau message (`${username}: ${content}`).
- Indicateur de frappe : `aria-live="assertive"` : « ${username} est en train d'écrire… ».
- Changement de canal : annonce « Canal ${channelName} sélectionné » via `aria-live="polite"`.
- Utiliser des balises `<visually-hidden>` pour les messages d’état.

## 5. Contraste & thème
- Tous les tokens de couleur définis dans `16-ui-design-system.md` sont vérifiés avec le ratio de contraste.
- Documenter les combinaisons critiques (texte sur fond, icônes sur boutons, etc.).
- Prévoir une option future **Contraste élevé** (⚠️ DIFFÉRÉ) : jeu de tokens alternatifs avec contraste > 7:1.

## 6. Navigation clavier dans les composants
- **Emoji picker** : grille focusable, navigation flèches, `Enter` pour sélectionner, `Esc` pour fermer, recherche instantanée via saisie.
- **Autocomplete slash commands** : `↑/↓` pour parcourir, `Tab` ou `Enter` pour valider.
- **Dropdown de membres** : filtrage type‑ahead en tapant le nom, navigation flèches.

---
*Cette spécification complète les sections UI existantes (`16-ui-design-system.md`) et n’ajoute aucun nouvel événement au fichier `13-gateway-realtime.md`.*