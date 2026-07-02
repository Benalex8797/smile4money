import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTheme } from '../src/hooks/useTheme';

function TestComponent() {
  const { theme, toggle } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light when no preference stored', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('defaults to dark when stored preference is dark', () => {
    localStorage.setItem('smile4money-theme', 'dark');
    render(<TestComponent />);
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles theme and updates localStorage', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('smile4money-theme')).toBe('dark');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('smile4money-theme')).toBe('light');
  });

  it('persists preference across renders', () => {
    localStorage.setItem('smile4money-theme', 'dark');
    const { unmount } = render(<TestComponent />);
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');

    unmount();
    render(<TestComponent />);
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
  });
});
