import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Command, Hash, AtSign, Smile } from 'lucide-react';
import { api } from '../../services/api';
import styles from './SlashCommandAutocomplete.module.css';

interface CommandOption {
  name: string;
  description: string;
  required?: boolean;
  type: number;
}

interface ApplicationCommand {
  id: string;
  name: string;
  description: string;
  options?: CommandOption[];
  type: number;
}

interface SlashCommandAutocompleteProps {
  channelId: string;
  guildId?: string;
  inputValue: string;
  onSelect: (command: string, options?: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

type SuggestionType = 'command' | 'channel' | 'user' | 'emoji' | 'option';

interface Suggestion {
  type: SuggestionType;
  label: string;
  value: string;
  description?: string;
  icon?: string;
}

export function SlashCommandAutocomplete({
  channelId,
  guildId,
  inputValue,
  onSelect,
  onClose,
  anchorRef,
}: SlashCommandAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const isSlashCommand = inputValue.startsWith('/');

  useEffect(() => {
    if (!isSlashCommand) {
      setSuggestions([]);
      return;
    }

    const query = inputValue.slice(1).toLowerCase();
    const fetchSuggestions = async () => {
      const suggestions: Suggestion[] = [];

      if (!query) {
        // Show available commands
        try {
          const commands = await api.slashCommands.listCommands<any[]>(guildId!) || [];
          suggestions.push(
            ...commands.map((cmd: ApplicationCommand) => ({
              type: 'command' as SuggestionType,
              label: `/${cmd.name}`,
              value: cmd.name,
              description: cmd.description,
              icon: '⌘',
            }))
          );
        } catch {
          // Ignore errors
        }
      } else {
        // Filter commands
        try {
          const commands = await api.slashCommands.listCommands<any[]>(guildId!) || [];
          const filtered = commands.filter((cmd: ApplicationCommand) =>
            cmd.name.toLowerCase().includes(query) ||
            cmd.description.toLowerCase().includes(query)
          );
          suggestions.push(
            ...filtered.map((cmd: ApplicationCommand) => ({
              type: 'command' as SuggestionType,
              label: `/${cmd.name}`,
              value: cmd.name,
              description: cmd.description,
              icon: '⌘',
            }))
          );
        } catch {
          // Ignore errors
        }

        // Suggest channels if query looks like channel mention
        if (query.startsWith('#') || query.includes('')) {
          suggestions.push(
            { type: 'channel', label: '#général', value: 'general', description: 'Salon textuel' },
            { type: 'channel', label: '#musique', value: 'music', description: 'Salon textuel' },
          );
        }

        // Suggest users if query looks like user mention
        if (query.startsWith('@') || query.includes('@')) {
          suggestions.push(
            { type: 'user', label: '@Utilisateur', value: 'user123', description: 'Membre' },
          );
        }

        // Suggest emojis
        if (query.includes(':')) {
          suggestions.push(
            { type: 'emoji', label: ':smile:', value: '😊', icon: '😊' },
            { type: 'emoji', label: ':heart:', value: '❤️', icon: '❤️' },
          );
        }
      }

      setSuggestions(suggestions);
      setSelectedIndex(0);
    };

    const timer = setTimeout(fetchSuggestions, 150);
    return () => clearTimeout(timer);
  }, [inputValue, isSlashCommand]);

  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const containerHeight = 300;
      const top = Math.max(8, rect.top - containerHeight - 8);
      const left = Math.max(8, rect.left);
      setPosition({ top, left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        handleSelect(suggestions[selectedIndex]);
      }
    };

    if (isSlashCommand && suggestions.length > 0) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [isSlashCommand, suggestions, selectedIndex]);

  const handleSelect = (suggestion: Suggestion | undefined) => {
    if (!suggestion) return;
    if (suggestion.type === 'command') {
      onSelect(`/${suggestion.value} `);
    } else if (suggestion.type === 'emoji') {
      onSelect(suggestion.value);
    } else {
      onSelect(suggestion.value);
    }
    onClose();
  };

  if (!isSlashCommand || suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ top: position.top, left: position.left }}
      role="listbox"
      aria-label="Commandes slash"
      aria-activedescendant={suggestions.length > 0 ? `slash-option-${selectedIndex}` : undefined}
    >
      <div className={styles.header}>
        <Command size={16} />
        <span>Commandes slash</span>
      </div>
      <div className={styles.list}>
        {suggestions.map((suggestion, index) => (
          <div
            key={`${suggestion.type}-${suggestion.value}`}
            id={`slash-option-${index}`}
            className={`${styles.item} ${index === selectedIndex ? styles.selected : ''}`}
            onClick={() => handleSelect(suggestion)}
            onMouseEnter={() => setSelectedIndex(index)}
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={-1}
          >
            <div className={styles.icon}>
              {suggestion.icon === '⌘' ? (
                <Command size={16} />
              ) : suggestion.icon === '😊' || suggestion.icon === '❤️' ? (
                <span>{suggestion.icon}</span>
              ) : suggestion.type === 'channel' ? (
                <Hash size={16} />
              ) : suggestion.type === 'user' ? (
                <AtSign size={16} />
              ) : (
                <Smile size={16} />
              )}
            </div>
            <div className={styles.content}>
              <div className={styles.label}>{suggestion.label}</div>
              {suggestion.description && (
                <div className={styles.description}>{suggestion.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
