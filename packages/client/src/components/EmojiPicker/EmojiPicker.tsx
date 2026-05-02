import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import styles from './EmojiPicker.module.css';

const RECENT_KEY = 'opencord_recent_emojis';
const MAX_RECENT = 20;

const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  Nature: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🌸','🌺','🌻','🌹','🍀','🌿','🍃','🌳','🌲','🌵','🌾','🍄','🌍','🌊','🌈','🌙','⭐','☀️','⚡','❄️','🔥','💧'],
  Food: ['🍎','🍊','🍋','🍇','🍓','🫐','🍑','🍒','🍍','🥭','🍌','🍉','🍈','🍐','🥝','🍅','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🧄','🧅','🥜','🌰','🍞','🥐','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥙','🍱','🍣','🍜','🍝','🍛','🍲','🥘','🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','☕','🍵','🍺','🍻','🍷','🥂'],
  Activities: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥍','🏑','🏏','⛳','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','🏋️','🤸','🧘','🏄','🏊','🤽','🚴','🏆','🥇','🥈','🥉','🎯','🎮','🎲','♟️','🎭','🎨','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻'],
  Travel: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚁','🛸','🚀','✈️','⛵','🚢','🏰','🏯','🗼','🗽','🗿','⛺','🌁','🌃','🌆','🌇','🌉','🌌','🌠','🌅','🌄','🌞'],
  Objects: ['💡','🔦','🕯️','💰','💎','⚖️','💼','🛍️','🎒','🧳','🌂','🧲','🔧','🔨','⚒️','🛠️','🔩','🔑','🗝️','🔐','🔒','🔓','📦','📫','📬','📰','📝','✏️','🖊️','🔍','🔎','📱','💻','🖥️','📷','📹','📞','☎️','📡','🔋','💾','💿','📀'],
  Symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','☯️','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⚡','💯','🔞','📵','🚫','❌','⭕','🛑','⛔','📛','🚨','‼️','⁉️','❓','❔','❕','❗','✅','♻️'],
  Flags: ['🏴‍☠️','🚩','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇯🇵','🇨🇳','🇰🇷','🇧🇷','🇮🇳','🇷🇺','🇨🇦','🇦🇺','🇪🇸','🇮🇹','🇵🇹','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇵🇱','🇨🇿','🇭🇺','🇷🇴','🇬🇷','🇹🇷','🇮🇱','🇸🇦','🇮🇷','🇮🇶','🇦🇪','🇿🇦','🇲🇽','🇦🇷','🇨🇴','🇨🇱','🇵🇪','🇻🇪','🇪🇬','🇳🇬','🇰🇪','🇪🇹'],
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

  const handleSelect = (emoji: string) => {
    const newRecents = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    setRecents(newRecents);
    localStorage.setItem(RECENT_KEY, JSON.stringify(newRecents));
    onSelect(emoji);
  };

  const allTabs = ['Recent', ...Object.keys(EMOJI_CATEGORIES)];

  const displayCategories = (() => {
    if (search) {
      const lc = search.toLowerCase();
      const matched: Record<string, string[]> = {};
      for (const [cat, emojis] of Object.entries(EMOJI_CATEGORIES)) {
        if (cat.toLowerCase().includes(lc)) {
          matched[cat] = emojis;
        }
      }
      if (Object.keys(matched).length > 0) return matched;
      return { 'All': Object.values(EMOJI_CATEGORIES).flat() };
    }
    if (activeTab === 'Recent') {
      return recents.length > 0 ? { Recent: recents } : {};
    }
    const emojis = EMOJI_CATEGORIES[activeTab];
    return emojis ? { [activeTab]: emojis } : {};
  })();

  const isEmpty = Object.keys(displayCategories).length === 0 || Object.values(displayCategories).every((e) => e.length === 0);

  return createPortal(
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 1500 }}
    >
      <div className={styles.searchWrapper}>
        <Search size={14} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Rechercher une catégorie…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!search && (
        <div className={styles.tabs}>
          {allTabs.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab && !search ? styles.active : ''}`}
              onClick={() => { setActiveTab(tab); }}
              title={tab}
            >
              {CATEGORY_ICONS[tab] || '•'}
            </button>
          ))}
        </div>
      )}

      <div className={styles.grid}>
        {isEmpty ? (
          <div className={styles.empty}>Aucun emoji</div>
        ) : (
          Object.entries(displayCategories).map(([cat, emojis]) => (
            <div key={cat}>
              <div className={styles.sectionLabel}>{cat}</div>
              <div className={styles.emojiRow}>
                {emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    className={styles.emoji}
                    onClick={() => handleSelect(emoji)}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
