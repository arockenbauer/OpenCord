import { useState, useEffect } from 'react';
import { X, Tag, Send } from 'lucide-react';
import { api } from '../../services/api';
import styles from './ForumPostCreator.module.css';

interface ForumPostCreatorProps {
  channelId: string;
  guildId: string;
  onClose: () => void;
  onPostCreated: (thread: any) => void;
}

export function ForumPostCreator({ channelId, guildId, onClose, onPostCreated }: ForumPostCreatorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTags();
  }, [channelId]);

  const fetchTags = async () => {
    try {
      const data = await api<any>(`/api/guilds/${guildId}/channels/${channelId}/tags`);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      setLoading(true);
      const thread = await api<any>(`/api/channels/${channelId}/thread`, {
        method: 'POST',
        body: JSON.stringify({
          name: title.trim(),
          content: content.trim(),
          applied_tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        }),
      });
      onPostCreated(thread);
      onClose();
    } catch (err) {
      console.error('Failed to create forum post:', err);
      alert('Erreur lors de la création du post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Créer un post forum</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label>Titre du post</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre clair et descriptif..."
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label>Contenu initial (optionnel)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Commencez la discussion..."
              rows={4}
              maxLength={2000}
            />
          </div>

          {tags.length > 0 && (
            <div className={styles.field}>
              <label>Tags</label>
              <div className={styles.tagsContainer}>
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    className={`${styles.tag} ${selectedTagIds.includes(tag.id) ? styles.tagSelected : ''}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.emoji && <span className={styles.tagEmoji}>{tag.emoji}</span>}
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Annuler
          </button>
          <button
            className={styles.createButton}
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
          >
            <Send size={16} />
            {loading ? 'Création...' : 'Créer le post'}
          </button>
        </div>
      </div>
    </div>
  );
}
