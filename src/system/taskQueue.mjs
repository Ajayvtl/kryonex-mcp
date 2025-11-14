// src/system/taskQueue.mjs
/**
 * Provides:
 * - InMemoryQueue (simple FIFO)
 * - RedisQueue skeleton (uses ioredis if installed)
 *
 * The RedisQueue is optional; this file will not throw if ioredis is missing.
 */

class InMemoryQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  push(job) {
    this.queue.push(job);
    this._drain();
  }

  async _runJob(job) {
    try {
      await job();
    } catch (e) {
      console.error("[InMemoryQueue] job error:", e);
    }
  }

  _drain() {
    if (this.processing) return;
    this.processing = true;
    setImmediate(async () => {
      while (this.queue.length) {
        const job = this.queue.shift();
        await this._runJob(job);
      }
      this.processing = false;
    });
  }

  length() {
    return this.queue.length;
  }
}

// RedisQueue skeleton - optional dependency
let RedisQueue = null;
try {
  const IORedis = await import("ioredis").catch(() => null);
  if (IORedis) {
    RedisQueue = class {
      constructor(redisClient, queueName = "kryonex:tasks") {
        this.redis = redisClient;
        this.queueName = queueName;
      }

      async push(payload) {
        await this.redis.lpush(this.queueName, JSON.stringify(payload));
      }

      async popBlocking(timeout = 0) {
        const res = await this.redis.brpop(this.queueName, timeout);
        if (!res) return null;
        return JSON.parse(res[1]);
      }
    };
  }
} catch (e) {
  // ignore - redis optional
  RedisQueue = null;
}

export { InMemoryQueue, RedisQueue };
