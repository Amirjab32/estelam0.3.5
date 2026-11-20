export interface ProductItem {
  id: string;
  name: string;
  category: string;
  sourceUrl: string;
  imageUrl: string;
  currentPriceToman: number;
  lastPriceToman: number;
  shopCostToman?: number;
  marginPercent: number;
  customerQuoteToman: number;
  stockStatus: 'in_stock' | 'out_of_stock' | 'call';
  warranty: string;
  lastRefreshedAt: string;
  createdAt: string;
  updatedAt?: string;
  notes: string;
  barcodes?: string[];
}

export interface PriceHistoryItem {
  timestamp: string;
  jalaliDate: string;
  jalaliTime: string;
  priceToman: number;
  customerQuoteToman: number;
  source: string;
  changePercent?: number;
}

export interface SchedulerInfo {
  nextScheduledTime: string;
  remainingMinutes: number;
  lastAutoSyncTime: string | null;
  fixedScheduleHours: number[];
}

export type StorageMode = 'firebase' | 'cloudflare' | 'offline';
export type StoragePreference = 'auto' | 'firebase' | 'cloudflare';
export type ConnectionHealthState = 'healthy' | 'degraded' | 'offline';
export type CloudflareSyncState =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'pin_required'
  | 'kv_missing'
  | 'unreachable'
  | 'error';

export interface BackupBundle {
  version: number;
  exportedAt: string;
  source: string;
  products: ProductItem[];
  histories: Record<string, PriceHistoryItem[]>;
  deletedIds?: Record<string, string>;
}

export interface CloudflareStatus {
  reachable: boolean;
  kvConfigured: boolean;
  kvBindingName?: string | null;
  relayed?: boolean;
  upstreamReachable?: boolean;
  endpointUsed?: string;
}
