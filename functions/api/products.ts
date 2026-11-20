/**
 * Cloudflare Pages Function for /api/products
 * Serves products and handles product creation on Cloudflare Edge.
 */

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_lenovo_ideapad_1',
    name: 'لپ‌تاپ لنوو مدل IdeaPad 1 15IJL7 با پردازنده Celeron N4500، رم DDR4 8GB، حافظه SSD 256GB، نمایشگر 15.6 اینچ Full HD',
    category: 'لپ‌تاپ و اولترابوک',
    sourceUrl: 'https://www.digikala.com/product/dkp-18991772/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/509ef6a33068c0d055e624baf07569faa72ea082_1786538650.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 89000000,
    lastPriceToman: 89000000,
    marginPercent: 0,
    customerQuoteToman: 89000000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'پرفروش‌ترین لپ‌تاپ اقتصادی با قیمت اصلی بدون احتساب بیمه',
  },
  {
    id: 'prod_t2_gaming_mouse',
    name: 'ماوس بی سیم گیمینگ مدل T2',
    category: 'لوازم جانبی و گیمینگ',
    sourceUrl: 'https://www.digikala.com/product/dkp-20717228/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/e575af4ee6bdc77e88284fa977c39480bbacf27d_1760876748.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 2350000,
    lastPriceToman: 2350000,
    marginPercent: 0,
    customerQuoteToman: 2350000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'ماوس تخفیف‌خورده که قیمت اصلی ۲,۳۵۰,۰۰۰ تومان بدون تخفیف شگفت‌انگیز ثبت شده است',
  },
  {
    id: 'prod_samsung_ssd_980pro',
    name: 'حافظه اس‌اس‌دی سامسونگ مدل 980 PRO PCIe 4.0 NVMe M.2 ظرفیت 1 ترابایت',
    category: 'قطعات و ارتقا سیستم',
    sourceUrl: 'https://www.digikala.com/product/dkp-4820194/',
    imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 5450000,
    lastPriceToman: 5300000,
    marginPercent: 0,
    customerQuoteToman: 5450000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'قطعه اصلی برای ارتقای لپ‌تاپ‌های بخش تعمیرات مغازه',
  },
  {
    id: 'prod_xiaomi_monitor_27',
    name: 'مانیتور گیمینگ ۲۷ اینچ شیائومی مدل Redmi G27 با نرخ نوسازی 165Hz IPS',
    category: 'مانیتور و نمایشگر',
    sourceUrl: 'https://www.digikala.com/product/dkp-9302148/',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 9800000,
    lastPriceToman: 9400000,
    marginPercent: 0,
    customerQuoteToman: 9800000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'مانیتور گیمینگ با وضوح بالا',
  },
];

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      success: true,
      products: DEFAULT_PRODUCTS,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export async function onRequestPost(context: any) {
  try {
    const body: any = await context.request.json();
    const newProd = {
      id: `prod_${Date.now()}`,
      name: body.name || 'کالای جدید',
      category: body.category || 'لوازم جانبی و قطعات',
      sourceUrl: body.sourceUrl || '',
      imageUrl:
        body.imageUrl ||
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      currentPriceToman: Number(body.currentPriceToman) || 0,
      lastPriceToman: Number(body.currentPriceToman) || 0,
      marginPercent: 0,
      customerQuoteToman: Number(body.currentPriceToman) || 0,
      stockStatus: body.stockStatus || 'in_stock',
      warranty: '',
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: body.notes || '',
    };

    return new Response(
      JSON.stringify({
        success: true,
        product: newProd,
        message: 'کالا با موفقیت در لبه کلادفلر اضافه شد',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'خطا در ثبت کالا',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
