// Sync scheduler stub - all scheduling now handled by backend
import { syncConfigService } from './syncConfig';
import { toast } from '@/hooks/use-toast';

class SyncScheduler {
  // Manual sync - triggers backend to sync now
  async syncNow(showToast = true): Promise<void> {
    if (showToast) {
      toast({
        title: 'Sync started',
        description: 'Backend is syncing all enabled resources...',
      });
    }

    try {
      await syncConfigService.syncNow();
      
      if (showToast) {
        toast({
          title: 'Sync initiated',
          description: 'Sync is running in the background. Check sync history for results.',
        });
      }
    } catch (error) {
      if (showToast) {
        toast({
          title: 'Sync failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    }
  }

  // Check if scheduler is running (always true on backend)
  isSchedulerRunning(): boolean {
    return true; // Backend scheduler always runs
  }

  // These methods are no-ops since backend handles scheduling
  start(): void {}
  stop(): void {}
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();
