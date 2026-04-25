import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { defaultIRRoot, type Manifest, type Scope } from '@leclabs/agentir-core';
import pc from 'picocolors';

export interface InitOpts {
  scope?: Scope;
  cwd?: string;
}

export async function runInit(opts: InitOpts = {}): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();
  const root = defaultIRRoot(scope, cwd);

  if (existsSync(root)) {
    console.error(pc.red(`agentir: ${root} already exists`));
    return 1;
  }

  await mkdir(root, { recursive: true });
  for (const sub of ['rules', 'skills', 'commands', 'agents', 'hooks', 'mcp']) {
    await mkdir(join(root, sub), { recursive: true });
  }

  const manifest: Manifest = { agentir: 1, scope, targets: [] };
  await writeFile(
    join(root, 'manifest.yaml'),
    dump(manifest, { lineWidth: 100, noRefs: true }),
    'utf8',
  );

  // For project scope, append .agentir/local to .gitignore if it exists.
  if (scope === 'project') {
    const gi = join(cwd, '.gitignore');
    if (existsSync(gi)) {
      const text = await readFile(gi, 'utf8');
      if (!text.includes('.agentir/local')) {
        await writeFile(
          gi,
          text + (text.endsWith('\n') ? '' : '\n') + '.agentir/local/\n',
          'utf8',
        );
      }
    }
  }

  console.log(pc.green('✓'), `initialized ${root}`);
  return 0;
}
