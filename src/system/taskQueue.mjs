class InMemoryQueue {
  constructor() { this.queue = []; this.processing = false; }
  push(job) { this.queue.push(job); this._drain(); }
  async _run(job) { try { await job(); } catch (e) { console.error("[InMemoryQueue] job error", e); } }
  _drain() {
    if (this.processing) return;
    this.processing = true;
    setImmediate(async () => {
      while (this.queue.length) {
        const j = this.queue.shift();
        await this._run(j);
      }
      this.processing = false;
    });
  }
  length() { return this.queue.length; }
}

let RedisQueue = null;
try {
  const ioredis = await import("ioredis").catch(() => null);
  if (ioredis) {
    RedisQueue = class {
      constructor(redisClient, queueName = "kryonex:tasks") { this.redis = redisClient; this.queueName = queueName; }
      async push(payload) { await this.redis.lpush(this.queueName, JSON.stringify(payload)); }
      async popBlocking(timeout = 0) { const res = await this.redis.brpop(this.queueName, timeout); if (!res) return null; return JSON.parse(res[1]); }
    };
  }
} catch (e) { RedisQueue = null; }

export { InMemoryQueue, RedisQueue };
