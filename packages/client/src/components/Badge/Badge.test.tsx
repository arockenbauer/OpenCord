import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders a badge with an accessible label derived from metadata', () => {
    render(<Badge badge={{ id: 'badge-admin', name: 'ADMIN', label: 'Administrator', icon: 'shield' }} />);

    expect(screen.getByLabelText('Administrator')).toBeInTheDocument();
  });

  it('applies custom className to the rendered badge container', () => {
    render(<Badge badge={{ id: 'badge-premium', name: 'PREMIUM', label: 'Premium', icon: 'sparkles' }} className="custom-badge" />);

    expect(screen.getByLabelText('Premium')).toHaveClass('custom-badge');
  });
});
