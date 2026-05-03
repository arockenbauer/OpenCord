import { useState, useEffect, useCallback } from 'react';
import { Save, Trash2, FileText } from 'lucide-react';
import { api } from '../../services/api';
import styles from './UserNoteEditor.module.css';

interface UserNoteEditorProps {
  targetUserId: string;
  targetUsername?: string;
  onSaved?: () => void;
}

export function UserNoteEditor({ targetUserId, targetUsername, onSaved }: UserNoteEditorProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadNote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.notes.getForUser<any>(targetUserId);
      setNote(res.note?.note_content || '');
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [targetUserId]);

  useEffect(() => { loadNote(); }, [loadNote]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.notes.upsert<any>(targetUserId, note.trim());
      onSaved?.();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer la note sur ${targetUsername || 'cet utilisateur'} ?`)) return;
    setSaving(true);
    try {
      await api.notes.delete<any>(targetUserId);
      setNote('');
      onSaved?.();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (loading) return <div className={styles.loading}>Chargement…</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <FileText size={16} />
        <span>Note sur {targetUsername || 'l\'utilisateur'}</span>
      </div>
      <textarea
        className={styles.textarea}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`Écris une note privée sur ${targetUsername || 'cet utilisateur'}...`}
        rows={3}
      />
      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {note && (
          <button className={styles.deleteBtn} onClick={handleDelete} disabled={saving}>
            <Trash2 size={14} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
