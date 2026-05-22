import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useKeyboardShortcuts, getShortcutKey } from '../../hooks/useKeyboardShortcuts.js';
import styles from './QuickSwitcher.module.css';

interface QuickSwitcherResult {
  id: string;
  type: 'channel' | 'dm' | 'member' | 'guild';
  name: string;
  subtitle?: string;
  icon?: string;
  guild_id?: string;
}

export function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Get current guild ID from URL
  const guildIdMatch = window.location.pathname.match(/\/channels\/(\d+)/);
  const currentGuildId = guildIdMatch?.[1];

  // Fetch search results
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['quickSwitcher', query, currentGuildId],
    queryFn: async () => {
      if (!query.trim()) return [];
      const results: QuickSwitcherResult[] = [];

      // Search channels in current guild
      if (currentGuildId) {
        try {
          const guildRes: any = await api.get(`/guilds/${currentGuildId}`);
          const channels = guildRes.channels || [];
          const filtered = channels.filter((ch: any) =>
            ch.name.toLowerCase().includes(query.toLowerCase())
          );
          results.push(...filtered.map((ch: any) => ({
            id: ch.id,
            type: 'channel' as const,
            name: `#${ch.name}`,
            subtitle: ch.topic || undefined,
            guild_id: currentGuildId,
          })));
        } catch {}
      }

      // Search DMs
      try {
        const dmsRes: any = await api.get('/dms');
        const dms = Array.isArray(dmsRes) ? dmsRes : [];
        const filtered = dms.filter((dm: any) => {
          const name = dm.recipients?.map((r: any) => r.username).join(', ') || '';
          return name.toLowerCase().includes(query.toLowerCase());
        });
        results.push(...filtered.map((dm: any) => ({
          id: dm.id,
          type: 'dm' as const,
          name: dm.recipients?.map((r: any) => r.username).join(', ') || 'DM',
          icon: dm.recipients?.[0]?.avatar,
        })));
      } catch {}

      // Search guild members
      if (currentGuildId) {
        try {
          const membersRes: any = await api.get(`/guilds/${currentGuildId}/members?query=${encodeURIComponent(query)}&limit=10`);
          const members = membersRes.members || [];
          results.push(...members.map((m: any) => ({
            id: m.user.id,
            type: 'member' as const,
            name: m.nickname || m.user.global_name || m.user.username,
            subtitle: `@${m.user.username}`,
            icon: m.user.avatar,
            guild_id: currentGuildId,
          })));
        } catch {}
      }

      // Search other guilds (simplified - just check user's guilds)
      if (!currentGuildId || query.trim()) {
        try {
          const guildsRes: any = await api.get('/users/@me/guilds');
          const guilds = guildsRes.guilds || [];
          const filtered = guilds.filter((g: any) =>
            g.name.toLowerCase().includes(query.toLowerCase())
          );
          results.push(...filtered.map((g: any) => ({
            id: g.id,
            type: 'guild' as const,
            name: g.name,
            icon: g.icon,
          })));
        } catch {}
      }

      return results;
    },
    enabled: open && query.length > 0,
  });

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Handle selection
  const handleSelect = useCallback((result: QuickSwitcherResult) => {
    if (result.type === 'channel' && result.guild_id) {
      navigate(`/channels/${result.guild_id}/${result.id}`);
    } else if (result.type === 'dm') {
      navigate(`/channels/@me/${result.id}`);
    } else if (result.type === 'member') {
      // Open DM with member (simplified)
      navigate(`/channels/@me`);
    } else if (result.type === 'guild') {
      navigate(`/channels/${result.id}`);
    }
    onClose();
  }, [navigate, onClose]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: getShortcutKey('Ctrl+K'),
        callback: () => { if (open) onClose(); },
      },
      {
        key: 'Escape',
        callback: () => onClose(),
      },
    ],
    enabled: open,
  });

  // Handle arrow keys and enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) handleSelect(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search channels, DMs, members, servers..."
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />

        {isLoading && <div className={styles.loading}>Searching...</div>}

        {!isLoading && query.length > 0 && results.length === 0 && (
          <div className={styles.noResults}>No results found</div>
        )}

        {results.length > 0 && (
          <ul className={styles.resultsList}>
            {results.map((result, index) => (
              <li
                key={`${result.type}-${result.id}`}
                className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={styles.resultIcon}>
                  {result.type === 'channel' && '#'}
                  {result.type === 'dm' && '@'}
                  {result.type === 'member' && '@'}
                  {result.type === 'guild' && '📋'}
                  {result.icon && <img src={result.icon} alt="" className={styles.icon} />}
                </div>
                <div className={styles.resultText}>
                  <span className={styles.resultName}>{result.name}</span>
                  {result.subtitle && <span className={styles.resultSubtitle}>{result.subtitle}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.hint}>
          <kbd>{navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}</kbd> + <kbd>K</kbd> to open
        </div>
      </div>
    </div>
  );
}
