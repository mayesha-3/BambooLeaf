import type { FC } from 'react'

interface IconProps {
  className?: string
  size?: number
}

// 1. Authentic Ethereum (ETH) Logo
export const EthereumIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#627EEA" />
    <path
      d="M16.498 4v8.87l7.497 3.35L16.498 4z"
      fill="#fff"
      fillOpacity="0.602"
    />
    <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff" />
    <path
      d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z"
      fill="#fff"
      fillOpacity="0.602"
    />
    <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.38z" fill="#fff" />
    <path
      d="M16.498 20.573l7.497-4.353-7.497-3.348v7.7z"
      fill="#fff"
      fillOpacity="0.2"
    />
    <path
      d="M9 16.22l7.498 4.353v-7.7L9 16.22z"
      fill="#fff"
      fillOpacity="0.602"
    />
  </svg>
)

// 2. Authentic Bitcoin (BTC) Logo
export const BitcoinIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#F7931A" />
    <path
      d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.745-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.314-1.256-.314l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.705 2.827 1.73.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.535 2.146-4.148.986-5.318.695l.949-3.805c1.17.292 4.928.872 4.369 3.11zm.536-5.567c-.488 1.954-3.495.962-4.47.719l.86-3.45c.975.243 4.122.697 3.61 2.731z"
      fill="#fff"
    />
  </svg>
)

// 3. Authentic Solana (SOL) Logo
export const SolanaIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#000" />
    <defs>
      <linearGradient id="solanaGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00FFA3" />
        <stop offset="100%" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient id="solanaGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00FFA3" />
        <stop offset="100%" stopColor="#DC1FFF" />
      </linearGradient>
      <linearGradient id="solanaGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00FFA3" />
        <stop offset="100%" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path
      d="M8.2 20.35a.8.8 0 01.55-.24h13.13a.5.5 0 01.35.85l-2.73 2.69a.8.8 0 01-.55.24H5.82a.5.5 0 01-.35-.85l2.73-2.69z"
      fill="url(#solanaGrad1)"
    />
    <path
      d="M8.2 8.11a.8.8 0 01.55-.24h13.13a.5.5 0 01.35.85l-2.73 2.69a.8.8 0 01-.55.24H5.82a.5.5 0 01-.35-.85L8.2 8.11z"
      fill="url(#solanaGrad2)"
    />
    <path
      d="M23.8 14.23a.8.8 0 01-.55.24H10.12a.5.5 0 01-.35-.85l2.73-2.69a.8.8 0 01.55-.24h13.13a.5.5 0 01.35.85l-2.73 2.69z"
      fill="url(#solanaGrad3)"
    />
  </svg>
)

// 4. Authentic USD Coin (USDC) Logo
export const UsdcIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path
      d="M19.7 17.8c0-1.8-1.1-2.4-3.3-2.7-1.5-.2-1.9-.6-1.9-1.3 0-.7.6-1.2 1.8-1.2 1.1 0 1.7.4 2 .9.1.1.2.2.3.2l1.3-.6c.1 0 .2-.1.1-.3-.4-.8-1.2-1.5-2.6-1.7V9.7c0-.2-.1-.3-.3-.3h-1.2c-.2 0-.3.1-.3.3v1.3c-1.8.3-2.9 1.4-2.9 2.8 0 1.8 1.1 2.4 3.3 2.7 1.4.2 1.9.6 1.9 1.4 0 .8-.8 1.4-2 1.4-1.5 0-2.1-.6-2.4-1.2 0-.1-.1-.2-.2-.2l-1.4.6c-.1 0-.1.2 0 .3.5 1 1.4 1.7 2.9 2v1.4c0 .2.1.3.3.3h1.2c.2 0 .3-.1.3-.3v-1.4c1.9-.2 3.1-1.3 3.1-2.9z"
      fill="#fff"
    />
    <path
      d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm0 21.8c-5.4 0-9.8-4.4-9.8-9.8S10.6 6.2 16 6.2s9.8 4.4 9.8 9.8-4.4 9.8-9.8 9.8z"
      fill="#fff"
      fillOpacity="0.4"
    />
  </svg>
)

// 5. Authentic Uniswap (UNI) Logo
export const UniswapIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#FF007A" />
    <path
      d="M23.1 11.2c-.4-.5-1-.9-1.6-1.2.1-.5.1-1-.1-1.4-.3-.7-.9-1.2-1.7-1.3-.7-.1-1.4.2-2 .6-.6-.4-1.4-.6-2.1-.5-.8.1-1.5.5-2 1.1-.3-.2-.7-.3-1.1-.3-.7 0-1.4.4-1.8 1-.4.6-.5 1.3-.3 2-.6.3-1.1.7-1.4 1.3-.5.9-.5 2 0 2.9.3.6.8 1.1 1.4 1.5-.1.6 0 1.2.3 1.8.4.8 1.1 1.4 2 1.6.4.1.8.1 1.2 0 .4.5.9.8 1.5 1 .6.2 1.3.1 1.9-.2.5.4 1.1.6 1.8.5.8-.1 1.5-.6 1.9-1.3.4.1.8.1 1.2 0 .8-.3 1.4-.9 1.6-1.7.3-.8.2-1.7-.2-2.4.6-.4 1-1 1.2-1.7.2-.8.1-1.7-.3-2.4-.2-.5-.6-.9-1.1-1.2z"
      fill="#fff"
    />
  </svg>
)

// 6. Authentic Chainlink (LINK) Logo
export const ChainlinkIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#375BD2" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M16 6.5l8.227 4.75v9.5L16 25.5l-8.227-4.75v-9.5L16 6.5zm-5.074 12.327L16 22.02l5.074-3.193v-6.386L16 9.248l-5.074 3.193v6.386z"
      fill="#fff"
    />
  </svg>
)

// 7. Authentic US Dollar (Fiat) Logo
export const UsdIcon: FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="16" fill="#10B981" />
    <path
      d="M16 7v2m0 14v2m-3.5-5.5c0 1.9 1.6 3 3.5 3s3.5-.9 3.5-2.8c0-3.2-7-2-7-5.2 0-1.7 1.4-2.8 3.5-2.8s3.5.9 3.5 2.5"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// Helper lookup function by symbol
export function getCryptoIcon(symbol: string, size = 24, className = '') {
  switch (symbol.toUpperCase()) {
    case 'ETH':
    case 'SEPOLIA':
    case 'STETH':
      return <EthereumIcon size={size} className={className} />
    case 'BTC':
      return <BitcoinIcon size={size} className={className} />
    case 'SOL':
      return <SolanaIcon size={size} className={className} />
    case 'USDC':
      return <UsdcIcon size={size} className={className} />
    case 'UNI':
      return <UniswapIcon size={size} className={className} />
    case 'LINK':
      return <ChainlinkIcon size={size} className={className} />
    case 'USD':
    case 'USDT':
    default:
      return <UsdIcon size={size} className={className} />
  }
}

// Up/Down Trend Arrow Badges
export const PriceTrendBadge: FC<{
  change: number
  showIcon?: boolean
  className?: string
  size?: 'sm' | 'md'
}> = ({ change, showIcon = true, className = '', size = 'md' }) => {
  const isUp = change >= 0
  const isZero = change === 0

  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5'

  return (
    <span
      className={`inline-flex items-center font-mono font-bold rounded-lg transition-colors ${sizeClasses} ${
        isZero
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          : isUp
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
      } ${className}`}
    >
      {showIcon && (
        <span
          className={`inline-flex items-center justify-center transition-transform ${
            isUp ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
          }`}
        >
          {isUp ? (
            // Realistic upward trend arrow (sharp diagonal/up)
            <svg
              className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 9.5L9.5 2.5M9.5 2.5H4.5M9.5 2.5V7.5" />
            </svg>
          ) : (
            // Realistic downward trend arrow (sharp diagonal/down)
            <svg
              className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 2.5L9.5 9.5M9.5 9.5H4.5M9.5 9.5V4.5" />
            </svg>
          )}
        </span>
      )}
      <span>
        {isUp ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </span>
  )
}
