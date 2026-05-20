import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { api } from '../../services/api';
import styles from './ForumTagManager.module.css';

interface ForumTag {
  id: string;
  name: string;
  emoji?: string;
  moderated: boolean;
}

interface ForumTagManagerProps {
  channelId: string;
  guildId: string;
  canManage: boolean;
}

export function ForumTagManager({ channelId, guildId, canManage }: ForumTagManagerProps) {
  const [tags, setTags] = useState<ForumTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTag, setEditingTag] = useState<ForumTag | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [moderated, setModerated] = useState(false);

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await api.forumTags.get<any>(guildId, channelId);
      setTags(res.tags || []);
    } catch (err) {
      console.error('Failed to load forum tags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, [channelId]);

  const resetForm = () => {
    setName('');
    setEmoji('');
    setModerated(false);
    setEditingTag(null);
    setShowCreate(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (editingTag) {
        await api.forumTags.update<any>(guildId, channelId, editingTag.id, {
          name: name.trim(),
          emoji: emoji || undefined,
          moderated,
        });
      } else {
        await api.forumTags.create<any>(guildId, channelId, {
          name: name.trim(),
          emoji: emoji || undefined,
          moderated,
        });
      }
      resetForm();
      loadTags();
    } catch (err) {
      console.error('Failed to save tag:', err);
    }
  };

  const handleEdit = (tag: ForumTag) => {
    setEditingTag(tag);
    setName(tag.name);
    setEmoji(tag.emoji || '');
    setModerated(tag.moderated);
    setShowCreate(true);
  };

  const handleDelete = async (tagId: string) => {
    if (!confirm('Supprimer ce tag ?')) return;
    try {
      await api.forumTags.delete<any>(guildId, channelId, tagId);
      loadTags();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  if (loading) return <div className={styles.loading}>Chargement...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Tags du forum</h3>
        {canManage && (
          <button className={styles.addBtn} onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus size={16} /> Ajouter
          </button>
        )}
      </div>

      {tags.length === 0 && !showCreate && (
        <div className={styles.empty}>Aucun tag configuré.</div>
      )}

      <div className={styles.tagList}>
        {tags.map((tag) => (
          <div key={tag.id} className={styles.tagItem}>
            <span className={styles.tagEmoji}>{tag.emoji || <Tag size={14} />}</span>
            <span className={styles.tagName}>{tag.name}</span>
            {tag.moderated && <span className={styles.moderatedBadge}>Modéré</span>}
            {canManage && (
              <div className={styles.actions}>
                <button onClick={() => handleEdit(tag)}><Pencil size={14} /></button>
                <button onClick={() => handleDelete(tag.id)}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate && canManage && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Nom du tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            required
          />
          <input
            type="text"
            placeholder="Emoji (optionnel)"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className={styles.input}
            maxLength={2}
          />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={moderated} onChange={(e) => setModerated(e.target.checked)} />
            Modéré
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveBtn}>{editingTag ? 'Modifier' : 'Créer'}</button>
            <button type="button" className={styles.cancelBtn} onClick={resetForm}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
