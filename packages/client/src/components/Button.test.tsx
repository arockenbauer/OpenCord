import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MessageComponents } from './MessageComponents/MessageComponents';

describe('interactive message button rendering', () => {
  it('renders an application message button with its accessible label', () => {
    render(
      <MessageComponents
        components={[
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: 'Confirm', custom_id: 'confirm-action' },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});
