import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import styles from './EmojiPicker.module.css';

const RECENT_KEY = 'opencord_recent_emojis';
const MAX_RECENT = 20;
const EMOJIS_PER_ROW = 8;

const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  Nature: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🌸','🌺','🌻','🌹','🍀','🌿','🍃','🌳','🌲','🌵','🌾','🍄','🌍','🌊','🌈','🌙','⭐','☀️','⚡','❄️','🔥','💧'],
  Food: ['🍎','🍊','🍋','🍇','🍓','🫐','🍑','🍒','🍍','🥭','🍌','🍉','🍈','🍐','🥝','🍅','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🧄','🧅','🥜','🌰','🍞','🥐','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥙','🍱','🍣','🍜','🍝','🍛','🍲','🥘','🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','☕','🍵','🍺','🍻','🍷','🥂'],
  Activities: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥍','🏑','🏏','⛳','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','🏆','🥇','🥈','🥉','🎯','🎮','🎲','♟️','🎭','🎨','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻'],
  Travel: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚁','🛸','🚀','✈️','⛵','🚢','🏰','🏯','🗼','🗽','🗿','⛺','🌁','🌃','🌆','🌇','🌉','🌌','🌠','🌅','🌄','🌞'],
  Objects: ['💡','🔦','🕯️','💰','💎','⚖️','💼','🛍️','🎒','🧳','🌂','🧲','🔧','🔨','⚒️','🛠️','🔩','🔑','🗝️','🔐','🔒','🔓','📦','📫','📬','📰','📝','✏️','🖊️','🔍','🔎','📱','💻','🖥️','📷','📹','📞','☎️','📡','🔋','💾','💿','📀'],
  Symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','☯️','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⚡','💯','🔞','📵','🚫','❌','⭕','🛑','⛔','📛','🚨','‼️','⁉️','❓','❔','❕','❗','✅','♻️'],
  Flags: ['🏴‍☠️','🚩','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇯🇵','🇨🇳','🇰🇷','🇧🇷','🇮🇳','🇷🇺','🇨🇦','🇦🇺','🇪🇸','🇮🇹','🇵🇹','🇳🇴','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇱','🇺🇦','🇫🇮','🇵🇱','🇨🇿','🇲🇽','🇧🇷','🇹🇷','🇮🇱','🇮🇶','🇦🇪','🇿🇦','🇲🇽','🇪🇬','🇰🇪','🇻🇪','🇨🇴','🇨🇱','🇻🇺','🇪🇬','🇳🇬','🇯🇵'],
};

const CATEGORY_ICONS: Record<string, string> = {
  Recent: '🕐',
  Smileys: '😀',
  Nature: '🌿',
  Food: '🍎',
  Activities: '⚽',
  Travel: '✈️',
  Objects: '💡',
  Symbols: '❤️',
  Flags: '🏳️',
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

export function EmojiPicker({ onSelect, onClose, anchorRef }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('Recent');
  const [recents, setRecents] = useState<string[]>([]);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allEmojis = useCallback(() => {
    if (search) {
      const lc = search.toLowerCase();
      const matched: string[] = [];
      for (const emojis of Object.values(EMOJI_CATEGORIES)) {
        for (const e of emojis) {
          if (e.includes(lc) || lc.split('').every(c => e.includes(c))) matched.push(e);
        }
      }
      return matched.length > 0 ? matched : Object.values(EMOJI_CATEGORIES).flat();
    }
    if (activeTab === 'Recent') return recents.length > 0 ? recents : [];
    return EMOJI_CATEGORIES[activeTab] || [];
  }, [search, activeTab, recents]);

  const emojis = allEmojis();
  const total = emojis.length;

  useEffect(() => {
    const stored = localStorage.getItem(RECENT_KEY);
    if (stored) {
      try { setRecents(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const pickerHeight = 440;
      const pickerWidth = 384;
      const top = Math.max(8, rect.top - pickerHeight - 8);
      const left = Math.max(8, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8));
      setPosition({ top, left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + EMOJIS_PER_ROW, total - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - EMOJIS_PER_ROW, 0));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, total - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (emojis[selectedIndex]) handleSelect(emojis[selectedIndex]);
      }
    };
    if (emojis.length > 0) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [emojis, selectedIndex, total]);

  const handleSelect = (emoji: string) => {
    const newRecents = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    setRecents(newRecents);
    localStorage.setItem(RECENT_KEY, JSON.stringify(newRecents));
    onSelect(emoji);
    onClose();
  };

  const allTabs = ['Recent', ...Object.keys(EMOJI_CATEGORIES)];

  return createPortal(
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 1500 }}
      role="grid"
      aria-label="Sélecteur d'emoji"
    >
      <div className={styles.searchWrapper}>
        <Search size={14} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Rechercher une catégorie…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
          autoFocus
        />
      </div>

      {!search && (
        <div className={styles.tabs} role="tablist" aria-label="Catégories">
          {allTabs.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab && !search ? styles.active : ''}`}
              onClick={() => { setActiveTab(tab); setSelectedIndex(0); }}
              title={tab}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {CATEGORY_ICONS[tab] || '•'}
            </button>
          ))}
        </div>
      )}

      <div className={styles.grid} role="presentation">
        {emojis.length === 0 ? (
          <div className={styles.empty}>Aucun emoji</div>
        ) : (
          emojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              className={`${styles.emoji} ${i === selectedIndex ? styles.selected : ''}`}
              onClick={() => handleSelect(emoji)}
              title={emoji}
              role="gridcell"
              aria-label={emoji}
              tabIndex={i === selectedIndex ? 0 : -1}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
