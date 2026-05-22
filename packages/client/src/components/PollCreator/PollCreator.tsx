import { useState } from 'react';
import { BarChart2, Plus, X, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import styles from './PollCreator.module.css';

interface PollCreatorProps {
  channelId: string;
  onClose: () => void;
  onPollCreated: () => void;
}

export function PollCreator({ channelId, onClose, onPollCreated }: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [duration, setDuration] = useState(24); // hours
  const [allowMultiselect, setAllowMultiselect] = useState(false);
  const [loading, setLoading] = useState(false);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    if (!question.trim() || options.some(opt => !opt.trim())) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    try {
      setLoading(true);
      await api(`/api/channels/${channelId}/polls`, {
        method: 'POST',
        body: JSON.stringify({
          question,
          options: options.filter(opt => opt.trim()),
          duration: duration * 3600, // convert to seconds
          allowMultiselect,
        }),
      });
      onPollCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create poll:', err);
      alert('Erreur lors de la création du sondage');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <BarChart2 size={20} />
            <h3>Créer un sondage</h3>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label>Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Poser une question..."
              maxLength={200}
            />
          </div>

          <div className={styles.field}>
            <label>Options</label>
            {options.map((option, index) => (
              <div key={index} className={styles.optionRow}>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <button
                    className={styles.removeButton}
                    onClick={() => removeOption(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button className={styles.addButton} onClick={addOption}>
                <Plus size={16} /> Ajouter une option
              </button>
            )}
          </div>

          <div className={styles.field}>
            <label>Durée (heures)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={1}
              max={168} // 7 days
            />
          </div>

          <div className={styles.field}>
            <label>
              <input
                type="checkbox"
                checked={allowMultiselect}
                onChange={(e) => setAllowMultiselect(e.target.checked)}
              />
              Autoriser plusieurs choix
            </label>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Annuler
          </button>
          <button
            className={styles.createButton}
            onClick={handleCreate}
            disabled={loading || !question.trim() || options.some(opt => !opt.trim())}
          >
            {loading ? 'Création...' : 'Créer le sondage'}
          </button>
        </div>
      </div>
    </div>
  );
}
