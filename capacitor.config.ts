const config = {
  appId: 'ir.esteam.pricetracker',
  appName: 'پایش قیمت فروشگاه',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
