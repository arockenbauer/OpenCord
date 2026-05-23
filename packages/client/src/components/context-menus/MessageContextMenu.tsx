import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Edit2, Trash2, Copy, Hash, Pin, Flag, Smile, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useMessageStore } from '../../stores/messageStore';
import { api } from '../../services/api';
import styles from './ContextMenu.module.css';

interface Message {
  id: string;
  channel_id: string;
  author: { id: string; username: string };
  content: string | null;
  pinned?: boolean;
  pending?: boolean;
  [key: string]: any;
}

interface MessageContextMenuProps {
  message: Message;
  channelId: string;
  guildId?: string;
  position: { x: number; y: number };
  onClose: () => void;
  onReply: () => void;
  onForward?: () => void;
  onAddReaction?: () => void;
  onEdit?: (messageId: string, content: string) => void;
  onStartThread?: (message: Message) => void;
}

function hasPermission(guildId: string | undefined, userId: string, bit: bigint): boolean {
  if (!guildId) return false;
  const guild = useGuildStore.getState().guilds.get(guildId);
  if (!guild) return false;
  if (guild.owner_id === userId) return true;
  const member = guild.members?.find((m: any) => m.user.id === userId);
  if (!member) return false;
  for (const roleId of member.roles) {
    const role = guild.roles?.find((r: any) => r.id === roleId);
    if (role) {
      try {
        const perms = BigInt(role.permissions);
        if ((perms & BigInt(8)) !== BigInt(0)) return true;
        if ((perms & bit) !== BigInt(0)) return true;
      } catch { /* skip */ }
    }
  }
  return false;
}

export function MessageContextMenu({ message, channelId, guildId, position, onClose, onReply, onForward, onAddReaction, onEdit, onStartThread }: MessageContextMenuProps) {
  const currentUser = useAuthStore((s) => s.user);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwn = currentUser?.id === message.author.id;
  const isPending = message.pending === true;
  const MANAGE_MESSAGES = BigInt(8192);
  const canManage = guildId ? hasPermission(guildId, currentUser?.id || '', MANAGE_MESSAGES) : false;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const adjustedPos = (() => {
    const menuW = 220;
    const menuH = 320;
    return {
      left: Math.min(position.x, window.innerWidth - menuW - 8),
      top: Math.min(position.y, window.innerHeight - menuH - 8),
    };
  })();

  const handleDelete = async () => {
    onClose();
    await deleteMessage(channelId, message.id);
  };

  const handlePin = async () => {
    onClose();
    if (message.pinned) {
      await api(`/api/channels/${channelId}/pins/${message.id}`, { method: 'DELETE' });
      updateMessage(channelId, { id: message.id, pinned: false });
    } else {
      await api(`/api/channels/${channelId}/pins/${message.id}`, { method: 'PUT' });
      updateMessage(channelId, { id: message.id, pinned: true });
    }
    window.dispatchEvent(new CustomEvent('pinsUpdated', { detail: { channelId } }));
  };

  const handleCopyText = () => {
    if (message.content) navigator.clipboard.writeText(message.content);
    onClose();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(message.id);
    onClose();
  };

  const handleReport = async () => {
    onClose();
    try {
      await api(`/api/channels/${channelId}/messages/${message.id}/reports`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Message signalé depuis le menu contextuel',
        }),
      });
    } catch {
      // Intentionally silent here; UI remains responsive even if report submission fails.
    }
  };

  return createPortal(
    <div className={styles.menu} ref={menuRef} style={{ position: 'fixed', left: adjustedPos.left, top: adjustedPos.top, zIndex: 1400 }}>
      <button className={styles.item} onClick={() => { onReply(); onClose(); }}>
        <Reply size={16} />
        Répondre
      </button>
      {!isPending && onForward && (
        <button className={styles.item} onClick={() => { onForward(); onClose(); }}>
          <MessageCircle size={16} />
          Transférer
        </button>
      )}
      {!isPending && onAddReaction && (
        <button className={styles.item} onClick={() => { onAddReaction(); onClose(); }}>
          <Smile size={16} />
          Ajouter une réaction
        </button>
      )}
      {!isPending && onStartThread && (
        <button className={styles.item} onClick={() => { onStartThread(message); onClose(); }}>
          <MessageCircle size={16} />
          Démarrer un fil
        </button>
      )}

      <div className={styles.divider} />

      {!isPending && isOwn && (
        <button className={styles.item} onClick={() => { if (onEdit) onEdit(message.id, message.content || ''); onClose(); }}>
          <Edit2 size={16} />
          Modifier le message
        </button>
      )}
      {!isPending && (isOwn || canManage) && (
        <button className={`${styles.item} ${styles.itemDanger}`} onClick={handleDelete}>
          <Trash2 size={16} />
          Supprimer le message
        </button>
      )}
      {!isPending && canManage && (
        <button className={styles.item} onClick={handlePin}>
          <Pin size={16} />
          {message.pinned ? 'Désépingler' : 'Épingler le message'}
        </button>
      )}

      <div className={styles.divider} />

      {!isPending && message.content && (
        <button className={styles.item} onClick={handleCopyText}>
          <Copy size={16} />
          Copier le texte
        </button>
      )}
      <button className={styles.item} onClick={handleCopyId}>
        <Hash size={16} />
        Copier l'identifiant
      </button>

      {!isPending && (
        <>
          <div className={styles.divider} />
          <button className={`${styles.item} ${styles.itemDanger}`} onClick={handleReport}>
            <Flag size={16} />
            Signaler le message
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
