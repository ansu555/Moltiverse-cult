import { createLogger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";

const log = createLogger("TxQueue");

interface QueuedTx {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retries: number;
}

export class TransactionQueue {
  private queue: QueuedTx[] = [];
  private processing = false;
  private maxRetries = 3;
  private retryDelay = 2000;

  async enqueue<T>(id: string, execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, execute, resolve, reject, retries: 0 });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const tx = this.queue.shift()!;
      try {
        log.info(`⏳ Executing tx: ${tx.id}`);
        const result = await tx.execute();
        log.ok(`✅ Tx ${tx.id} succeeded`);
        tx.resolve(result);
      } catch (error: any) {
        if (tx.retries < this.maxRetries) {
          tx.retries++;
          const wait = this.retryDelay * tx.retries;
          log.warn(`Tx ${tx.id} failed (attempt ${tx.retries}/${this.maxRetries}), retrying in ${wait / 1000}s... — ${error.message}`);
          this.queue.unshift(tx);
          await sleep(wait);
        } else {
          log.errorWithContext(`Tx ${tx.id} failed permanently after ${this.maxRetries} retries`, error);
          tx.reject(error);
        }
      }
    }

    this.processing = false;
  }
}
