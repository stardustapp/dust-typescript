import Datadog from './datadog.ts';
type Tags = Record<string, string | number | boolean>;

export class TraceContext {
  constructor(
    public id: string,
  ) {}
  nextTraceNum = 1;

  newTrace(tags: Tags) {
    const traceNum = this.nextTraceNum++;
    const traceId = this.id + '-' + traceNum;
    return new CallTrace(this, traceId, tags);
  }

  submitTrace(trace: CallTrace) {
    // TODO: opt-in method of recording traces

    const baseTime = trace.eventLog[0][0];
    const endTime = trace.eventLog.slice(-1)[0][0];
    const millisDelta = endTime.valueOf()-baseTime.valueOf();

    const traceName = `${trace.eventLog[0][3].name}`;

    // TODO: trace.originalStack has line number
    console.log(`${trace.id}\tTRACE\t${millisDelta}ms\t${traceName}`);
    // for (const [time, id, type, data] of trace.eventLog.slice(1, -1)) {
    //   console.log(`${id}\t${time-baseTime}ms\t${type}\t${JSON.stringify(data)}`);
    // }
    // console.log();

    Datadog.count('app_trace.count', 1, {trace_name: traceName});
    Datadog.gauge('app_trace.millis', millisDelta, {trace_name: traceName});
  }
}

export class CallTrace {
  eventLog: Array<[Date, string, 'start' | 'log' | 'end', Tags]>;
  stepStack: Array<string> | null;
  nextStepNum: number;
  originalStack?: string;

  constructor(
    public context: TraceContext,
    public id: string,
    tags: Tags = {},
  ) {
    this.nextStepNum = 1;
    this.stepStack = new Array; // child steps go FIRST (shift/unshift)
    this.eventLog = new Array;

    this.eventLog.push([new Date, this.id, 'start', tags]);
  }

  startStep(tags: Tags = {}) {
    const stepNum = this.nextStepNum++;
    const stepId = this.id + '-' + stepNum;
    this.stepStack!.unshift(stepId);
    this.eventLog.push([new Date, stepId, 'start', tags]);
  }

  log(tags: Tags = {}) {
    this.eventLog.push([new Date, this.stepStack![0], 'log', tags]);
  }

  endStep(tags: Tags = {}) {
    if (tags) this.log(tags);
    const stepId = this.stepStack!.shift()!;
    this.eventLog.push([new Date, stepId, 'end', {}]);
    //if (this.stepStack.length === 0) this.end();
  }

  /*async*/ end() {
    if (this.stepStack === null)
      throw new Error(`BUG: CallTrace is being double-finalized`);
    if (this.stepStack.length > 0)
      throw new Error(`BUG: CallTrace is being finalized before being completed`);
    this.stepStack = null;

    this.eventLog.push([new Date, this.id, 'end', {}]);
    return this.context.submitTrace(this);
  }
}
