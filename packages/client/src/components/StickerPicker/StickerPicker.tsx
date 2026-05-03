import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Smile } from 'lucide-react';
import { api } from '../../services/api';
import styles from './StickerPicker.module.css';

interface Sticker {
  id: string;
  name: string;
  description?: string;
  tags?: string;
  asset?: string;
  format_type: number;
  guild_id?: string;
}

interface StickerPack {
  id: string;
  name: string;
  description?: string;
  stickers: Sticker[];
}

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  guildId?: string;
}

export function StickerPicker({ onSelect, onClose, anchorRef, guildId }: StickerPickerProps) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [guildStickers, setGuildStickers] = useState<Sticker[]>([]);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const pickerHeight = 400;
      const pickerWidth = 340;
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
    loadStickers();
  }, [guildId]);

  const loadStickers = useCallback(async () => {
    setLoading(true);
    try {
      const [packsRes, guildRes] = await Promise.all([
        api.stickers.getPacks<any>(),
        guildId ? api.stickers.getGuildStickers<any>(guildId) : Promise.resolve({ stickers: [] }),
      ]);
      setPacks(packsRes.packs || packsRes || []);
      setGuildStickers(guildRes.stickers || guildRes || []);
    } catch (err) {
      console.error('Failed to load stickers:', err);
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  const allStickers: Sticker[] = [
    ...guildStickers,
    ...packs.flatMap((pack: StickerPack) => pack.stickers || []),
  ];

  const filtered = search
    ? allStickers.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.tags && s.tags.toLowerCase().includes(search.toLowerCase()))
      )
    : allStickers;

  const getStickerUrl = (sticker: Sticker) => {
    if (sticker.asset) return sticker.asset;
    return `/api/stickers/${sticker.id}/asset`;
  };

  return createPortal(
    <div
      ref={containerRef}
      className={styles.picker}
      style={{ top: position.top, left: position.left }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Stickers</span>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className={styles.searchBox}>
        <Search size={14} />
        <input
          type="text"
          placeholder="Rechercher un sticker..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.stickerGrid}>
        {loading ? (
          <div className={styles.loading}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>Aucun sticker trouvé</div>
        ) : (
          filtered.map((sticker) => (
            <div
              key={sticker.id}
              className={styles.stickerItem}
              onClick={() => onSelect(sticker)}
              title={sticker.name}
            >
              <img
                src={getStickerUrl(sticker)}
                alt={sticker.name}
                className={styles.stickerImage}
                loading="lazy"
              />
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}
