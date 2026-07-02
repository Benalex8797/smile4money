import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../src/components/Toast';

function TestComponent() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success', 'Completed')} data-testid="success-btn">
        Success
      </button>
      <button onClick={() => toast.error('Error', 'Failed')} data-testid="error-btn">
        Error
      </button>
      <button onClick={() => toast.info('Info', 'Pending')} data-testid="info-btn">
        Info
      </button>
    </div>
  );
}

describe('Toast', () => {
  it('renders toasts for success, error, and info', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('success-btn'));
    expect(await screen.findByTestId('toast-success')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('error-btn'));
    expect(await screen.findByTestId('toast-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('info-btn'));
    expect(await screen.findByTestId('toast-info')).toBeInTheDocument();
  });

  it('auto-dismisses success and info toasts', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('success-btn'));
    expect(await screen.findByTestId('toast-success')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('info-btn'));
    expect(await screen.findByTestId('toast-info')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 5200));

    await waitFor(() => {
      expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument();
      expect(screen.queryByTestId('toast-info')).not.toBeInTheDocument();
    });
  }, 10000);
});
