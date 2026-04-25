import type { Adapter, CanonicalEvent } from '@leclabs/agentir-core';
import pc from 'picocolors';

const ALL_EVENTS: CanonicalEvent[] = [
  'session.start',
  'session.resume',
  'session.end',
  'prompt.submit',
  'turn.end',
  'turn.fail',
  'agent.idle',
  'model.request.pre',
  'model.response.post',
  'tool.use.pre',
  'tool.use.post',
  'tool.use.fail',
  'file.edit.post',
  'file.read.pre',
  'file.change.external',
  'shell.exec.pre',
  'shell.exec.post',
  'mcp.exec.pre',
  'mcp.exec.post',
  'subagent.start',
  'subagent.end',
  'permission.request',
  'permission.deny',
  'notification',
  'context.compact.pre',
  'context.compact.post',
  'config.changed',
  'instructions.loaded',
];

export interface EventsListOpts {
  client?: string;
}

export async function runEventsList(opts: EventsListOpts, adapters: Adapter[]): Promise<number> {
  if (!opts.client) {
    console.log(pc.bold('Canonical event taxonomy:'));
    for (const e of ALL_EVENTS) console.log(`  ${e}`);
    return 0;
  }
  const adapter = adapters.find((a) => a.id === opts.client);
  if (!adapter) {
    console.error(pc.red(`unknown client '${opts.client}'`));
    return 1;
  }
  const map = adapter.eventMap ?? {};
  console.log(pc.bold(`${opts.client} event mappings (canonical → native):`));
  let supported = 0;
  for (const e of ALL_EVENTS) {
    const native = map[e];
    if (native) {
      console.log(`  ${pc.green('✓')} ${e.padEnd(24)} → ${native}`);
      supported++;
    } else {
      console.log(`  ${pc.gray('—')} ${e.padEnd(24)} ${pc.gray('(no native equivalent)')}`);
    }
  }
  console.log('');
  console.log(`${supported}/${ALL_EVENTS.length} canonical events supported by ${opts.client}`);
  return 0;
}
