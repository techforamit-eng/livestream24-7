export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initAutomationScheduler } = await import('@/lib/scheduler');
    initAutomationScheduler();
  }
}
