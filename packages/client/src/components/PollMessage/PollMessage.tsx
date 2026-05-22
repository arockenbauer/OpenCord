import { useState, useEffect } from 'react';
import { BarChart2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../../services/api';
import styles from './PollMessage.module.css';

interface PollMessageProps {
  poll: any;
  messageId: string;
  channelId: string;
  isAuthor: boolean;
}

export function PollMessage({ poll, messageId, channelId, isAuthor }: PollMessageProps) {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;
  const ended = !!poll.ended_at;

  useEffect(() => {
    fetchResults();
    if (!ended) {
      const interval = setInterval(() => {
        const now = new Date();
        const created = new Date(poll.created_at);
        const end = new Date(created.getTime() + poll.duration * 1000);
        const diff = end.getTime() - now.getTime();
        if (diff <= 0) {
          setTimeLeft('Terminé');
          clearInterval(interval);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          setTimeLeft(`${hours}h ${minutes}m`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [poll.id]);

  const fetchResults = async () => {
    try {
      const data = await api<any>(`/api/polls/${poll.id}/results`);
      setResults(data);
      // Check if user has voted
      if (data.totalVotes > 0) {
        // This is simplified - in real app, you'd check user's votes
      }
    } catch (err) {
      console.error('Failed to fetch poll results:', err);
    }
  };

  const handleVote = async () => {
    if (selectedOptions.length === 0 || loading) return;
    try {
      setLoading(true);
      await api(`/api/polls/${poll.id}/answers`, {
        method: 'POST',
        body: JSON.stringify({ answerIds: selectedOptions }),
      });
      setHasVoted(true);
      fetchResults();
    } catch (err) {
      console.error('Failed to vote:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEndPoll = async () => {
    try {
      await api(`/api/polls/${poll.id}/end`, { method: 'POST' });
      fetchResults();
    } catch (err) {
      console.error('Failed to end poll:', err);
    }
  };

  const toggleOption = (index: number) => {
    if (ended || hasVoted) return;
    if (poll.allow_multiselect) {
      setSelectedOptions(prev =>
        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
      );
    } else {
      setSelectedOptions([index]);
    }
  };

  const totalVotes = results?.totalVotes || 0;

  return (
    <div className={styles.pollContainer}>
      <div className={styles.pollHeader}>
        <BarChart2 size={20} />
        <span>Sondage</span>
        {ended && <span className={styles.endedBadge}>Terminé</span>}
      </div>

      <div className={styles.question}>{poll.question}</div>

      <div className={styles.options}>
        {options.map((option: string, index: number) => {
          const voteCount = results?.options?.[index]?.count || 0;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = selectedOptions.includes(index);
          const hasVotedForThis = results && results.totalVotes > 0; // Simplified

          return (
            <button
              key={index}
              className={`${styles.option} ${isSelected ? styles.selected : ''} ${hasVoted || ended ? styles.disabled : ''}`}
              onClick={() => toggleOption(index)}
              disabled={hasVoted || ended}
            >
              <div className={styles.optionContent}>
                <div className={styles.optionRadio}>
                  {poll.allow_multiselect ? (
                    isSelected ? <CheckCircle size={16} /> : <div className={styles.checkbox} />
                  ) : (
                    isSelected ? <CheckCircle size={16} /> : <div className={styles.radio} />
                  )}
                </div>
                <span className={styles.optionText}>{option}</span>
                {(hasVoted || ended) && (
                  <span className={styles.percentage}>{percentage}%</span>
                )}
              </div>
              {(hasVoted || ended) && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
              {(hasVoted || ended) && (
                <div className={styles.voteCount}>{voteCount} vote(s)</div>
              )}
            </button>
          );
        })}
      </div>

      {!hasVoted && !ended && (
        <button
          className={styles.voteButton}
          onClick={handleVote}
          disabled={selectedOptions.length === 0 || loading}
        >
          {loading ? 'Vote en cours...' : 'Voter'}
        </button>
      )}

      <div className={styles.pollFooter}>
        <span>{totalVotes} vote(s)</span>
        {!ended && timeLeft && (
          <span className={styles.timeLeft}><Clock size={12} /> {timeLeft}</span>
        )}
        {isAuthor && !ended && (
          <button className={styles.endButton} onClick={handleEndPoll}>
            <XCircle size={14} /> Terminer
          </button>
        )}
      </div>
    </div>
  );
}
