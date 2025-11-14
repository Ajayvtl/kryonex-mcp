// src/system/taskQueue.mjs
class InMemoryQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  push(job) {
    this.queue.push(job);
    this._drain();
  }

  _drain() {
    if (this.processing) return;
    this.processing = true;
    setImmediate(async () => {
      while (this.queue.length) {
        const j = this.queue.shift();
        try { await j(); } catch (e) { console.error("job error", e); }
      }
      this.processing = false;
    });
  }

  async length() { return this.queue.length; }
}

// Redis adapter skeleton (requires ioredis)
class RedisQueue {
  constructor(redisClient, queueName = "kryonex:tasks") {
    this.redis = redisClient;
    this.queueName = queueName;
  }

  async push(payload) {
    // push serialized job to Redis list
    await this.redis.lpush(this.queueName, JSON.stringify(payload));
  }

  // consumer must pop jobs and process
  async popBlocking(timeout = 0) {
    const res = await this.redis.brpop(this.queueName, timeout);
    if (!res) return null;
    const payload = JSON.parse(res[1]);
    return payload;
  }
}

export { InMemoryQueue, RedisQueue };
