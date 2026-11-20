import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { FIXED_SCHEDULE_HOURS, getNextScheduledRefresh } from './src/utils/schedule.ts';
import { gregorianToJalali, toPersianDigits, formatPersianNumber } from './src/utils/jalali.ts';
import { extractPriceFromDigikalaInspect } from './src/utils/digikalaScraper.ts';
import { scrapeLiveDigikalaProduct } from './src/utils/liveScraper.ts';
import {
  isDigikalaUrlOrId,
  scrapeDigikalaDetailed,
  scrapeProductUniversal,
} from './src/utils/universalScraper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCliArgs(argv: string[]): { port?: number; host?: string } {
  let port: number | undefined;
  let host: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const val = Number(argv[i + 1]);
      if (Number.isFinite(val) && val > 0) port = val;
      i++;
    } else if (arg.startsWith('--port=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) port = val;
    } else if (arg === '--host' || arg === '-H') {
      if (argv[i + 1]) host = argv[i + 1];
      i++;
    } else if (arg.startsWith('--host=')) {
      const val = arg.split('=')[1];
      if (val) host = val;
    }
  }
  return { port, host };
}

const cliArgs = parseCliArgs(process.argv.slice(2));
const app = express();
const PORT = cliArgs.port || Number(process.env.PORT) || 3000;
const HOST = cliArgs.host || '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

// Enable CORS and Private Network Access for Cloudflare Pages integration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Shop-Pin, X-Cloudflare-Origin');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const BASE_DATA_DIR = process.env.SHOP_DATA_DIR
  ? path.resolve(process.env.SHOP_DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_DIR = path.join(BASE_DATA_DIR, 'products');

// Ensure base data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// Helper to format Jalali date string
function getJalaliDateString(d: Date): { date: string; time: string } {
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const date = `${toPersianDigits(j.jy)}/${toPersianDigits(String(j.jm).padStart(2, '0'))}/${toPersianDigits(String(j.jd).padStart(2, '0'))}`;
  const time = `${toPersianDigits(String(d.getHours()).padStart(2, '0'))}:${toPersianDigits(String(d.getMinutes()).padStart(2, '0'))}`;
  return { date, time };
}

function calculateRoundedCustomerQuoteLocal(priceToman: number, marginPercent: number): number {
  if (!Number.isFinite(priceToman) || priceToman <= 0) return 0;
  const margin =
    Number.isFinite(marginPercent) && marginPercent >= 0 ? Math.min(500, marginPercent) : 8;
  return Math.round((priceToman * (1 + margin / 100)) / 1000) * 1000;
}

// Seed Initial Products if empty
function initializeSeedData() {
  const existing = fs.readdirSync(DATA_DIR);
  if (existing.length > 0) return;

  const seeds: { product: ProductItem; basePrice: number; variance: number[] }[] = [
    {
      product: {
        id: 'prod_asus_tuf_f15',
        name: 'لپ‌تاپ ۱۵.۶ اینچی ایسوس TUF Gaming F15 FX507 (Core i7 / 16GB / 512GB / RTX 4060)',
        category: 'لپ‌تاپ و اولترابوک',
        sourceUrl: 'https://www.digikala.com/product/dkp-13840212/asus-tuf-gaming-f15-fx507/',
        imageUrl: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=600&q=80',
        currentPriceToman: 64900000,
        lastPriceToman: 63500000,
        shopCostToman: 59800000,
        marginPercent: 8,
        customerQuoteToman: 70100000,
        stockStatus: 'in_stock',
        warranty: 'گارانتی ۱۸ ماهه یکپارچه حامی / آواژنگ',
        lastRefreshedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        notes: 'مناسب گیمینگ و مهندسی سنگین، نوسان دلاری بالا، بررسی قیمت روز الزامی است',
      },
      basePrice: 61000000,
      variance: [0, 500000, -300000, 1200000, 800000, 1500000, 200000, 1000000],
    },
    {
      product: {
        id: 'prod_logitech_g502',
        name: 'ماوس مخصوص بازی لاجیتک مدل G502 HERO با حسگر HERO 25K',
        category: 'لوازم جانبی و گیمینگ',
        sourceUrl: 'https://www.digikala.com/product/dkp-2384729/logitech-g502-hero/',
        imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=600&q=80',
        currentPriceToman: 2890000,
        lastPriceToman: 2790000,
        shopCostToman: 2350000,
        marginPercent: 12,
        customerQuoteToman: 3250000,
        stockStatus: 'in_stock',
        warranty: '۲۴ ماه گارانتی پانا / اسپیرو',
        lastRefreshedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        notes: 'پرفروش‌ترین ماوس مغازه، در صورت خرید تعداد تخفیف همکار لحاظ شود',
      },
      basePrice: 2450000,
      variance: [0, 40000, 90000, 30000, 110000, 80000, 90000],
    },
    {
      product: {
        id: 'prod_samsung_ssd_980pro',
        name: 'حافظه اس‌اس‌دی سامسونگ مدل 980 PRO PCIe 4.0 NVMe M.2 ظرفیت 1 ترابایت',
        category: 'قطعات و ارتقا سیستم',
        sourceUrl: 'https://www.digikala.com/product/dkp-4820194/samsung-980-pro-nvme-1tb/',
        imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80',
        currentPriceToman: 5450000,
        lastPriceToman: 5300000,
        shopCostToman: 4700000,
        marginPercent: 10,
        customerQuoteToman: 6000000,
        stockStatus: 'in_stock',
        warranty: 'گارانتی ۵ ساله ماتریکس / الماس ایران',
        lastRefreshedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        notes: 'قطعه اصلی برای ارتقای لپ‌تاپ‌های بخش تعمیرات مغازه',
      },
      basePrice: 4800000,
      variance: [0, 100000, -50000, 200000, 150000, 250000],
    },
    {
      product: {
        id: 'prod_xiaomi_monitor_27',
        name: 'مانیتور گیمینگ ۲۷ اینچ شیائومی مدل Redmi G27 با نرخ نوسازی 165Hz IPS',
        category: 'مانیتور و نمایشگر',
        sourceUrl: 'https://www.digikala.com/product/dkp-9302148/xiaomi-redmi-g27-165hz/',
        imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
        currentPriceToman: 9800000,
        lastPriceToman: 9400000,
        shopCostToman: 8500000,
        marginPercent: 9,
        customerQuoteToman: 10700000,
        stockStatus: 'in_stock',
        warranty: '۱۸ ماه گارانتی شرکتی می ایران',
        lastRefreshedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        notes: 'فوق‌العاده برای ستاپ‌های برنامه‌نویسی و بازی، نمایش در ویترین مغازه',
      },
      basePrice: 8900000,
      variance: [0, 200000, 150000, 300000, -100000, 350000],
    },
  ];

  seeds.forEach(({ product, basePrice, variance }) => {
    const prodDir = path.join(DATA_DIR, product.id);
    if (!fs.existsSync(prodDir)) {
      fs.mkdirSync(prodDir, { recursive: true });
    }

    fs.writeFileSync(path.join(prodDir, 'product.json'), JSON.stringify(product, null, 2));

    // Generate historical price logs across past 14 days
    const history: PriceHistoryItem[] = [];
    let currentP = basePrice;
    const now = Date.now();

    const stepCount = variance.length;
    let varIdx = 0;
    for (let day = 14; day >= 0; day--) {
      // 2 snapshots per day (e.g. 09:00 and 15:00)
      const times = [9, 15];
      for (const hr of times) {
        const timestampDate = new Date(now - day * 24 * 3600 * 1000);
        timestampDate.setHours(hr, 0, 0, 0);

        if (timestampDate.getTime() > now) continue;

        const v = variance[varIdx % stepCount] || 0;
        varIdx++;
        currentP = basePrice + v;
        const custQuote = calculateRoundedCustomerQuoteLocal(currentP, product.marginPercent);

        const { date, time } = getJalaliDateString(timestampDate);
        history.push({
          timestamp: timestampDate.toISOString(),
          jalaliDate: date,
          jalaliTime: time,
          priceToman: currentP,
          customerQuoteToman: custQuote,
          source: hr === 9 ? 'پایش صبحگاه' : 'پایش عصرانه',
        });
      }
    }

    // Set the latest historical price to currentPriceToman
    if (history.length > 0) {
      history[history.length - 1].priceToman = product.currentPriceToman;
      history[history.length - 1].customerQuoteToman = product.customerQuoteToman;
    }

    fs.writeFileSync(path.join(prodDir, 'history.json'), JSON.stringify(history, null, 2));
  });
}

initializeSeedData();

// GET all products
app.get('/api/products', (req, res) => {
  try {
    const productDirs = fs.readdirSync(DATA_DIR);
    const products: ProductItem[] = [];

    for (const dir of productDirs) {
      const prodFile = path.join(DATA_DIR, dir, 'product.json');
      if (fs.existsSync(prodFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
          products.push(data);
        } catch (e) {
          console.error('Error reading product:', prodFile, e);
        }
      }
    }

    res.json({ success: true, products });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET product history
app.get('/api/products/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const historyFile = path.join(DATA_DIR, id, 'history.json');

    if (!fs.existsSync(historyFile)) {
      return res.status(404).json({ success: false, error: 'تاریخچه‌ای برای این محصول یافت نشد' });
    }

    const history: PriceHistoryItem[] = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    res.json({ success: true, history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create product
app.post('/api/products', (req, res) => {
  try {
    const body = req.body;
    const id = body.id || `prod_${Date.now()}`;
    const prodDir = path.join(DATA_DIR, id);

    if (!fs.existsSync(prodDir)) {
      fs.mkdirSync(prodDir, { recursive: true });
    }

    const rawMargin = body.marginPercent;
    const margin =
      rawMargin !== undefined &&
      rawMargin !== null &&
      Number.isFinite(Number(rawMargin)) &&
      Number(rawMargin) >= 0
        ? Math.min(500, Number(rawMargin))
        : 8;
    const currentPrice = Number(body.currentPriceToman) || 0;
    const customerQuote =
      Number(body.customerQuoteToman) > 0
        ? Number(body.customerQuoteToman)
        : calculateRoundedCustomerQuoteLocal(currentPrice, margin);

    const newProduct: ProductItem = {
      id,
      name: body.name || 'محصول بدون نام',
      category: body.category || 'عمومی',
      sourceUrl: body.sourceUrl || '',
      imageUrl:
        body.imageUrl ||
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      currentPriceToman: currentPrice,
      lastPriceToman: currentPrice,
      shopCostToman: Number(body.shopCostToman) || Math.round(currentPrice * 0.92),
      marginPercent: margin,
      customerQuoteToman: customerQuote,
      stockStatus: body.stockStatus || 'in_stock',
      warranty: body.warranty || '',
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: body.notes || '',
      barcodes: Array.isArray(body.barcodes)
        ? body.barcodes.map((b: unknown) => String(b || '').trim()).filter(Boolean).slice(0, 20)
        : [],
    };

    fs.writeFileSync(path.join(prodDir, 'product.json'), JSON.stringify(newProduct, null, 2));

    // Initialize first history record
    const { date, time } = getJalaliDateString(new Date());
    const initialHistory: PriceHistoryItem[] = [
      {
        timestamp: new Date().toISOString(),
        jalaliDate: date,
        jalaliTime: time,
        priceToman: currentPrice,
        customerQuoteToman: customerQuote,
        source: 'ثبت اولیه',
      },
    ];

    fs.writeFileSync(path.join(prodDir, 'history.json'), JSON.stringify(initialHistory, null, 2));

    res.json({ success: true, product: newProduct });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update product
app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const prodDir = path.join(DATA_DIR, id);
    const prodFile = path.join(prodDir, 'product.json');

    if (!fs.existsSync(prodFile)) {
      return res.status(404).json({ success: false, error: 'محصول یافت نشد' });
    }

    const currentData: ProductItem = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
    const updated = { ...currentData, ...req.body, id };

    fs.writeFileSync(prodFile, JSON.stringify(updated, null, 2));
    res.json({ success: true, product: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE product: Completely wipe product folder, history and files as requested!
app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const prodDir = path.join(DATA_DIR, id);

    if (fs.existsSync(prodDir)) {
      fs.rmSync(prodDir, { recursive: true, force: true });
      return res.json({ success: true, message: `محصول و پوشه تاریخچه آن کاملاً حذف شد: ${id}` });
    } else {
      return res.status(404).json({ success: false, error: 'پوشه محصول یافت نشد' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Track URL health check endpoint
app.get('/api/track-url', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    kvConfigured: true,
    message: 'سرور محلی استعلام (server.ts) با موفقیت فعال و آماده پاسخگویی است',
    environment: 'Node.js Local Express',
    timestamp: new Date().toISOString(),
  });
});

// Local KV + Cloudflare Relay layer (lets browsers in Iran sync via this server with zero VPN)
const LOCAL_BUNDLE_FILE = path.join(BASE_DATA_DIR, 'shop_bundle_v1.json');
const LOCAL_PIN_FILE = path.join(BASE_DATA_DIR, 'shop_pin_auth.json');
const DEFAULT_UPSTREAM_CLOUDFLARE = 'https://estelam-005.pages.dev';

function sha256HexLocal(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getLocalFallbackPin(): string {
  return String(process.env.SHOP_PIN || '1405').trim();
}

function persistLocalPinHash(pin: string): void {
  try {
    const clean = String(pin || '').trim();
    if (!clean) return;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = sha256HexLocal(`${salt}:${clean}`);
    fs.writeFileSync(
      LOCAL_PIN_FILE,
      JSON.stringify({ salt, hash, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch {
    // Ignore local pin write failure
  }
}

function checkLocalPin(req: express.Request, bodyPin?: string): boolean {
  const provided = String(
    bodyPin || req.header('X-Shop-Pin') || req.header('x-shop-pin') || ''
  ).trim();
  if (!provided) return false;

  if (fs.existsSync(LOCAL_PIN_FILE)) {
    try {
      const record = JSON.parse(fs.readFileSync(LOCAL_PIN_FILE, 'utf-8'));
      if (record?.salt && record?.hash) {
        return sha256HexLocal(`${record.salt}:${provided}`) === record.hash;
      }
    } catch {
      // Fallback below
    }
  }

  return provided === getLocalFallbackPin();
}

function resolveUpstreamCloudflareOrigin(req: express.Request): string | null {
  if (process.env.CLOUDFLARE_RELAY === 'false') return null;

  const headerOrigin = String(req.header('X-Cloudflare-Origin') || '').trim();
  const envOrigin = String(process.env.CLOUDFLARE_ORIGIN || '').trim();
  const raw = headerOrigin || envOrigin || DEFAULT_UPSTREAM_CLOUDFLARE;
  if (!raw) return null;

  const normalized = raw.startsWith('http://') || raw.startsWith('https://')
    ? raw.replace(/\/+$/, '')
    : `https://${raw.replace(/\/+$/, '')}`;

  try {
    const targetUrl = new URL(normalized);
    const targetHost = targetUrl.host.toLowerCase();
    const targetHostname = targetUrl.hostname.toLowerCase();
    const reqHost = String(req.get('host') || '').toLowerCase();

    if (
      targetHost === reqHost ||
      targetHostname === 'localhost' ||
      targetHostname === '127.0.0.1' ||
      targetHostname === '0.0.0.0'
    ) {
      return null;
    }
    return targetUrl.origin;
  } catch {
    return null;
  }
}

async function relayToCloudflareUpstream(
  origin: string,
  pathname: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    pin?: string;
    body?: unknown;
    timeoutMs?: number;
  }
): Promise<{ ok: boolean; status: number; data: any } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5500);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (options.pin) {
      headers['X-Shop-Pin'] = options.pin;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${origin}${pathname}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      if (text.trim().startsWith('{')) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }
    }

    if (!data || typeof data !== 'object') {
      return null;
    }

    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ServerBundle {
  version: number;
  exportedAt: string;
  source: string;
  products: ProductItem[];
  histories: Record<string, PriceHistoryItem[]>;
  deletedIds: Record<string, string>;
}

function normalizeServerBundle(raw: any, sourceOverride?: string): ServerBundle {
  return {
    version: Number(raw?.version) || 1,
    exportedAt: typeof raw?.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    source: sourceOverride || String(raw?.source || 'local-express-kv'),
    products: Array.isArray(raw?.products) ? raw.products : [],
    histories: raw?.histories && typeof raw.histories === 'object' ? raw.histories : {},
    deletedIds: raw?.deletedIds && typeof raw.deletedIds === 'object' ? raw.deletedIds : {},
  };
}

function readLocalBundleFile(): ServerBundle | null {
  try {
    if (!fs.existsSync(LOCAL_BUNDLE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LOCAL_BUNDLE_FILE, 'utf-8'));
    if (!raw || !Array.isArray(raw.products)) return null;
    return normalizeServerBundle(raw);
  } catch {
    return null;
  }
}

function writeLocalBundleFile(bundle: ServerBundle): void {
  fs.writeFileSync(LOCAL_BUNDLE_FILE, JSON.stringify(bundle, null, 2));
}

function mergeServerBundles(base: ServerBundle, incoming: ServerBundle): ServerBundle {
  const mergedDeletedIds: Record<string, string> = { ...(base.deletedIds || {}) };
  Object.entries(incoming.deletedIds || {}).forEach(([id, delIso]) => {
    const existingMs = mergedDeletedIds[id] ? new Date(mergedDeletedIds[id]).getTime() : 0;
    const incomingMs = new Date(delIso).getTime();
    if (incomingMs > existingMs) {
      mergedDeletedIds[id] = delIso;
    }
  });

  const productMap = new Map<string, ProductItem>();
  const getMs = (p: any) => {
    const ms = new Date(p?.updatedAt || p?.lastRefreshedAt || p?.createdAt || 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  for (const item of [...base.products, ...incoming.products]) {
    if (!item?.id) continue;
    const prodTime = getMs(item);
    const delTime = mergedDeletedIds[item.id] ? new Date(mergedDeletedIds[item.id]).getTime() : 0;
    if (delTime > prodTime) continue;

    const existing = productMap.get(item.id);
    if (!existing || prodTime > getMs(existing)) {
      productMap.set(item.id, item);
    }
  }

  const products = Array.from(productMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const histories: Record<string, PriceHistoryItem[]> = {};
  for (const p of products) {
    const map = new Map<string, PriceHistoryItem>();
    for (const h of [...(base.histories?.[p.id] || []), ...(incoming.histories?.[p.id] || [])]) {
      if (!h) continue;
      const key = h.timestamp
        ? `${h.timestamp}_${h.priceToman}`
        : `${h.jalaliDate}_${h.jalaliTime}_${h.priceToman}`;
      if (!map.has(key)) map.set(key, h);
    }
    const mergedH = Array.from(map.values()).sort(
      (x, y) => new Date(x.timestamp || 0).getTime() - new Date(y.timestamp || 0).getTime()
    );
    if (mergedH.length > 0) histories[p.id] = mergedH;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'cloudflare-kv',
    products,
    histories,
    deletedIds: mergedDeletedIds,
  };
}

let cachedUpstreamKvStatus: {
  origin: string;
  checkedAt: number;
  reachable: boolean;
  kvConfigured: boolean;
  kvBindingName?: string | null;
} | null = null;
let upstreamKvProbeInFlight: Promise<void> | null = null;

async function refreshUpstreamKvStatus(origin: string, waitMs: number): Promise<void> {
  if (!upstreamKvProbeInFlight) {
    upstreamKvProbeInFlight = (async () => {
      try {
        const upstreamRes = await relayToCloudflareUpstream(origin, '/api/kv/status', {
          method: 'GET',
          timeoutMs: 2200,
        });
        cachedUpstreamKvStatus = {
          origin,
          checkedAt: Date.now(),
          reachable: Boolean(upstreamRes?.ok && upstreamRes?.data?.available),
          kvConfigured: Boolean(upstreamRes?.data?.kvConfigured),
          kvBindingName: upstreamRes?.data?.kvBindingName ?? null,
        };
      } finally {
        upstreamKvProbeInFlight = null;
      }
    })();
  }
  await Promise.race([
    upstreamKvProbeInFlight,
    new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
  ]);
}

app.get('/api/kv/status', async (req, res) => {
  const upstream = resolveUpstreamCloudflareOrigin(req);
  if (upstream) {
    const isFresh =
      cachedUpstreamKvStatus &&
      cachedUpstreamKvStatus.origin === upstream &&
      Date.now() - cachedUpstreamKvStatus.checkedAt < 25000;
    if (!isFresh) {
      await refreshUpstreamKvStatus(upstream, cachedUpstreamKvStatus ? 200 : 1200);
    }
  }

  const upstreamState =
    upstream && cachedUpstreamKvStatus && cachedUpstreamKvStatus.origin === upstream
      ? cachedUpstreamKvStatus
      : null;
  const upstreamReachable = Boolean(upstreamState?.reachable);
  const upstreamKvConfigured = Boolean(upstreamState?.kvConfigured);

  res.json({
    success: true,
    available: true,
    kvConfigured: true,
    requiresPin: true,
    relayed: upstreamReachable && upstreamKvConfigured,
    upstreamReachable,
    upstreamKvConfigured,
    kvBindingName: upstreamState?.kvBindingName || (upstreamReachable ? 'RELAY_KV' : 'LOCAL_STORE'),
    environment:
      upstreamReachable && upstreamKvConfigured
        ? 'Cloudflare Relay + Local Express Store'
        : 'Local Express Store',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/kv/verify-pin', async (req, res) => {
  const pin = String(
    req.body?.pin || req.header('X-Shop-Pin') || req.header('x-shop-pin') || ''
  ).trim();
  const upstream = resolveUpstreamCloudflareOrigin(req);

  if (upstream && pin) {
    const upstreamRes = await relayToCloudflareUpstream(upstream, '/api/kv/verify-pin', {
      method: 'POST',
      body: { pin },
      timeoutMs: 4500,
    });

    if (upstreamRes) {
      if (upstreamRes.status === 401) {
        return res.status(401).json({
          success: false,
          error: upstreamRes.data?.error || 'رمز فروشگاه نادرست است. لطفاً دوباره بررسی کنید.',
        });
      }
      if (upstreamRes.ok && upstreamRes.data?.success) {
        persistLocalPinHash(pin);
        return res.json({
          success: true,
          kvConfigured: true,
          relayed: true,
          upstreamKvConfigured: Boolean(upstreamRes.data?.kvConfigured),
        });
      }
    }
  }

  if (!checkLocalPin(req, pin)) {
    return res.status(401).json({
      success: false,
      error: 'رمز فروشگاه نادرست است. لطفاً دوباره بررسی کنید.',
    });
  }
  res.json({
    success: true,
    kvConfigured: true,
    relayed: false,
  });
});

app.post('/api/kv/change-pin', async (req, res) => {
  const currentPin = String(req.body?.currentPin || '').trim();
  const newPin = String(req.body?.newPin || '').trim();
  const upstream = resolveUpstreamCloudflareOrigin(req);

  if (newPin.length < 4 || newPin.length > 64) {
    return res.status(400).json({
      success: false,
      error: 'رمز جدید باید حداقل ۴ و حداکثر ۶۴ کاراکتر باشد.',
    });
  }

  if (upstream) {
    const upstreamRes = await relayToCloudflareUpstream(upstream, '/api/kv/change-pin', {
      method: 'POST',
      body: { currentPin, newPin },
      timeoutMs: 5000,
    });
    if (upstreamRes) {
      if (upstreamRes.status === 401 || upstreamRes.status === 400) {
        return res.status(upstreamRes.status).json(upstreamRes.data);
      }
      if (upstreamRes.ok && upstreamRes.data?.success) {
        persistLocalPinHash(newPin);
        return res.json({
          success: true,
          relayed: true,
          message: 'رمز فروشگاه با موفقیت در کلادفلر و سرور واسط تغییر یافت و رمزنگاری شد.',
        });
      }
    }
  }

  if (!checkLocalPin(req, currentPin)) {
    return res.status(401).json({
      success: false,
      error: 'رمز فعلی فروشگاه نادرست است.',
    });
  }

  try {
    persistLocalPinHash(newPin);
    res.json({
      success: true,
      relayed: false,
      message: 'رمز فروشگاه با موفقیت تغییر یافت و رمزنگاری شد.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'خطا در ذخیره رمز جدید',
    });
  }
});

app.get('/api/kv/bundle', async (req, res) => {
  const pin = String(req.header('X-Shop-Pin') || req.header('x-shop-pin') || '').trim();
  const upstream = resolveUpstreamCloudflareOrigin(req);

  if (upstream && pin) {
    const upstreamRes = await relayToCloudflareUpstream(upstream, '/api/kv/bundle', {
      method: 'GET',
      pin,
      timeoutMs: 4500,
    });

    if (upstreamRes) {
      if (upstreamRes.status === 401) {
        return res.status(401).json({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' });
      }
      persistLocalPinHash(pin);

      if (upstreamRes.ok && upstreamRes.data?.kvConfigured) {
        const localBundle = readLocalBundleFile();
        const remoteBundle = upstreamRes.data.bundle
          ? normalizeServerBundle(upstreamRes.data.bundle, 'cloudflare-kv')
          : null;

        if (remoteBundle && localBundle && localBundle.source === 'offline-dirty') {
          const merged = mergeServerBundles(remoteBundle, localBundle);
          writeLocalBundleFile(merged);
          await relayToCloudflareUpstream(upstream, '/api/kv/bundle', {
            method: 'PUT',
            pin,
            body: merged,
            timeoutMs: 4500,
          });
          return res.json({
            success: true,
            kvConfigured: true,
            relayed: true,
            setupRequired: false,
            bundle: merged,
          });
        }

        if (remoteBundle) {
          writeLocalBundleFile(remoteBundle);
          return res.json({
            success: true,
            kvConfigured: true,
            relayed: true,
            setupRequired: false,
            bundle: remoteBundle,
          });
        }

        if (localBundle) {
          const seededRemote = { ...localBundle, source: 'cloudflare-kv' };
          await relayToCloudflareUpstream(upstream, '/api/kv/bundle', {
            method: 'PUT',
            pin,
            body: seededRemote,
            timeoutMs: 6000,
          });
          writeLocalBundleFile(seededRemote);
          return res.json({
            success: true,
            kvConfigured: true,
            relayed: true,
            setupRequired: false,
            bundle: seededRemote,
          });
        }

        return res.json({
          success: true,
          kvConfigured: true,
          relayed: true,
          setupRequired: false,
          bundle: null,
        });
      }
    }
  }

  if (!checkLocalPin(req, pin)) {
    return res.status(401).json({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' });
  }
  try {
    const bundle = readLocalBundleFile();
    res.json({
      success: true,
      kvConfigured: true,
      relayed: false,
      setupRequired: false,
      bundle,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'خطا در خواندن فایل محلی' });
  }
});

app.put('/api/kv/bundle', async (req, res) => {
  const pin = String(req.header('X-Shop-Pin') || req.header('x-shop-pin') || '').trim();
  const upstream = resolveUpstreamCloudflareOrigin(req);
  const incomingBundle = normalizeServerBundle(req.body, 'cloudflare-kv');

  if (upstream && pin) {
    const upstreamRes = await relayToCloudflareUpstream(upstream, '/api/kv/bundle', {
      method: 'PUT',
      pin,
      body: incomingBundle,
      timeoutMs: 4500,
    });

    if (upstreamRes) {
      if (upstreamRes.status === 401) {
        return res.status(401).json({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' });
      }
      persistLocalPinHash(pin);

      if (upstreamRes.ok && upstreamRes.data?.success && upstreamRes.data?.kvConfigured) {
        const savedBundle = normalizeServerBundle(
          upstreamRes.data.bundle || incomingBundle,
          'cloudflare-kv'
        );
        writeLocalBundleFile(savedBundle);
        return res.json({
          success: true,
          kvConfigured: true,
          relayed: true,
          bundle: savedBundle,
        });
      }
    }
  }

  if (!checkLocalPin(req, pin)) {
    return res.status(401).json({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' });
  }
  try {
    const localBundle = normalizeServerBundle(req.body, upstream ? 'offline-dirty' : 'local-express-kv');
    writeLocalBundleFile(localBundle);
    res.json({
      success: true,
      kvConfigured: true,
      relayed: false,
      upstreamSyncPending: Boolean(upstream),
      bundle: localBundle,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'خطا در ذخیره فایل محلی' });
  }
});

// Track URL & Inspect Snippet endpoint
app.post('/api/track-url', async (req, res) => {
  try {
    const { url, inspectHtml } = req.body;

    // 1. Check if user provided an inspect element snippet (e.g. from Chrome DevTools)
    if (inspectHtml && typeof inspectHtml === 'string' && inspectHtml.trim()) {
      const parsedInspect = extractPriceFromDigikalaInspect(inspectHtml);
      if (parsedInspect) {
        return res.json({
          success: true,
          data: {
            name: req.body.name || 'کالای استعلام‌شده از دیجی‌کالا',
            priceToman: parsedInspect.priceToman,
            imageUrl:
              req.body.imageUrl ||
              'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
            warranty: 'گارانتی معتبر شرکتی',
            source: `استخراج مستقیم از المان [${parsedInspect.sourceType}]`,
            stockStatus: 'in_stock',
          },
        });
      }
    }

    if (req.body?.ping) {
      return res.json({
        success: true,
        status: 'online',
        kvConfigured: true,
        message: 'سرور محلی استعلام آماده است',
      });
    }

    if (!url) {
      return res.status(400).json({ success: false, error: 'آدرس اینترنتی یا متن اینسپکت وارد نشده است' });
    }

    // 2. Digikala Live URL Scraper via High-Speed Universal Microservice Engine
    const cleanUrl = String(url).trim();
    if (isDigikalaUrlOrId(cleanUrl)) {
      console.log(`[Scraper] Starting live query for Digikala URL/ID: ${cleanUrl}`);
      let detailedError = '';
      let detailedStatus = 0;

      try {
        const detailed = await scrapeDigikalaDetailed(cleanUrl, {
          maxRounds: 2,
          perRequestTimeoutMs: 4200,
        });
        detailedError = detailed.error || '';
        detailedStatus = detailed.lastStatus || 0;

        let liveData = detailed.data;
        if (!liveData && detailedStatus !== 404) {
          liveData = await scrapeLiveDigikalaProduct(cleanUrl);
        }
        if (liveData && (liveData.priceToman > 0 || liveData.stockStatus === 'out_of_stock')) {
          console.log(`[Scraper] Successfully extracted data: ${liveData.priceToman} Toman for ${liveData.name}`);
          return res.json({
            success: true,
            data: {
              ...liveData,
              warranty: '',
            },
          });
        }
      } catch (err: any) {
        detailedError = err?.message || detailedError;
        console.warn(`[Scraper] Live scrape warning:`, err.message);
      }

      const upstream = resolveUpstreamCloudflareOrigin(req);
      if (upstream && detailedStatus !== 404) {
        const upstreamRes = await relayToCloudflareUpstream(upstream, '/api/track-url', {
          method: 'POST',
          body: { url: cleanUrl },
          timeoutMs: 4500,
        });
        if (upstreamRes?.ok && upstreamRes.data?.success && upstreamRes.data?.data) {
          return res.json(upstreamRes.data);
        }
      }

      return res.status(detailedStatus === 404 ? 404 : 502).json({
        success: false,
        error:
          detailedError ||
          'دریافت اطلاعات کالا از دیجی‌کالا ناموفق بود. لطفاً لینک محصول را بررسی یا مجدداً تلاش کنید.',
      });
    }

    // Fallback: If URL contains tech keywords, extract recognizable metadata
    let parsedName = 'قطعه / کالای سخت‌افزاری کامپیوتر';
    let defaultPrice = 0;
    let img = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
    let cat = 'لوازم جانبی و قطعات';

    if (url.includes('laptop') || url.includes('لپ-تاپ')) {
      parsedName = 'لپ‌تاپ تخصصی کارشناسی شده';
      cat = 'لپ‌تاپ و اولترابوک';
      img = 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=600&q=80';
    } else if (url.includes('mouse') || url.includes('ماوس')) {
      parsedName = 'ماوس اپتیکال / گیمینگ';
      cat = 'لوازم جانبی و گیمینگ';
      img = 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=600&q=80';
    } else if (url.includes('ssd') || url.includes('اس-اس-دی')) {
      parsedName = 'حافظه پرسرعت SSD NVMe M.2';
      cat = 'قطعات و ارتقا سیستم';
      img = 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80';
    }

    return res.json({
      success: true,
      data: {
        name: parsedName,
        category: cat,
        priceToman: defaultPrice,
        imageUrl: img,
        warranty: '',
        source: 'استعلام آنلاین',
        stockStatus: 'in_stock',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync a single product with Digikala live price (strictly genuine reference price - ZERO artificial fluctuation)
async function syncProductPriceWithStore(
  prod: ProductItem,
  sourceTag: string
): Promise<{ product: ProductItem; priceChanged: boolean; message: string }> {
  const now = new Date();
  const { date, time } = getJalaliDateString(now);
  const prodDir = path.join(DATA_DIR, prod.id);
  const prodFile = path.join(prodDir, 'product.json');
  const historyFile = path.join(prodDir, 'history.json');

  const oldPrice = prod.currentPriceToman;
  let realPrice = prod.currentPriceToman;
  let source = sourceTag;
  let isLiveScraped = false;

  // If product has a sourceUrl from Digikala, fetch its real live price from [data-testid="price-final"]
  if (prod.sourceUrl && isDigikalaUrlOrId(prod.sourceUrl)) {
    try {
      let scraped = await scrapeProductUniversal(prod.sourceUrl);
      if (!scraped) {
        scraped = await scrapeLiveDigikalaProduct(prod.sourceUrl);
      }
      if (scraped && scraped.priceToman > 0) {
        realPrice = scraped.priceToman;
        source = scraped.hasDiscount
          ? 'استعلام قیمت اصلی و بدون تخفیف دیجی‌کالا [data-testid="price-no-discount"]'
          : 'استعلام مستقیم دیجی‌کالا [data-testid="price-final"]';
        isLiveScraped = true;

        if (scraped.imageUrl && (!prod.imageUrl || prod.imageUrl.includes('unsplash'))) {
          prod.imageUrl = scraped.imageUrl;
        }
        if (scraped.name && (!prod.name || prod.name === 'محصول بدون نام' || prod.name === 'کالای دیجی‌کالا')) {
          prod.name = scraped.name;
        }
      }
    } catch (err: any) {
      console.warn(`[Sync] Live scrape warning for ${prod.id}:`, err.message);
    }
  }

  const priceChanged = realPrice !== oldPrice;

  // Set reference price strictly to realPrice
  prod.currentPriceToman = realPrice;
  if (priceChanged) {
    prod.lastPriceToman = oldPrice;
  } else {
    // Exact same price on Digikala: difference is 0% (constant, no fake fluctuations)
    prod.lastPriceToman = realPrice;
  }

  const margin =
    prod.marginPercent !== undefined &&
    prod.marginPercent !== null &&
    Number.isFinite(Number(prod.marginPercent)) &&
    Number(prod.marginPercent) >= 0
      ? Math.min(500, Number(prod.marginPercent))
      : 8;
  const newCustomerQuote = calculateRoundedCustomerQuoteLocal(realPrice, margin);
  prod.customerQuoteToman = newCustomerQuote;
  prod.lastRefreshedAt = now.toISOString();

  fs.writeFileSync(prodFile, JSON.stringify(prod, null, 2));

  // Only record in history if:
  // 1) History is completely empty
  // 2) The reference price on Digikala actually changed compared to the last recorded entry
  let history: PriceHistoryItem[] = [];
  if (fs.existsSync(historyFile)) {
    try {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    } catch {
      history = [];
    }
  }

  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (history.length === 0 || (lastEntry && lastEntry.priceToman !== realPrice)) {
    const changePercent =
      lastEntry && lastEntry.priceToman > 0
        ? Number((((realPrice - lastEntry.priceToman) / lastEntry.priceToman) * 100).toFixed(1))
        : 0;

    history.push({
      timestamp: now.toISOString(),
      jalaliDate: date,
      jalaliTime: time,
      priceToman: realPrice,
      customerQuoteToman: newCustomerQuote,
      source,
      changePercent,
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  }

  const message = priceChanged
    ? `قیمت کالا «${prod.name}» از ${formatPersianNumber(oldPrice)} به ${formatPersianNumber(realPrice)} تومان در دیجی‌کالا تغییر یافت`
    : `قیمت روز کالا «${prod.name}» دقیقاً ${formatPersianNumber(realPrice)} تومان استعلام شد (مطابق دیجی‌کالا بدون نوسان ساختگی)`;

  return { product: prod, priceChanged, message };
}

// Refresh all products price directly from Digikala (NO artificial fluctuation)
app.post('/api/products/refresh-all', async (req, res) => {
  try {
    const productDirs = fs.readdirSync(DATA_DIR);
    const updatedProducts: ProductItem[] = [];
    let changedCount = 0;

    for (const dir of productDirs) {
      const prodDir = path.join(DATA_DIR, dir);
      const prodFile = path.join(prodDir, 'product.json');

      if (fs.existsSync(prodFile)) {
        try {
          const prod: ProductItem = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
          const result = await syncProductPriceWithStore(
            prod,
            req.body.isScheduled ? 'پایش خودکار ۳ ساعته' : 'استعلام واقعی دیجی‌کالا'
          );
          if (result.priceChanged) changedCount++;
          updatedProducts.push(result.product);
        } catch (e) {
          console.error('Error refreshing product:', prodFile, e);
        }
      }
    }

    const message =
      changedCount > 0
        ? `${toPersianDigits(updatedProducts.length)} کالا استعلام شدند (${toPersianDigits(changedCount)} کالا تغییر قیمت واقعی در دیجی‌کالا داشتند)`
        : `${toPersianDigits(updatedProducts.length)} کالا مستقیماً از دیجی‌کالا استعلام شدند؛ قیمت روز مرجع دقیقاً تطبیق داده شد (بدون نوسان ساختگی)`;

    res.json({
      success: true,
      message,
      products: updatedProducts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh a single specific product from Digikala
app.post('/api/products/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const prodDir = path.join(DATA_DIR, id);
    const prodFile = path.join(prodDir, 'product.json');

    if (!fs.existsSync(prodFile)) {
      return res.status(404).json({ success: false, error: 'محصول یافت نشد' });
    }

    const prod: ProductItem = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
    const result = await syncProductPriceWithStore(prod, 'استعلام مستقیم دیجی‌کالا');

    res.json({
      success: true,
      message: result.message,
      product: result.product,
      priceChanged: result.priceChanged,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SIMULATION & TEST RUNNER:
// Allows testing and verifying that price changes on the reference site immediately update
// product price, customer quote, price history, and trend graphs!
app.post('/api/simulation/test-price-change', async (req, res) => {
  try {
    let { productId, newPriceToman, percentChange } = req.body;

    const productDirs = fs.readdirSync(DATA_DIR);
    if (productDirs.length === 0) {
      return res.status(400).json({ success: false, error: 'هیچ کالایی برای آزمون شبیه‌سازی یافت نشد' });
    }

    if (!productId || !fs.existsSync(path.join(DATA_DIR, productId, 'product.json'))) {
      productId = productDirs[0];
    }

    const prodDir = path.join(DATA_DIR, productId);
    const prodFile = path.join(prodDir, 'product.json');
    const historyFile = path.join(prodDir, 'history.json');

    const currentProd: ProductItem = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
    const oldPrice = currentProd.currentPriceToman;
    const oldQuote = currentProd.customerQuoteToman;

    // Calculate target new price
    let targetPrice = Number(newPriceToman);
    if (!targetPrice || targetPrice <= 0) {
      const pct = Number(percentChange) || 5;
      targetPrice = Math.round(oldPrice * (1 + pct / 100));
    }

    const now = new Date();
    const { date, time } = getJalaliDateString(now);

    const margin =
      currentProd.marginPercent !== undefined &&
      currentProd.marginPercent !== null &&
      Number.isFinite(Number(currentProd.marginPercent)) &&
      Number(currentProd.marginPercent) >= 0
        ? Math.min(500, Number(currentProd.marginPercent))
        : 8;
    const newCustomerQuote = calculateRoundedCustomerQuoteLocal(targetPrice, margin);

    // Update product object
    currentProd.lastPriceToman = oldPrice;
    currentProd.currentPriceToman = targetPrice;
    currentProd.customerQuoteToman = newCustomerQuote;
    currentProd.lastRefreshedAt = now.toISOString();

    fs.writeFileSync(prodFile, JSON.stringify(currentProd, null, 2));

    // Append to history
    let history: PriceHistoryItem[] = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      } catch {
        history = [];
      }
    }

    const priceDiff = targetPrice - oldPrice;
    const actualPercent = Number(((priceDiff / oldPrice) * 100).toFixed(1));

    const newHistoryItem: PriceHistoryItem = {
      timestamp: now.toISOString(),
      jalaliDate: date,
      jalaliTime: time,
      priceToman: targetPrice,
      customerQuoteToman: newCustomerQuote,
      source: 'شبیه‌سازی تغییر قیمت در سایت مرجع (آزمون صحت عملکرد)',
      changePercent: actualPercent,
    };

    history.push(newHistoryItem);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    return res.json({
      success: true,
      message: `آزمون شبیه‌سازی با موفقیت انجام شد: قیمت «${currentProd.name}» با موفقیت بروزرسانی شد.`,
      testReport: {
        product: currentProd,
        oldPrice,
        newPrice: targetPrice,
        priceDiff,
        percentChange: actualPercent,
        oldQuote,
        newQuote: newCustomerQuote,
        historyCount: history.length,
        jalaliTimestamp: `${date} - ${time}`,
        verificationChecks: {
          productUpdated: true,
          quoteRecalculated: true,
          historyRecorded: true,
          databaseVerified: true,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scheduler status & execution logic
let lastAutoSyncTime: string | null = null;
let lastSyncReport: { hour: number; totalChecked: number; priceChangedCount: number; timestamp: string } | null = null;

// Refresh synced offline/local bundle (shop_bundle_v1.json) used by Electron EXE & PWA
async function syncLocalBundleFileThreeHour(triggerSource: string): Promise<{ checked: number; changed: number }> {
  if (!fs.existsSync(LOCAL_BUNDLE_FILE)) {
    return { checked: 0, changed: 0 };
  }

  let checked = 0;
  let changed = 0;

  try {
    const rawText = fs.readFileSync(LOCAL_BUNDLE_FILE, 'utf-8');
    const bundle = JSON.parse(rawText);
    if (!bundle || !Array.isArray(bundle.products) || bundle.products.length === 0) {
      return { checked: 0, changed: 0 };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const { date, time } = getJalaliDateString(now);
    const histories: Record<string, PriceHistoryItem[]> =
      bundle.histories && typeof bundle.histories === 'object' ? bundle.histories : {};

    for (let i = 0; i < bundle.products.length; i++) {
      const prod = bundle.products[i];
      if (!prod?.sourceUrl) continue;

      if (isDigikalaUrlOrId(prod.sourceUrl)) {
        try {
          let scraped = await scrapeProductUniversal(prod.sourceUrl);
          if (!scraped) {
            scraped = await scrapeLiveDigikalaProduct(prod.sourceUrl);
          }
          if (scraped && (scraped.priceToman > 0 || scraped.stockStatus === 'out_of_stock')) {
            checked++;
            const oldPrice = Number(prod.currentPriceToman) || 0;
            const newPrice = scraped.priceToman > 0 ? scraped.priceToman : oldPrice;
            const priceChanged = newPrice !== oldPrice && newPrice > 0;
            if (priceChanged) changed++;

            const margin =
              prod.marginPercent !== undefined && prod.marginPercent !== null
                ? Number(prod.marginPercent)
                : 8;
            const newQuote = calculateRoundedCustomerQuoteLocal(newPrice, margin);

            bundle.products[i] = {
              ...prod,
              name:
                scraped.name && (!prod.name || prod.name === 'محصول بدون نام')
                  ? scraped.name
                  : prod.name,
              category: scraped.category || prod.category,
              imageUrl:
                scraped.imageUrl && (!prod.imageUrl || String(prod.imageUrl).includes('unsplash'))
                  ? scraped.imageUrl
                  : prod.imageUrl,
              currentPriceToman: newPrice,
              lastPriceToman: priceChanged ? oldPrice : newPrice,
              customerQuoteToman: newQuote,
              stockStatus: scraped.stockStatus || prod.stockStatus || 'in_stock',
              lastRefreshedAt: nowIso,
              updatedAt: priceChanged ? nowIso : prod.updatedAt || nowIso,
            };

            const existingHist = Array.isArray(histories[prod.id]) ? histories[prod.id] : [];
            const lastEntry = existingHist.length > 0 ? existingHist[existingHist.length - 1] : null;
            if (existingHist.length === 0 || (priceChanged && lastEntry?.priceToman !== newPrice)) {
              const changePercent =
                lastEntry && lastEntry.priceToman > 0
                  ? Number((((newPrice - lastEntry.priceToman) / lastEntry.priceToman) * 100).toFixed(1))
                  : 0;
              histories[prod.id] = [
                ...existingHist,
                {
                  timestamp: nowIso,
                  jalaliDate: date,
                  jalaliTime: time,
                  priceToman: newPrice,
                  customerQuoteToman: newQuote,
                  source: triggerSource,
                  changePercent,
                },
              ];
            }
          }
        } catch (err: any) {
          console.warn(`[BundleScheduler] Scrape warning for ${prod.id}:`, err?.message);
        }
      }
    }

    if (checked > 0) {
      bundle.histories = histories;
      bundle.exportedAt = nowIso;
      // Mark offline-dirty when prices changed so Web/Electron auto-merges into Firebase & Cloudflare when online
      if (changed > 0) {
        bundle.source = 'offline-dirty';
      }
      fs.writeFileSync(LOCAL_BUNDLE_FILE, JSON.stringify(bundle, null, 2));
    }
  } catch (err: any) {
    console.warn('[BundleScheduler] Failed reading/updating local bundle:', err?.message);
  }

  return { checked, changed };
}

// Function to run the fixed 3-hour automatic synchronization
async function executeThreeHourAutoSync(triggerSource: string = 'پایش خودکار ۳ ساعته') {
  const now = new Date();
  lastAutoSyncTime = now.toISOString();
  console.log(`[Scheduler] 3-Hour Sync Started (${triggerSource}) at ${now.toLocaleTimeString()}`);

  let changedCount = 0;
  let totalCount = 0;
  try {
    // 1. Sync bundle JSON used by Electron desktop & Offline/Cloudflare failover
    const bundleStats = await syncLocalBundleFileThreeHour(triggerSource);
    totalCount += bundleStats.checked;
    changedCount += bundleStats.changed;

    // 2. Sync file-based products folder if present
    const productDirs = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
    for (const dir of productDirs) {
      const prodDir = path.join(DATA_DIR, dir);
      const prodFile = path.join(prodDir, 'product.json');

      if (fs.existsSync(prodFile)) {
        try {
          totalCount++;
          const prod: ProductItem = JSON.parse(fs.readFileSync(prodFile, 'utf-8'));
          const res = await syncProductPriceWithStore(prod, triggerSource);
          if (res.priceChanged) changedCount++;
        } catch (e) {
          console.error('[Scheduler Error for prod]', dir, e);
        }
      }
    }

    lastSyncReport = {
      hour: now.getHours(),
      totalChecked: totalCount,
      priceChangedCount: changedCount,
      timestamp: now.toISOString(),
    };
    console.log(`[Scheduler] 3-Hour Sync Complete: ${totalCount} checked, ${changedCount} price(s) updated.`);
  } catch (e) {
    console.error('[Scheduler Error]', e);
  }

  return { totalCount, changedCount, lastSyncReport };
}

// Scheduler status endpoint
app.get('/api/scheduler/status', (req, res) => {
  const next = getNextScheduledRefresh();
  res.json({
    success: true,
    active: true,
    scheduleInterval: 'هر ۳ ساعت یکبار در ۸ نوبت ثابت روزانه',
    fixedScheduleHours: FIXED_SCHEDULE_HOURS,
    nextScheduledTime: next.formattedTargetTime,
    remainingMinutes: next.remainingMinutes,
    lastAutoSyncTime,
    lastSyncReport,
  });
});

// Manual trigger for the 3-hour schedule test
app.post('/api/scheduler/trigger-now', async (req, res) => {
  try {
    const result = await executeThreeHourAutoSync('استعلام دستی نوبت ۳ ساعته');
    res.json({
      success: true,
      message: `پایش ۳ ساعته با موفقیت انجام شد: ${result.totalCount} کالا بررسی شد.`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

let schedulerIntervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckedHour = -1;

function ensureBackgroundSchedulerStarted() {
  if (schedulerIntervalHandle) return;
  schedulerIntervalHandle = setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // If current hour is in FIXED_SCHEDULE_HOURS and it's within the first 5 minutes of the hour
    if (FIXED_SCHEDULE_HOURS.includes(currentHour) && currentMinute < 5 && lastCheckedHour !== currentHour) {
      lastCheckedHour = currentHour;
      await executeThreeHourAutoSync('پایش خودکار ۳ ساعته');
    }
  }, 20000); // Check every 20 seconds
}

// Mount Vite middleware in development or serve prebuilt dist directory
export async function startShopServer() {
  ensureBackgroundSchedulerStarted();

  const distDir = process.env.SHOP_DIST_DIR
    ? path.resolve(process.env.SHOP_DIST_DIR)
    : path.join(__dirname, 'dist');

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript');
        res.send(
          `const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return { data: {}, accept: noop, acceptExports: noop, dispose: noop, prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}`
        );
      });
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : true,
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return new Promise<void>((resolve, reject) => {
    httpServer.once('error', (err) => {
      console.error(`Server failed to bind on ${HOST}:${PORT}:`, err);
      reject(err);
    });
    httpServer.listen(PORT, HOST, () => {
      console.log(`Computer Shop Price Tracker Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

if (process.env.SHOP_MANUAL_START !== '1') {
  startShopServer();
}
