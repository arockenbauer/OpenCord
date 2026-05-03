import styles from './MessageComponents.module.css';

interface Component {
  type: number;
  // Button
  style?: number;
  label?: string;
  custom_id?: string;
  disabled?: boolean;
  emoji?: { name: string; id?: string; animated?: boolean };
  url?: string;
  // StringSelect
  options?: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  // TextInput (modal only)
  custom_id: string;
  style?: number;
  label?: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: { name: string; id?: string; animated?: boolean };
  default?: boolean;
}

interface MessageComponentsProps {
  components: Component[][]; // Array of ActionRows, each containing components
}

export function MessageComponents({ components }: MessageComponentsProps) {
  if (!components || components.length === 0) return null;

  return (
    <div className={styles.container}>
      {components.map((actionRow, rowIndex) => (
        <div key={rowIndex} className={styles.actionRow}>
          {actionRow.map((component, compIndex) => {
            if (component.type === 2) {
              // Button
              return (
                <button
                  key={compIndex}
                  className={`${styles.button} ${getButtonStyle(component.style)}`}
                  disabled={component.disabled}
                  onClick={() => handleButtonClick(component)}
                >
                  {component.emoji && <span className={styles.emoji}>{component.emoji.name}</span>}
                  {component.label}
                </button>
              );
            } else if (component.type === 3) {
              // StringSelect
              return (
                <select
                  key={compIndex}
                  className={styles.select}
                  multiple={component.max_values && component.max_values > 1}
                  onChange={(e) => handleSelectChange(component, e)}
                >
                  {component.placeholder && (
                    <option value="" disabled selected>
                      {component.placeholder}
                    </option>
                  )}
                  {component.options?.map((opt: SelectOption, i: number) => (
                    <option key={i} value={opt.value}>
                      {opt.emoji && `${opt.emoji.name} `}{opt.label}
                    </option>
                  ))}
                </select>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}

function getButtonStyle(style?: number): string {
  switch (style) {
    case 1: return styles.primary;
    case 2: return styles.secondary;
    case 3: return styles.success;
    case 4: return styles.danger;
    case 5: return styles.link;
    default: return styles.primary;
  }
}

function handleButtonClick(component: Component) {
  if (component.url) {
    window.open(component.url, '_blank');
  } else {
    // Emit interaction via gateway
    console.log('Button clicked:', component.custom_id);
  }
}

function handleSelectChange(component: Component, e: React.ChangeEvent<HTMLSelectElement>) {
  console.log('Select changed:', component.custom_id, e.target.value);
}
