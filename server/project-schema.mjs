import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

export const projectSchemaPath = new URL(
  '../schemas/quiz-project.schema.json',
  import.meta.url,
);
export const projectSchema = JSON.parse(
  readFileSync(projectSchemaPath, 'utf8'),
);

const validate = new Ajv({ allErrors: true }).compile(projectSchema);

const validateLegacy = new Ajv({ allErrors: true }).compile(
  JSON.parse(
    readFileSync(
      new URL('../schemas/quiz-project-v2.schema.json', import.meta.url),
      'utf8',
    ),
  ),
);
export function validateProject(project) {
  const check = project.version === 2 ? validateLegacy : validate;
  if (check(project)) return;
  const errors = check.errors
    .slice(0, 3)
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
  throw new Error(`Projektets JSON följer inte schemat: ${errors}.`);
}
