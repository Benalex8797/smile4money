const NETWORK_LABELS: Record<string, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  futurenet: 'Futurenet',
  standalone: 'Standalone',
};

const NETWORK_COLORS: Record<string, string> = {
  mainnet: 'bg-green-600',
  testnet: 'bg-amber-500',
  futurenet: 'bg-orange-500',
  standalone: 'bg-gray-400',
};

interface NetworkBadgeProps {
  network?: string;
}

export function NetworkBadge({ network }: NetworkBadgeProps) {
  const net = network ?? import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet';
  const label = NETWORK_LABELS[net] ?? net;
  const color = NETWORK_COLORS[net] ?? 'bg-gray-400';

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${color} text-white`}
      data-testid="network-badge"
      data-network={net}
    >
      {label}
    </span>
  );
}
