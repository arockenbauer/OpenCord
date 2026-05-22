import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Shield, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AutoModRules.module.css';

interface AutoModRulesProps {
  guildId: string;
}

export function AutoModRules({ guildId }: AutoModRulesProps) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    fetchRules();
  }, [guildId]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await api<any>(`/api/guilds/${guildId}/automod/rules`);
      setRules(data.rules || []);
    } catch (err) {
      console.error('Failed to fetch AutoMod rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
      await api(`/api/guilds/${guildId}/automod/rules/${ruleId}`, {
        method: 'DELETE',
      });
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const getTriggerType = (type: number) => {
    switch (type) {
      case 1: return 'Mots-clés';
      case 3: return 'Spam';
      case 4: return 'Contenu grossier';
      case 5: return 'Mentions en masse';
      default: return 'Inconnu';
    }
  };

  const getActionType = (actions: any[]) => {
    if (!actions || actions.length === 0) return 'Aucune';
    const types = actions.map((a: any) => {
      switch (a.type) {
        case 1: return 'Bloquer';
        case 2: return 'Envoyer alerte';
        case 3: return 'Timeout';
        default: return 'Inconnu';
      }
    });
    return types.join(', ');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield size={20} />
          <h3>AutoMod</h3>
        </div>
        <button className={styles.addButton} onClick={() => setShowCreator(true)}>
          <Plus size={16} />
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : rules.length === 0 ? (
        <div className={styles.empty}>
          <AlertTriangle size={48} />
          <h4>Aucune règle AutoMod</h4>
          <p>Créez des règles pour filtrer automatiquement les messages.</p>
          <button className={styles.createButton} onClick={() => setShowCreator(true)}>
            Créer une règle
          </button>
        </div>
      ) : (
        <div className={styles.rulesList}>
          {rules.map(rule => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <span className={styles.ruleName}>{rule.name}</span>
                <div className={styles.ruleActions}>
                  <button className={styles.editButton}>
                    <Edit size={14} />
                  </button>
                  <button className={styles.deleteButton} onClick={() => deleteRule(rule.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.ruleMeta}>
                <span className={styles.triggerType}>{getTriggerType(rule.trigger_type)}</span>
                <span className={styles.separator}>•</span>
                <span className={styles.actionType}>{getActionType(JSON.parse(rule.actions || '[]'))}</span>
              </div>
              {!rule.enabled && (
                <span className={styles.disabledBadge}>Désactivé</span>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreator && (
        <AutoModRuleCreator
          guildId={guildId}
          onClose={() => setShowCreator(false)}
          onRuleCreated={() => { fetchRules(); setShowCreator(false); }}
        />
      )}
    </div>
  );
}

function AutoModRuleCreator({ guildId, onClose, onRuleCreated }: {
  guildId: string;
  onClose: () => void;
  onRuleCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState(1);
  const [keywords, setKeywords] = useState('');
  const [regexPatterns, setRegexPatterns] = useState('');
  const [actions, setActions] = useState<number[]>([1]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('Veuillez donner un nom à la règle');
      return;
    }

    try {
      setLoading(true);
      const triggerMetadata: any = {};
      if (triggerType === 1) {
        if (!keywords.trim()) {
          alert('Veuillez entrer des mots-clés');
          return;
        }
        triggerMetadata.keyword_filter = keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
      }

      await api(`/api/guilds/${guildId}/automod/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          trigger_type: triggerType,
          trigger_metadata: triggerMetadata,
          actions: actions.map(type => ({ type })),
          enabled,
        }),
      });

      onRuleCreated();
    } catch (err) {
      console.error('Failed to create rule:', err);
      alert('Erreur lors de la création de la règle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Créer une règle AutoMod</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <Trash2 size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Nom de la règle</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la règle..."
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label>Type de déclencheur</label>
            <select value={triggerType} onChange={(e) => setTriggerType(Number(e.target.value))}>
              <option value={1}>Mots-clés</option>
              <option value={3}>Spam</option>
              <option value={4}>Contenu grossier</option>
              <option value={5}>Mentions en masse</option>
            </select>
          </div>

          {triggerType === 1 && (
            <div className={styles.field}>
              <label>Mots-clés (séparés par des virgules)</label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="mot1, mot2, mot3..."
                rows={3}
              />
            </div>
          )}

          <div className={styles.field}>
            <label>Actions</label>
            <div className={styles.checkboxGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={actions.includes(1)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setActions(prev => [...prev, 1]);
                    } else {
                      setActions(prev => prev.filter(a => a !== 1));
                    }
                  }}
                />
                Bloquer le message
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={actions.includes(2)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setActions(prev => [...prev, 2]);
                    } else {
                      setActions(prev => prev.filter(a => a !== 2));
                    }
                  }}
                />
                Envoyer une alerte
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={actions.includes(3)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setActions(prev => [...prev, 3]);
                    } else {
                      setActions(prev => prev.filter(a => a !== 3));
                    }
                  }}
                />
                Timeout
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Règle activée
            </label>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>Annuler</button>
          <button
            className={styles.createButton}
            onClick={handleCreate}
            disabled={loading || !name.trim() || actions.length === 0}
          >
            {loading ? 'Création...' : 'Créer la règle'}
          </button>
        </div>
      </div>
    </div>
  );
}
