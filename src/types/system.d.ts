// Forward declarations of classes to be used as types
declare class EventBus {
  constructor(opts?: { db?: any; semanticStore?: any });
  emitPersisted(name: string, payload?: any): Promise<void>;
  emit(name: string, payload?: any): boolean;
  on(event: string, listener: (...args: any[]) => void): this;
}

declare class TaskManager {
  constructor(opts?: { db?: any; eventBus?: EventBus });
  loadFromDb(): Promise<void>;
  createTask(opts?: any): Promise<any>;
  updateTask(task: any): Promise<any>;
  getTask(id: string): any;
  listTasks(): any[];
  addStep(taskId: string, step?: any): Promise<any>;
  startStep(taskId: string, stepId: string): Promise<any>;
  completeStep(taskId: string, stepId: string, result?: any): Promise<any>;
  failStep(taskId: string, stepId: string, error?: any): Promise<any>;
  completeTask(id: string, result?: any): Promise<any>;
  failTask(id: string, error?: any): Promise<any>;
}

declare class WorkflowEngine {
  constructor(opts?: {
    taskManager?: TaskManager;
    eventBus?: EventBus;
    db?: any;
    concurrency?: number;
  });
  registerTask(task: any): any;
  addDependency(taskId: string, dependsOn: string): void;
  scheduleTask(
    taskId: string,
    fn: () => Promise<any>,
    opts?: { dependsOn?: string[]; retries?: number; timeoutMs?: number }
  ): Promise<any>;
  runGraph(rootTaskId: string, steps: Array<any>, opts?: any): Promise<any>;
}

declare class ToolRunner {
  constructor(opts?: {
    taskManager?: TaskManager;
    eventBus?: EventBus;
    db?: any;
    semanticStore?: any;
    validator?: any;
    rectifier?: any;
  });
  call(
    toolHandlers: Record<string, Function>,
    toolName: string,
    args?: any,
    context?: any,
    options?: any
  ): Promise<any>;
}

// Module declarations
declare module "./system/eventBus.mjs" {
  export default EventBus;
}

declare module "./system/taskManager.mjs" {
  export default TaskManager;
}

declare module "./system/workflowEngine.mjs" {
  export default WorkflowEngine;
}

declare module "./system/taskQueue.mjs" {
  export class InMemoryQueue {
    constructor();
    push(job: () => Promise<any>): void;
    length(): number;
  }
  export class RedisQueue {
    constructor(redisClient: any, queueName?: string);
    push(payload: any): Promise<void>;
    popBlocking(timeout?: number): Promise<any>;
  }
}

declare module "./system/toolRunner.mjs" {
  export default ToolRunner;
}

declare module "./system/validator.mjs" {
  export default function createValidator(opts?: { ollamaTool?: any }): {
    validateToolCall({ toolName, args, context }?: {}): Promise<any>;
  };
}

declare module "./system/rectifier.mjs" {
  export default function createRectifier(opts?: { ollamaTool?: any }): {
    rectify({ toolName, args, context, reason }?: {}): Promise<any>;
  };
}

declare module "./agents/plannerAgent.mjs" {
  export default function createPlannerAgent(opts?: {
    ollamaTool?: any;
    workflowEngine?: WorkflowEngine;
    toolRunner?: ToolRunner;
    taskManager?: TaskManager;
    eventBus?: EventBus;
  }): any;
}

declare module "./agents/investigatorAgent.mjs" {
  export default function createInvestigatorAgent(opts?: {
    toolRunner?: ToolRunner;
    taskManager?: TaskManager;
    eventBus?: EventBus;
  }): any;
}

declare module "./agents/rectifierAgent.mjs" {
  export default function createRectifierAgent(opts?: { rectifier?: any }): any;
}
