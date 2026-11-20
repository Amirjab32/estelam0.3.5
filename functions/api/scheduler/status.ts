/**
 * Cloudflare Pages Function for /api/scheduler/status
 */

export async function onRequestGet() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = (Math.floor(currentHour / 3) + 1) * 3;
  const nextTimeString = `ساعت ${String(nextHour % 24).padStart(2, '0')}:00`;

  return new Response(
    JSON.stringify({
      success: true,
      intervalHours: 3,
      scheduleTimes: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
      nextScheduledTime: nextTimeString,
      lastRunTime: 'پایش فعال',
      lastRunStatus: 'موفق',
      lastRunCount: 4,
      totalTrackedProducts: 4,
      isAutoSyncEnabled: true,
      environment: 'Cloudflare Pages Edge',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
