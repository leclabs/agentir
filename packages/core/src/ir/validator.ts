import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  agentSchema,
  commandSchema,
  envSchema,
  hookSchema,
  irSchema,
  manifestSchema,
  mcpServerSchema,
  permissionsSchema,
  ruleSchema,
  skillSchema,
} from './schemas.js';
import type {
  Agent,
  Command,
  EnvVars,
  Hook,
  IR,
  Manifest,
  McpServer,
  Permissions,
  Rule,
  Skill,
} from './generated.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// Register sub-schemas first so $refs in irSchema resolve.
ajv.addSchema(manifestSchema);
ajv.addSchema(ruleSchema);
ajv.addSchema(skillSchema);
ajv.addSchema(commandSchema);
ajv.addSchema(agentSchema);
ajv.addSchema(hookSchema);
ajv.addSchema(mcpServerSchema);
ajv.addSchema(permissionsSchema);
ajv.addSchema(envSchema);

export const validateIR = ajv.compile<IR>(irSchema);
export const validateManifest = ajv.getSchema<Manifest>(manifestSchema.$id)!;
export const validateRule = ajv.getSchema<Rule>(ruleSchema.$id)!;
export const validateSkill = ajv.getSchema<Skill>(skillSchema.$id)!;
export const validateCommand = ajv.getSchema<Command>(commandSchema.$id)!;
export const validateAgent = ajv.getSchema<Agent>(agentSchema.$id)!;
export const validateHook = ajv.getSchema<Hook>(hookSchema.$id)!;
export const validateMcpServer = ajv.getSchema<McpServer>(mcpServerSchema.$id)!;
export const validatePermissions = ajv.getSchema<Permissions>(permissionsSchema.$id)!;
export const validateEnv = ajv.getSchema<EnvVars>(envSchema.$id)!;

export { ajv };

export type ValidationError = {
  path: string;
  message: string;
  keyword: string;
};

export function formatErrors(
  errors: ValidateFunction['errors'],
): ValidationError[] {
  if (!errors) return [];
  return errors.map((e: ErrorObject) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'invalid',
    keyword: e.keyword,
  }));
}
