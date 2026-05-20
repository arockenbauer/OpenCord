import type { ChangeEvent } from 'react';
import styles from './MessageComponents.module.css';

interface BaseComponent {
  type: number;
  custom_id?: string;
}

interface ActionRowComponent {
  type: 1;
  components: Component[];
}

interface ButtonComponent extends BaseComponent {
  type: 2;
  style?: number;
  label?: string;
  disabled?: boolean;
  emoji?: { name: string; id?: string; animated?: boolean };
  url?: string;
}

interface SelectComponent extends BaseComponent {
  type: 3;
  options?: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
}

interface TextInputComponent extends BaseComponent {
  type: 4;
  custom_id: string;
  style?: number;
  label?: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

type Component = ButtonComponent | SelectComponent | TextInputComponent;

interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: { name: string; id?: string; animated?: boolean };
  default?: boolean;
}

interface MessageComponentsProps {
  components: ActionRowComponent[] | Component[][];
}

export function MessageComponents({ components }: MessageComponentsProps) {
  if (!components || components.length === 0) return null;
  const rows = normalizeActionRows(components);

  return (
    <div className={styles.container}>
      {rows.map((actionRow, rowIndex) => (
        <div key={rowIndex} className={styles.actionRow}>
          {actionRow.map((component, compIndex) => {
            if (component.type === 2) {
              const btn = component as ButtonComponent;
              const isInteractiveButton = !!btn.url;
              return (
                <button
                  key={compIndex}
                  className={`${styles.button} ${getButtonStyle(btn.style)}`}
                  disabled={btn.disabled || !isInteractiveButton}
                  onClick={() => handleButtonClick(btn)}
                >
                  {btn.emoji && <span className={styles.emoji}>{btn.emoji.name}</span>}
                  {btn.label}
                </button>
              );
            } else if (component.type === 3) {
              const sel = component as SelectComponent;
              return (
                <select
                  key={compIndex}
                  className={styles.select}
                  multiple={!!(sel.max_values && sel.max_values > 1)}
                  disabled
                  onChange={(e) => handleSelectChange(sel, e)}
                >
                  {sel.placeholder && !sel.max_values && (
                    <option value="" disabled selected>
                      {sel.placeholder}
                    </option>
                  )}
                  {sel.options?.map((opt: SelectOption, i: number) => (
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

function normalizeActionRows(components: MessageComponentsProps['components']): Component[][] {
  if (components.length === 0) return [];

  const [firstRow] = components;
  if (Array.isArray(firstRow)) {
    return components as Component[][];
  }

  return (components as ActionRowComponent[]).map((row) => row.components || []);
}

function getButtonStyle(style?: number): string {
  switch (style) {
    case 1: return styles.primary || '';
    case 2: return styles.secondary || '';
    case 3: return styles.success || '';
    case 4: return styles.danger || '';
    case 5: return styles.link || '';
    default: return styles.primary || '';
  }
}

function handleButtonClick(component: ButtonComponent) {
  if (component.url) {
    window.open(component.url, '_blank');
  }
}

function handleSelectChange(component: SelectComponent, e: ChangeEvent<HTMLSelectElement>) {
  void component;
  void e;
}
