# Spécification 16 — Système de Design & Interface Utilisateur

## Vue d'ensemble

Ce document décrit le système de design complet d'OpenCord : tokens de design, typographie, espacement, composants UI, structure de mise en page, et directives d'implémentation. L'interface s'inspire de Discord mais avec une identité visuelle propre à OpenCord, notamment l'utilisation du violet (`#7c3aed`) comme couleur de marque principale à la place du bleu Discord.

---

## 1. Philosophie de Design

- **Thème** : sombre exclusivement (dark theme), sans option light mode dans la v1
- **Densité** : compacte mais lisible, informations accessibles sans scroll excessif
- **Identité** : proche de Discord visuellement, mais avec un accent violet (purple) caractéristique d'OpenCord
- **Clarté** : hiérarchie visuelle nette, actions principales immédiatement identifiables
- **Cohérence** : chaque composant réutilisable suit les mêmes tokens — aucune valeur magique en dur dans les composants

---

## 2. Tokens de Couleur

Implémentés comme propriétés CSS personnalisées (`CSS custom properties`) déclarées dans `:root` d'un fichier global `tokens.css`.

### 2.1 Arrière-plans

| Token | Valeur | Utilisation |
|---|---|---|
| `--bg-primary` | `#313338` | Zone de contenu principale (chat, pages settings) |
| `--bg-secondary` | `#2b2d31` | Barres latérales (liste des canaux, liste des membres) |
| `--bg-tertiary` | `#1e1f22` | Liste des serveurs, champs de saisie, éléments en arrière |
| `--bg-accent` | `#7c3aed` | Couleur de marque OpenCord — boutons primaires, indicateurs actifs |
| `--bg-accent-hover` | `#6d28d9` | État hover sur les éléments accent |
| `--bg-floating` | `#111214` | Modales, popovers, menus contextuels |
| `--bg-modifier-hover` | `rgba(255,255,255,0.06)` | Survol d'éléments de liste (canaux, membres) |
| `--bg-modifier-active` | `rgba(255,255,255,0.12)` | État actif/sélectionné d'éléments de liste |
| `--bg-modifier-selected` | `rgba(255,255,255,0.08)` | Élément sélectionné persistant |

### 2.2 Texte

| Token | Valeur | Utilisation |
|---|---|---|
| `--text-primary` | `#f2f3f5` | Texte principal — noms, contenus de message |
| `--text-secondary` | `#b5bac1` | Texte secondaire — descriptions, métadonnées |
| `--text-muted` | `#949ba4` | Texte atténué — timestamps, placeholders |
| `--text-link` | `#00a8fc` | Liens cliquables |
| `--text-positive` | `#23a559` | Messages de succès |
| `--text-warning` | `#faa61a` | Messages d'avertissement |
| `--text-danger` | `#f23f43` | Messages d'erreur, texte en rouge |

### 2.3 Statuts utilisateur

| Token | Valeur | Statut |
|---|---|---|
| `--status-online` | `#23a559` | En ligne |
| `--status-idle` | `#f0b232` | Absent |
| `--status-dnd` | `#f23f43` | Ne pas déranger |
| `--status-offline` | `#80848e` | Hors ligne / invisible |
| `--status-streaming` | `#593695` | En stream |

### 2.4 Autres tokens

| Token | Valeur | Utilisation |
|---|---|---|
| `--border` | `#3f4147` | Bordures de séparation, dividers |
| `--border-strong` | `#5c5f66` | Bordures plus prononcées |
| `--danger` | `#da373c` | Boutons de destruction, alertes critiques |
| `--danger-hover` | `#a12828` | Hover sur danger |
| `--warning` | `#faa61a` | Avertissements |
| `--success` | `#3ba55d` | Confirmations de succès |
| `--premium` | `#7c3aed` | UI OpenCord+ (boost, badges premium) |
| `--premium-gradient` | `linear-gradient(135deg, #7c3aed, #a855f7)` | Éléments premium avec dégradé |
| `--scrollbar-thin` | `#1a1b1e` | Couleur des scrollbars |
| `--scrollbar-thumb` | `#3f4147` | Poignée des scrollbars |

---

## 3. Typographie

### 3.1 Famille de polices

```css
font-family: 'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif;
```

- `gg sans` : police propriétaire Discord (si disponible via import local ou CDN auto-hébergé)
- Fallback : `Noto Sans` puis `Helvetica`, `Arial`, `sans-serif`
- Pour le code : `font-family: 'Consolas', 'Courier New', monospace;`

### 3.2 Tailles de police

| Token CSS | Valeur | Utilisation typique |
|---|---|---|
| `--font-size-xs` | `12px` | Timestamps discrets, badges, labels de catégorie en majuscules |
| `--font-size-sm` | `14px` | Noms de canaux, noms de membres, texte de formulaire |
| `--font-size-md` | `16px` | Corps de message, texte de base |
| `--font-size-lg` | `20px` | Titres de section dans les paramètres |
| `--font-size-xl` | `24px` | Titres de modal, nom du serveur dans le header |
| `--font-size-xxl` | `32px` | Titres principaux d'écrans vides (no-content states) |

### 3.3 Graisses de police

| Token CSS | Valeur | Utilisation |
|---|---|---|
| `--font-weight-normal` | `400` | Corps de texte |
| `--font-weight-medium` | `500` | Labels de formulaire, sous-titres |
| `--font-weight-semibold` | `600` | Noms d'utilisateurs, titres de canal |
| `--font-weight-bold` | `700` | Noms de canaux non lus, titres importants |

### 3.4 Hauteurs de ligne

| Token CSS | Valeur | Utilisation |
|---|---|---|
| `--line-height-tight` | `1.2` | Titres courts |
| `--line-height-normal` | `1.375` | Corps de message Discord-style |
| `--line-height-relaxed` | `1.5` | Texte long (descriptions, paramètres) |

---

## 4. Espacement

Base de **4px**. Tous les espacements sont des multiples de cette base.

| Token CSS | Valeur | Utilisation typique |
|---|---|---|
| `--spacing-1` | `4px` | Micro-espacement (icône + texte) |
| `--spacing-2` | `8px` | Padding interne des petits éléments |
| `--spacing-3` | `12px` | Padding des items de liste |
| `--spacing-4` | `16px` | Espacement standard entre éléments |
| `--spacing-5` | `20px` | Padding des sections |
| `--spacing-6` | `24px` | Espacement entre groupes |
| `--spacing-8` | `32px` | Sections de modal |
| `--spacing-10` | `40px` | Sections de page |
| `--spacing-12` | `48px` | Grands espaces |
| `--spacing-16` | `64px` | Espaces très larges, marges de page |

---

## 5. Bordures et Rayons

| Token CSS | Valeur | Utilisation |
|---|---|---|
| `--radius-sm` | `3px` | Badges, tags |
| `--radius-md` | `4px` | Boutons, inputs, éléments de liste |
| `--radius-lg` | `8px` | Cartes, modales, embeds |
| `--radius-xl` | `16px` | Popovers, menus contextuels |
| `--radius-full` | `50%` | Avatars, icônes de serveur circulaires |

---

## 6. Ombres

| Token CSS | Valeur | Utilisation |
|---|---|---|
| `--shadow-low` | `0 1px 3px rgba(0,0,0,0.4)` | Éléments légèrement surélevés |
| `--shadow-medium` | `0 4px 8px rgba(0,0,0,0.5)` | Cartes flottantes, dropdowns |
| `--shadow-high` | `0 8px 24px rgba(0,0,0,0.7)` | Modales, popups principaux |

---

## 7. Approche CSS

- **CSS Modules** : chaque composant possède son fichier `ComponentName.module.css`
- Les tokens sont définis dans `src/styles/tokens.css` et importés globalement
- Les classes globales utilitaires sont dans `src/styles/global.css`
- **Aucune valeur en dur** dans les fichiers `.module.css` — uniquement des références aux tokens CSS via `var(--token-name)`
- Pas de bibliothèque CSS-in-JS (pas de styled-components, pas d'Emotion)
- Pas de Tailwind dans la v1

---

## 8. Icônes

- **Bibliothèque unique** : [Lucide React](https://lucide.dev/) (`lucide-react`)
- Toutes les icônes de l'interface proviennent exclusivement de `lucide-react`
- Taille par défaut : `16px` (inline), `20px` (boutons), `24px` (navigation principale)
- Couleur : héritée via `currentColor` — contrôlée par la couleur du texte parent

---

## 9. Structure de Mise en Page

### 9.1 Layout principal (vue channel)

L'interface est divisée en 4 zones horizontales fixes, de gauche à droite :

```
┌──────┬──────────────────┬───────────────────────────┬──────────────────┐
│Server│  Channel Sidebar │      Main Chat Area        │  Member List     │
│ List │    (240px)       │     (flexible width)       │   (240px)        │
│(72px)│                  │                            │  (collapsible)   │
└──────┴──────────────────┴───────────────────────────┴──────────────────┘
```

### 9.2 Barre des serveurs (Server List Bar)

- **Largeur** : 72px fixe
- **Couleur de fond** : `var(--bg-tertiary)`
- **Contenu de haut en bas** :
  1. Bouton Home (icône maison ou logo OpenCord) — accès aux DM et aux mentions globales
  2. Séparateur horizontal (1px, `var(--border)`, avec arrondi, 32px de large, centré)
  3. Liste scrollable des icônes de serveur (ordre personnalisable via drag-and-drop)
  4. Séparateur
  5. Bouton "Ajouter un serveur" (icône `+` dans un cercle en pointillés)
  6. Bouton "Explorer les serveurs publics" (icône boussole/compas)
- **Scrollbar** : masquée visuellement, fonctionnelle
- **Pas de texte** : uniquement des icônes visuelles

### 9.3 Barre latérale des canaux (Channel Sidebar)

- **Largeur** : 240px fixe
- **Couleur de fond** : `var(--bg-secondary)`
- **Structure de haut en bas** :
  1. **Header du serveur** (hauteur 48px) : nom du serveur en `--font-weight-semibold`, icône chevron-down pour le menu déroulant (paramètres du serveur, invitations, boost, etc.)
  2. **Zone scrollable** : liste des catégories et canaux
  3. **Panneau utilisateur** (hauteur 52px, fond légèrement plus sombre) : avatar (32px) + nom d'utilisateur + tag de statut + 3 boutons icônes (micro, écouteurs, paramètres)

#### Header du serveur — menu déroulant (clic sur le nom ou chevron)
- Items : Modifier le serveur, Créer un canal, Créer une catégorie, Inviter des membres, Paramètres du serveur, Quitter le serveur (en rouge)
- Séparateurs entre groupes logiques

#### Zone des canaux
- **Catégorie** : label en majuscules, `--font-size-xs`, `--text-muted`, flèche de collapse, bouton `+` au hover (créer un canal)
- **Canal** : indentation 8px, icône de type + nom
- Les canaux non lus ont leur nom en `--font-weight-bold` et `--text-primary`
- Les canaux avec mentions ont un badge rouge avec le nombre

### 9.4 Zone de chat principale (Main Chat Area)

- **Couleur de fond** : `var(--bg-primary)`
- **Structure de haut en bas** :
  1. **Header du canal** (hauteur 48px, bordure basse `var(--border)`) : icône de type de canal + `#` + nom du canal + topic tronqué + boutons d'action (épingles, membres, recherche, boîte de réception)
  2. **Liste des messages** : zone scrollable, flex-column inversé ou scroll to bottom
  3. **Zone de saisie** (bas) : hauteur variable

#### Header du canal — boutons d'action
- Icône épingle (`Pin`) : ouvre la liste des messages épinglés
- Icône membres (`Users`) : toggle de la liste des membres
- Icône recherche (`Search`) : ouvre la barre de recherche dans le canal
- Icône boîte de réception (`Inbox`) : mentions et notifications récentes

#### Liste des messages
- Messages groupés par auteur + fenêtre de 7 minutes (messages consécutifs du même auteur sans en-tête)
- **Message avec en-tête** : avatar (40px) à gauche + nom d'utilisateur (couleur de rôle) + timestamp ISO formaté
- **Message compacté** (même auteur, <7min) : pas d'avatar, juste le contenu + timestamp discret au hover
- Hover sur un message : fond légèrement éclairci + barre d'actions flottante (réagir, répondre, épingler, plus...)
- Scroll infini vers le haut pour charger l'historique (pagination curseur)
- Indicateur "Nouveau message" flottant si l'utilisateur est scrollé vers le haut et un nouveau message arrive

#### Zone de saisie
- **Bouton `+`** (gauche) : ouvre le menu d'upload de fichier
- **Champ texte** : fond `var(--bg-tertiary)`, arrondi `var(--radius-lg)`, placeholder `"Envoyer un message dans #nom-du-canal"`, hauteur auto-extensible (max ~50% viewport)
- **Boutons droits** : emoji picker, GIF, sticker
- Raccourcis clavier : `Entrée` pour envoyer, `Shift+Entrée` pour saut de ligne, `↑` pour éditer le dernier message, `Échap` pour annuler la réponse/edit

### 9.5 Liste des membres (Member List)

- **Largeur** : 240px fixe, collapsible (masquée par défaut sur petits écrans)
- **Couleur de fond** : `var(--bg-secondary)`
- **Structure** :
  - En-tête de groupe par rôle : `"EN LIGNE — 5"`, `"HORS LIGNE — 12"` en texte muted uppercase
  - Chaque membre : avatar (32px) + point de statut (overlay bas-droite) + nom d'utilisateur + activité optionnelle (jeu en cours, etc.)
  - Hover sur un membre : fond `var(--bg-modifier-hover)` + curseur pointer
  - Clic sur un membre : ouvre le `UserPopout`

---

## 10. Spécifications des Composants

### 10.1 `ServerIcon`

- **Taille** : 48px × 48px
- **Forme par défaut** : circulaire (`border-radius: 50%`)
- **Forme au hover / actif** : carré arrondi (`border-radius: var(--radius-lg)`) — transition 150ms
- **Contenu** : image du serveur OU 2 caractères d'abréviation en `--font-size-sm` `--font-weight-semibold`
- **Indicateur actif** : barre verticale blanche de 32px hauteur, 4px largeur, collée au bord gauche de la barre des serveurs, `border-radius: 0 4px 4px 0`
- **Indicateur non lu** : point blanc de 8px collé au bord gauche (même position, mais plus petit)
- **Badge de mention** : pastille rouge `--danger` en bas à droite, avec le nombre, taille min 16px

### 10.2 `ChannelItem`

- **Structure** : icône (16px) + nom + badge optionnel
- **Icônes selon le type** :
  - Canal texte : `Hash` (lucide)
  - Canal vocal : `Volume2` (lucide)
  - Canal d'annonces : `Megaphone` (lucide)
  - Forum : `MessageSquare` (lucide)
  - Stage : `Radio` (lucide)
- **État hover** : fond `var(--bg-modifier-hover)`
- **État actif** : fond `var(--bg-modifier-selected)`, texte `--text-primary`
- **Canal non lu** : texte en `--font-weight-bold`, `--text-primary`
- **Canal avec mention** : badge rouge avec nombre à droite
- **Canal NSFW** : icône `AlertTriangle` supplémentaire

### 10.3 `CategoryHeader`

- **Texte** : nom de la catégorie en majuscules, `--font-size-xs`, `--font-weight-semibold`, `--text-muted`
- **Icône** : flèche `ChevronRight` (collapsé) ou `ChevronDown` (développé), 12px
- **Clic** : toggle collapse/expand de tous les canaux de la catégorie
- **Hover** : affichage du bouton `+` (icône `Plus`, 16px) à droite pour créer un canal dans cette catégorie
- **Transition** : rotation de l'icône en 150ms

### 10.4 `MessageItem`

#### Message avec en-tête (premier d'un groupe)
- **Avatar** : 40px cercle, cliquable → `UserPopout`
- **Ligne de méta** : nom d'utilisateur (couleur du rôle le plus élevé avec couleur, ou `--text-primary`) + icônes de badges + timestamp (`--font-size-xs`, `--text-muted`)
- **Contenu** : Markdown rendu, `--font-size-md`, `--line-height-normal`
- **Reactions** : rangée de pills sous le message
- **Embeds** : cartes grises avec bordure colorée gauche
- **Pièces jointes** : aperçu image inline ou lien de téléchargement

#### Message compact (suite d'un groupe)
- Pas d'avatar — espace vide de 40px à gauche pour alignement
- Timestamp uniquement visible au hover (positionné absolument à gauche)
- Même rendu Markdown

#### Barre d'actions (hover)
Apparaît flottante en haut à droite du message :
- Réagir (`Smile`)
- Répondre (`Reply`)
- Épingler (`Pin`)
- Plus (`MoreHorizontal`) → menu contextuel

### 10.5 `MessageInput`

- **Fond** : `var(--bg-tertiary)`
- **Border-radius** : `var(--radius-lg)`
- **Marge** : 16px horizontal, 24px bas
- **Bouton `+`** (gauche, 16px marge) : icône `PlusCircle`, couleur `--text-muted`, hover `--text-primary`
- **Zone de texte** : `contenteditable` div ou `<textarea>` auto-resize, fond transparent, pas de border, `--font-size-md`
- **Placeholder** : `--text-muted`
- **Boutons droits** : `Smile` (emoji), `Image` (GIF), `Sticker` — chacun 20px, `--text-muted`, hover `--text-primary`
- **Bandeau de réponse** : affiché au-dessus de l'input quand on répond, avec l'aperçu du message cité et bouton `×` pour annuler

### 10.6 `UserPopout`

Popover flottant qui s'affiche au clic sur un avatar ou un nom d'utilisateur.

- **Bannière** : zone colorée en haut (couleur ou image de bannière), hauteur 60px
- **Avatar** : 80px, cercle, positionné à cheval sur la bannière et le corps, avec point de statut
- **Corps** :
  - Nom d'affichage + nom d'utilisateur (`--text-muted`)
  - Badge de statut personnalisé (si défini)
  - Bio courte (si définie)
  - Badges de profil (ligne d'icônes 16px)
  - Section "Rôles dans ce serveur"
  - Section "Serveurs en commun"
- **Boutons d'action** : "Envoyer un message" (primaire), "Ajouter en ami" / "Retirer", "Bloquer" (secondary/danger)
- **Position** : s'adapte pour ne pas sortir du viewport

### 10.7 `Modal`

- **Overlay** : `rgba(0,0,0,0.7)`, couvre tout le viewport
- **Carte** : fond `var(--bg-floating)`, `border-radius: var(--radius-lg)`, `var(--shadow-high)`, max-width variable selon le contexte (400px, 600px, 800px)
- **Structure** : header (titre + bouton `×`) + corps scrollable + footer (boutons d'action) optionnel
- **Fermeture** : clic sur l'overlay, touche `Échap`, bouton `×`
- **Animation** : fade-in de l'overlay + scale-in de la carte (200ms ease-out)

### 10.8 `Button`

Variants :

| Variant | Fond | Texte | Hover |
|---|---|---|---|
| `primary` | `var(--bg-accent)` | `#fff` | `var(--bg-accent-hover)` |
| `secondary` | `var(--bg-modifier-hover)` | `--text-primary` | `var(--bg-modifier-active)` |
| `danger` | `var(--danger)` | `#fff` | `var(--danger-hover)` |
| `link` | transparent | `var(--text-link)` | underline |
| `ghost` | transparent | `--text-muted` | `var(--bg-modifier-hover)` |

Tailles :

| Taille | Padding | Font-size | Height |
|---|---|---|---|
| `sm` | `2px 8px` | `12px` | `24px` |
| `md` | `4px 16px` | `14px` | `32px` |
| `lg` | `8px 24px` | `16px` | `40px` |

- État `disabled` : opacité 50%, curseur `not-allowed`
- État `loading` : spinner remplace le contenu, désactivé

### 10.9 `Input`

- **Fond** : `var(--bg-tertiary)`
- **Bordure** : 1px solid `var(--border)`, `border-radius: var(--radius-md)`
- **Focus** : `outline: none`, `border-color: var(--bg-accent)`, `box-shadow: 0 0 0 2px rgba(124,58,237,0.3)`
- **Erreur** : `border-color: var(--danger)` + message d'erreur en rouge en dessous
- **Label** : au-dessus en `--font-size-xs`, `--font-weight-semibold`, `--text-muted`, uppercase
- **Padding** : `10px` vertical, `16px` horizontal

### 10.10 `Toggle` (Switch)

- **Dimensions** : 40px × 22px
- **État off** : fond `var(--bg-modifier-active)`, poignée blanche 16px cercle à gauche
- **État on** : fond `var(--bg-accent)`, poignée blanche 16px cercle à droite
- **Transition** : 150ms ease pour le déplacement de la poignée et le changement de couleur

### 10.11 `Select` / `Dropdown`

- Fond `var(--bg-tertiary)`, même style que `Input`
- Icône chevron à droite, rotation à l'ouverture
- Panneau déroulant : fond `var(--bg-floating)`, `var(--shadow-medium)`, max-height 300px avec scroll
- Chaque option : 32px de hauteur, padding 8px 12px, hover `var(--bg-modifier-hover)`
- Option sélectionnée : coche à droite, texte `--text-primary`

### 10.12 `Tooltip`

- **Fond** : `var(--bg-floating)`
- **Texte** : `--font-size-xs`, `--text-primary`, max-width 200px
- **Flèche** : petite flèche CSS pointant vers l'élément déclencheur
- **Apparition** : délai 300ms au hover, fade-in 100ms
- **Position** : auto-calculée pour rester dans le viewport (top/bottom/left/right)

### 10.13 `ContextMenu`

- Déclenché par clic droit sur les éléments pertinents (messages, canaux, membres, serveurs)
- **Fond** : `var(--bg-floating)`, `var(--shadow-high)`, `border-radius: var(--radius-xl)`, min-width 200px
- **Items** : icône (16px) + label, hauteur 32px, padding 6px 8px
- **Items danger** : texte et icône en `var(--danger)`
- **Séparateurs** : ligne 1px `var(--border)` entre groupes logiques
- **Fermeture** : clic ailleurs, `Échap`
- **Animation** : scale-in rapide (100ms) depuis le point de clic

### 10.14 `Toast` / Notification

- **Position** : coin supérieur droit, empilement vertical avec espacement 8px
- **Largeur** : 320px
- **Structure** : icône colorée + texte + bouton `×` optionnel
- **Durée** : 4 secondes par défaut, puis disparition
- **Animation** : slide-in depuis la droite (200ms), slide-out vers la droite (200ms)
- **Types** :

| Type | Couleur de bordure gauche | Icône |
|---|---|---|
| `success` | `var(--success)` | `CheckCircle` |
| `error` | `var(--danger)` | `XCircle` |
| `info` | `var(--text-link)` | `Info` |
| `warning` | `var(--warning)` | `AlertTriangle` |

### 10.15 `Badge`

- Icônes de profil 16–20px affichées en ligne sur le profil / popout
- Tooltip au hover décrivant le badge
- Badges définis : Développeur OpenCord, Staff OpenCord+, Booster actif, Bot vérifié, etc.
- Stockés sous forme d'images dans `/files/badges/{badgeId}.webp`

### 10.16 `Avatar`

| Taille | Pixels | Utilisation |
|---|---|---|
| `sm` | 24px | Avatars en ligne dans les messages cités |
| `md` | 32px | Liste des membres, panneaux utilisateur |
| `lg` | 40px | Messages dans le chat |
| `xl` | 80px | Popout utilisateur |
| `xxl` | 128px | Page de profil, paramètres |

- Toujours circulaire (`border-radius: 50%`)
- **Point de statut** : cercle coloré de 10px (sm:8px, xl:14px) positionné en bas à droite, avec anneau `var(--bg-secondary)` de 2px pour le détacher visuellement
- Image manquante : affiche les initiales de l'utilisateur sur fond `var(--bg-accent)`

### 10.17 `Embed`

- **Bordure gauche** : 4px solid (couleur définie par l'auteur ou `var(--border)`)
- **Fond** : `var(--bg-secondary)`
- **Padding** : 12px
- **Structure** : auteur (icône + nom) → titre (lien) → description → champs (2 colonnes si `inline`) → image large → footer (texte + timestamp)
- **Max-width** : 520px

### 10.18 `ReactionPill`

- **Forme** : pill arrondie (`border-radius: var(--radius-full)`)
- **Contenu** : emoji (16–18px) + nombre + espace optionnel
- **Non réagi** : fond `var(--bg-secondary)`, bordure `var(--border)`
- **Réagi par l'utilisateur courant** : fond `rgba(124,58,237,0.15)`, bordure `var(--bg-accent)`, texte `var(--bg-accent)`
- **Hover** : fond légèrement plus clair
- **Clic** : toggle réaction → mise à jour optimiste + émission socket

### 10.19 `EmojiPicker`

- **Panneau flottant** : 352px × 420px, fond `var(--bg-floating)`, `var(--shadow-high)`
- **Sections** :
  1. Barre de recherche en haut
  2. Catégories en onglets icônes (Récents, Personnalisés, Gens, Nature, Nourriture, Activités, Voyages, Objets, Symboles, Drapeaux)
  3. Grille d'emojis : 8 colonnes, 36px par cellule, scroll vertical
  4. Prévisualisation en bas (emoji large + nom)
- **Recherche** : filtre en temps réel par nom d'emoji

---

## 11. Mise en Page des Paramètres

### 11.1 Paramètres Utilisateur

Structure en deux colonnes :

- **Colonne gauche** (240px, `var(--bg-secondary)`) :
  - Bloc utilisateur en haut : mini-avatar + nom d'utilisateur + lien "Modifier les profils"
  - Barre de recherche des paramètres
  - Sections groupées avec titre de section en uppercase muted et items de navigation
  - Sections : `PARAMÈTRES UTILISATEUR`, `PARAMÈTRES DE FACTURATION`, `PARAMÈTRES DE L'APPLICATION`
  - Items actifs : fond `var(--bg-modifier-selected)`

- **Colonne droite** (flexible, `var(--bg-primary)`) :
  - Titre de section `--font-size-xl` `--font-weight-bold` + description
  - Formulaire ou contenu spécifique à la page
  - Boutons d'action (Enregistrer / Réinitialiser) dans une barre fixe en bas quand des changements sont en cours

- **Bouton de fermeture** : `×` ou `Échap` en haut à droite (ou à côté de la colonne droite)

### 11.2 Paramètres du Serveur

Structure identique mais avec un contenu différent :

- **Colonne gauche** :
  - Nom du serveur en haut
  - Sections : nom de serveur (item Présentation), `EXPRESSION` (Emojis, Autocollants, Sons), `PERSONNES` (Membres, Invitations, Bannissements), `APPLICATIONS` (Intégrations), `MODÉRATION` (Logs d'audit, Paramètres de modération)
  - Items correspondant aux screenshots 3–8

- **Colonne droite** : contenu spécifique (voir specs des features correspondantes)

---

## 12. Responsive et Viewports

- L'application est **principalement conçue pour desktop** (minimum recommandé : 1280px)
- **Viewport minimum supporté** : 1024px
- En dessous de 1024px : la liste des membres est masquée automatiquement
- En dessous de 768px : la barre des canaux est collapsible via un bouton hamburger
- **Pas de version mobile native** dans la v1

---

## 13. Animations et Transitions

- **Règle générale** : transitions subtiles, jamais de `transition: all`
- Hover/active sur les items de liste : `background-color 150ms ease`
- Apparition de modales : fond en `opacity 0→1 200ms`, carte en `transform scale(0.9)→scale(1) 200ms ease-out`
- Collapse de catégorie : `height` animation (ou `max-height`) 200ms ease
- Collapse de la sidebar : `width 200ms ease`, `opacity 200ms` du contenu
- Apparition des toasts : `transform translateX(100%)→translateX(0) 200ms ease-out`
- Badge de réaction au clic : micro-animation de bounce (scale 1→1.2→1, 200ms)

---

## 14. Scrollbars Personnalisées

```css
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-primary);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}
```

- Scrollbars minces (8px) dans toutes les zones scrollables
- `scrollbar-width: thin` et `scrollbar-color` pour Firefox

---

## 15. États de Chargement

- **Skeleton loaders** pour les listes en cours de chargement (messages, canaux, membres) :
  - Blocs de hauteur fixe avec fond `var(--bg-secondary)`, animation shimmer (gradient animé de gauche à droite)
  - Messages : 3–5 skeletons de hauteur variable
  - Canaux : 6–8 skeletons de 32px
  - Membres : 10–12 skeletons de 32px avec cercle de 32px
- **Spinner** pour les actions ponctuelles (envoi de message, changement de statut)
- **État vide** : illustration + texte explicatif quand une liste est vide (ex: aucun message dans ce canal)

---

## 16. Internationalisation (i18n)

- Toutes les chaînes de texte visibles dans l'interface sont des **clés de traduction**, jamais du texte en dur
- Format : `t('key.sub_key')` ou similaire selon la bibliothèque i18n choisie
- Les textes de placeholder, labels, titres, messages d'erreur, confirmations — tout est une clé
- Les tokens de design et les noms de classes CSS restent en anglais

---

## 17. Thèmes — Light & AMOLED

### 17.1 Architecture des thèmes

L'application supporte 3 thèmes, contrôlés via un attribut `data-theme` sur `<html>` :

| Thème | Attribut | Description |
|---|---|---|
| **Dark** (défaut) | `data-theme="dark"` | Thème sombre par défaut (déjà spécifié section 2) |
| **Light** | `data-theme="light"` | Thème clair |
| **AMOLED** | `data-theme="amoled"` | Thème noir pur pour écrans OLED |

Le thème est stocké dans `localStorage` clé `opencord-theme` et synchronisé avec les paramètres utilisateur (`PATCH /api/users/@me/settings`).

### 17.2 Tokens Light

```css
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F2F3F5;
  --bg-secondary-alt: #EBEDEF;
  --bg-tertiary: #E3E5E8;
  --bg-accent: #5865F2;
  --bg-floating: #FFFFFF;
  --bg-modifier-hover: rgba(116, 127, 141, 0.08);
  --bg-modifier-active: rgba(116, 127, 141, 0.12);
  --bg-modifier-selected: rgba(116, 127, 141, 0.16);

  --text-normal: #2E3338;
  --text-muted: #747F8D;
  --text-link: #0068E0;

  --header-primary: #060607;
  --header-secondary: #4F5660;

  --channel-icon: #747F8D;
  --interactive-normal: #4F5660;
  --interactive-hover: #2E3338;
  --interactive-active: #060607;
  --interactive-muted: #C7CCD1;

  --scrollbar-thin-thumb: rgba(116, 127, 141, 0.3);
  --scrollbar-thin-track: transparent;

  --input-background: #E3E5E8;
  --input-placeholder: #747F8D;

  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.16);

  --status-danger: #DA373C;
  --status-warning: #F0B132;
  --status-positive: #23A55A;
}
```

### 17.3 Tokens AMOLED

```css
[data-theme="amoled"] {
  --bg-primary: #000000;
  --bg-secondary: #0A0A0A;
  --bg-secondary-alt: #0D0D0D;
  --bg-tertiary: #111111;
  --bg-accent: #5865F2;
  --bg-floating: #0A0A0A;
  --bg-modifier-hover: rgba(255, 255, 255, 0.04);
  --bg-modifier-active: rgba(255, 255, 255, 0.06);
  --bg-modifier-selected: rgba(255, 255, 255, 0.08);

  --text-normal: #DCDDDE;
  --text-muted: #72767D;
  --text-link: #00AFF4;

  --header-primary: #FFFFFF;
  --header-secondary: #B9BBBE;

  --channel-icon: #72767D;
  --interactive-normal: #B9BBBE;
  --interactive-hover: #DCDDDE;
  --interactive-active: #FFFFFF;
  --interactive-muted: #4F545C;

  --scrollbar-thin-thumb: rgba(255, 255, 255, 0.15);
  --scrollbar-thin-track: transparent;

  --input-background: #111111;
  --input-placeholder: #72767D;

  --border-subtle: rgba(255, 255, 255, 0.04);
  --border-strong: rgba(255, 255, 255, 0.08);

  --status-danger: #ED4245;
  --status-warning: #FEE75C;
  --status-positive: #57F287;
}
```

### 17.4 Interface — Paramètres → Apparence

- Section **Thème** : 3 cards radio (Dark / Light / AMOLED)
  - Chaque card affiche un mini-aperçu de l'interface dans le thème correspondant (screenshot statique ou composant miniature)
  - Le thème sélectionné est bordé avec `--bg-accent`
- Le changement de thème est appliqué instantanément (pas de rechargement)
- Transition CSS : `transition: background-color 0.15s ease, color 0.15s ease` sur `body`

### 17.5 Règles de design inter-thèmes

- Les couleurs de rôle et les couleurs d'embed sont rendues telles quelles quel que soit le thème
- Les images d'avatar, bannière et emoji ne changent pas entre les thèmes
- Les ombres (`box-shadow`) sont plus prononcées en Light (opacité ×2) et absentes en AMOLED
- Les séparateurs utilisent `--border-subtle` en Dark/AMOLED et `--border-strong` en Light

---

## 18. Accessibilité (a11y)

### 18.1 Standards ciblés

OpenCord vise la conformité **WCAG 2.1 niveau AA** pour les critères suivants :

| Critère | Exigence | Implémentation |
|---|---|---|
| **1.1.1** Contenu non textuel | Toutes les images ont un `alt` | Avatars : `alt="{username}'s avatar"`, emojis : `alt=":emoji_name:"` |
| **1.3.1** Information et relations | Structure sémantique | Utiliser `<nav>`, `<main>`, `<aside>`, `<header>`, `<section>`, `<article>` |
| **1.4.3** Contraste minimal | Ratio 4.5:1 pour le texte, 3:1 pour les grands textes | Vérifié pour les 3 thèmes |
| **2.1.1** Clavier | Toutes les fonctions accessibles au clavier | Focus visible, tabulation logique |
| **2.4.1** Contourner les blocs | Liens d'évitement | Lien "Aller au contenu" en haut de page |
| **2.4.7** Visibilité du focus | Indicateur de focus visible | Outline `2px solid --bg-accent` avec offset `2px` |
| **4.1.2** Nom, rôle, valeur | Composants interactifs labellisés | `aria-label`, `aria-describedby`, `role` |

### 18.2 Navigation au clavier

#### Raccourcis globaux

| Raccourci | Action |
|---|---|
| `Ctrl + K` | Ouvrir la recherche rapide (Quick Switcher) |
| `Alt + ↑ / ↓` | Canal précédent / suivant |
| `Alt + Shift + ↑ / ↓` | Canal non lu précédent / suivant |
| `Ctrl + Shift + A` | Ouvrir la boîte de réception (mentions) |
| `Escape` | Fermer la modale / popout actif |
| `Tab` | Navigation entre les zones (sidebar → header → chat → members) |
| `Enter` | Activer l'élément focalisé |

#### Zones de navigation (landmarks)

| Zone | Élément | `role` / Balise |
|---|---|---|
| Liste des serveurs | `<nav>` | `navigation` avec `aria-label="Servers"` |
| Liste des canaux | `<nav>` | `navigation` avec `aria-label="Channels"` |
| Zone de chat | `<main>` | `main` avec `aria-label="Chat"` |
| Liste des messages | `<ol>` | `list` avec `aria-label="Messages in #channel"` |
| Liste des membres | `<aside>` | `complementary` avec `aria-label="Members"` |
| Zone de saisie | `<div>` | `textbox` avec `aria-label="Message #channel"` |

### 18.3 ARIA sur les composants

#### Messages

```html
<li role="article" aria-roledescription="Message"
    aria-label="{username}, {timestamp}">
  <img alt="{username}'s avatar" ... />
  <span aria-hidden="true">{timestamp}</span>
  <div>{content}</div>
</li>
```

- Les groupes de messages consécutifs du même auteur utilisent `aria-label` uniquement sur le premier message
- Les messages système (join, boost) ont `aria-roledescription="System message"`

#### Modales

```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Titre</h2>
  ...
</div>
```

- Focus trap : le focus reste dans la modale tant qu'elle est ouverte
- `Escape` ferme la modale et restaure le focus à l'élément déclencheur

#### Tooltips

```html
<button aria-describedby="tooltip-123">
  <svg aria-hidden="true" ... />
</button>
<div role="tooltip" id="tooltip-123">Texte du tooltip</div>
```

#### Menu contextuel

```html
<div role="menu" aria-label="Message actions">
  <div role="menuitem" tabindex="0">Éditer</div>
  <div role="menuitem" tabindex="-1">Supprimer</div>
  <div role="separator"></div>
  <div role="menuitem" tabindex="-1">Signaler</div>
</div>
```

Navigation : `↑ / ↓` pour parcourir, `Enter` pour activer, `Escape` pour fermer.

### 18.4 Réduction de mouvement

Si `prefers-reduced-motion: reduce` est détecté :

- Désactiver toutes les animations CSS (`transition-duration: 0.01ms`)
- Désactiver les GIF animés (afficher la première frame)
- Désactiver les animations de notification (slide-in)
- Remplacer les transitions de page par des changements instantanés

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

### 18.5 Lecteur d'écran — Messages en temps réel

Les nouveaux messages sont annoncés via une `aria-live` region :

```html
<div aria-live="polite" aria-atomic="false" class="sr-only">
  <!-- Les nouveaux messages sont insérés ici pour annonce -->
</div>
```

- Nouveaux messages : `aria-live="polite"` (n'interrompt pas la lecture en cours)
- Mentions directes : `aria-live="assertive"` (interrompt la lecture)
- Typing indicator : `aria-live="polite"` avec `aria-label="{username} est en train d'écrire…"`

### 18.6 Paramètres d'accessibilité

Section dans **Paramètres → Accessibilité** :

| Paramètre | Type | Description |
|---|---|---|
| Réduire les animations | Toggle | Force `prefers-reduced-motion` même si l'OS ne le demande pas |
| Jouer les GIF automatiquement | Toggle | Désactiver pour afficher la première frame uniquement |
| Descriptions textuelles des emojis | Toggle | Afficher `:thumbs_up:` à côté de 👍 |
| Taille de la police | Slider | 12px – 20px (défaut 16px) |
| Espacement des messages | Dropdown | Confortable (défaut) / Compact |
| Saturation des rôles | Slider | 0% – 100% (réduit la vivacité des couleurs de rôle pour meilleure lisibilité)
