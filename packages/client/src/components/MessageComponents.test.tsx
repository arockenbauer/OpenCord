import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MessageComponents } from './MessageComponents/MessageComponents';

describe('MessageComponents', () => {
  it('renders action rows that follow the spec structure', () => {
    render(
      <MessageComponents
        components={[
          {
            type: 1,
            components: [
              { type: 2, label: 'Open docs', url: 'https://example.com' },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open docs' })).toBeInTheDocument();
  });

  it('renders select options from an action row payload', () => {
    render(
      <MessageComponents
        components={[
          {
            type: 1,
            components: [
              {
                type: 3,
                placeholder: 'Choose',
                options: [{ label: 'Alpha', value: 'alpha' }],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Choose')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
});
