import { useEffect, useCallback, useRef } from 'react';
import Mousetrap from 'mousetrap';

interface ShortcutConfig {
  key: string;
  callback: (e: KeyboardEvent, combo: string) => void;
  action?: 'keydown' | 'keyup' | 'keypress';
  disabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutConfig[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleShortcut = useCallback((combo: string) => (e: KeyboardEvent) => {
    const shortcut = shortcutsRef.current.find(s => s.key === combo && !s.disabled);
    if (shortcut) {
      // Check if an input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if ((tag === 'input' || tag === 'textarea' || tag === 'select') && !combo.startsWith('ctrl') && !combo.startsWith('cmd')) {
        return; // Disable text shortcuts when input is focused
      }
      e.preventDefault();
      shortcut.callback(e, combo);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const bindings: Array<{ combo: string; func: (e: KeyboardEvent) => void }> = [];

    shortcutsRef.current.forEach(shortcut => {
      if (shortcut.disabled) return;
      const handler = handleShortcut(shortcut.key);
      Mousetrap.bind(shortcut.key, handler, shortcut.action);
      bindings.push({ combo: shortcut.key, func: handler });
    });

    return () => {
      bindings.forEach(({ combo }) => Mousetrap.unbind(combo));
    };
  }, [enabled, handleShortcut]);
}

// Platform-aware shortcut helpers
export function getShortcutKey(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (isMac) {
    return shortcut
      .replace(/Ctrl/g, 'Cmd')
      .replace(/Alt/g, 'Option')
      .replace(/Shift/g, 'Shift');
  }
  return shortcut;
}

export const DEFAULT_SHORTCUTS = {
  // Navigation
  MARK_SERVER_READ: { win: 'Escape', mac: 'Escape' },
  NEXT_UNREAD_CHANNEL: { win: 'Alt+Down', mac: 'Option+Down' },
  PREV_UNREAD_CHANNEL: { win: 'Alt+Up', mac: 'Option+Up' },
  NEXT_UNREAD_GUILD: { win: 'Alt+Shift+Down', mac: 'Option+Shift+Down' },
  PREV_UNREAD_GUILD: { win: 'Alt+Shift+Up', mac: 'Option+Shift+Up' },

  // Search
  QUICK_SWITCHER: { win: 'Ctrl+K', mac: 'Cmd+K' },
  SEARCH_MESSAGES: { win: 'Ctrl+F', mac: 'Cmd+F' },
  JUMP_TO_UNREAD: { win: 'Ctrl+Shift+Alt+Down', mac: 'Cmd+Shift+Option+Down' },

  // Voice
  TOGGLE_MIC: { win: 'Ctrl+Shift+M', mac: 'Cmd+Shift+M' },
  TOGGLE_CAMERA: { win: 'Ctrl+Shift+V', mac: 'Cmd+Shift+V' },

  // Text editing
  REPLY_TO_MESSAGE: { win: 'R', mac: 'R' },
  EDIT_LAST_MESSAGE: { win: 'Up', mac: 'Up' },
  CANCEL_EDIT: { win: 'Escape', mac: 'Escape' },
  SEND_MESSAGE: { win: 'Ctrl+Enter', mac: 'Cmd+Enter' },
  NEW_LINE: { win: 'Shift+Enter', mac: 'Shift+Enter' },

  // UI
  OPEN_EMOJI_PICKER: { win: 'Ctrl+E', mac: 'Cmd+E' },
  OPEN_SETTINGS: { win: 'Ctrl+,', mac: 'Cmd+,' },
  TOGGLE_MEMBER_SIDEBAR: { win: 'Ctrl+U', mac: 'Cmd+U' },
  FULLSCREEN: { win: 'F11', mac: 'Ctrl+Cmd+F' },

  // Audio (deferred)
  DISCONNECT_AUDIO: { win: 'Ctrl+Shift+D', mac: 'Cmd+Shift+D' },
};
