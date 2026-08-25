import { Request, Response } from 'express';
import { getBuiltinConcurrency, getQueueTimeoutSeconds, getBuiltinToken } from './config';

export interface QueueItem {
  id: string;
  enqueuedAt: number;
  req: Request;
  res: Response;
  task: () => Promise<void>;
  resolve: () => void;
  reject: (err: any) => void;
  timeoutTimer?: NodeJS.Timeout;
  cleanup?: () => void;
}

export class TokenQueueManager {
  private queues = new Map<string, QueueItem[]>();
  private activeCounts = new Map<string, number>();

  public getConcurrency(tokenKey: string): number {
    const builtinToken = getBuiltinToken();
    if (tokenKey === '__BUILTIN__' || (builtinToken && tokenKey.includes(builtinToken))) {
      return getBuiltinConcurrency();
    }
    // 私有 Token 默认独立调度 (并发限制 2)
    return 2;
  }

  public async enqueue(
    tokenKey: string,
    req: Request,
    res: Response,
    task: () => Promise<void>
  ): Promise<void> {
    const queue = this.queues.get(tokenKey) || [];
    this.queues.set(tokenKey, queue);

    const activeCount = this.activeCounts.get(tokenKey) || 0;
    const maxConcurrency = this.getConcurrency(tokenKey);

    return new Promise<void>((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const timeoutMs = getQueueTimeoutSeconds() * 1000;

      const item: QueueItem = {
        id,
        enqueuedAt: Date.now(),
        req,
        res,
        task,
        resolve,
        reject
      };

      // 设置排队超时定时器
      if (timeoutMs > 0) {
        item.timeoutTimer = setTimeout(() => {
          if (this.removeItem(tokenKey, id)) {
            item.cleanup?.();
            const err: any = new Error(`生图排队等待超时 (${getQueueTimeoutSeconds()}秒)，当前生图任务繁忙，请稍后重试`);
            err.status = 503;
            reject(err);
          }
        }, timeoutMs);
      }

      // 监听客户端真正断开连接 (res socket close 且未写入完毕)
      const onClose = () => {
        if (!res.writableEnded && !res.headersSent && this.removeItem(tokenKey, id)) {
          item.cleanup?.();
          const err: any = new Error('Client closed connection while in queue');
          err.status = 499;
          reject(err);
        }
      };
      res.once('close', onClose);

      item.cleanup = () => {
        if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
        res.removeListener('close', onClose);
      };

      queue.push(item);

      const waitingCount = queue.length;
      const isBuiltin = tokenKey === '__BUILTIN__' || (getBuiltinToken() && tokenKey.includes(getBuiltinToken()));
      if (waitingCount > 1 || activeCount >= maxConcurrency) {
        console.log(`[Queue:${isBuiltin ? 'BUILTIN' : 'USER'}] Task ${id} queued. Waiting in line: ${waitingCount}, Active: ${activeCount}/${maxConcurrency}`);
      }

      this.processNext(tokenKey);
    });
  }

  private removeItem(tokenKey: string, id: string): boolean {
    const queue = this.queues.get(tokenKey);
    if (!queue) return false;
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue.splice(index, 1);
      return true;
    }
    return false;
  }

  private async processNext(tokenKey: string): Promise<void> {
    const queue = this.queues.get(tokenKey);
    if (!queue || queue.length === 0) return;

    const currentActive = this.activeCounts.get(tokenKey) || 0;
    const maxConcurrency = this.getConcurrency(tokenKey);

    if (currentActive >= maxConcurrency) {
      return;
    }

    const item = queue.shift();
    if (!item) return;

    item.cleanup?.();

    // 增加正在执行计数
    this.activeCounts.set(tokenKey, currentActive + 1);

    const waitTime = Date.now() - item.enqueuedAt;
    const isBuiltin = tokenKey === '__BUILTIN__' || (getBuiltinToken() && tokenKey.includes(getBuiltinToken()));
    if (waitTime > 200) {
      console.log(`[Queue:${isBuiltin ? 'BUILTIN' : 'USER'}] Task ${item.id} started execution after ${waitTime}ms wait in queue.`);
    }

    try {
      await item.task();
      item.resolve();
    } catch (err) {
      item.reject(err);
    } finally {
      // 减少正在执行计数并继续出队下一个
      const nextActive = Math.max(0, (this.activeCounts.get(tokenKey) || 1) - 1);
      this.activeCounts.set(tokenKey, nextActive);
      this.processNext(tokenKey);
    }
  }

  public getQueueStatus(tokenKey: string) {
    const queue = this.queues.get(tokenKey) || [];
    const active = this.activeCounts.get(tokenKey) || 0;
    const maxConcurrency = this.getConcurrency(tokenKey);
    return {
      waiting: queue.length,
      active,
      maxConcurrency,
      isBusy: active >= maxConcurrency || queue.length > 0
    };
  }
}

export const generationQueue = new TokenQueueManager();
