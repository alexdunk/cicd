import { randomBytes } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashToken, type Scope } from '../src/domain/client.ts';

/**
 * Provisions a CI client credential (npm run create-client).
 *
 *   npm run create-client -- --client-id ci-orders --scopes upload,deploy \
 *     --functions deploy-target-orders [--write]
 *
 * Prints the raw bearer token ONCE plus the DynamoDB item. With --write (and
 * TABLE_NAME + AWS credentials in the environment) it also writes the item.
 * Only the SHA-256 hash is ever stored.
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const clientId = arg('client-id');
const scopes = (arg('scopes') ?? '').split(',').filter(Boolean) as Scope[];
const functions = (arg('functions') ?? '').split(',').filter(Boolean);
const write = process.argv.includes('--write');

if (!clientId || scopes.length === 0 || scopes.some((s) => s !== 'upload' && s !== 'deploy')) {
  console.error(
    'Usage: npm run create-client -- --client-id <id> --scopes upload,deploy [--functions fn1,fn2] [--write]',
  );
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const tokenHash = hashToken(token);
const item = {
  pk: `CLIENT#${tokenHash}`,
  sk: 'META',
  clientId,
  scopes,
  allowedFunctions: functions,
  createdAt: new Date().toISOString(),
};

console.log('Bearer token (store securely; it is shown only once):');
console.log(`  ${token}`);
console.log('\nDynamoDB item:');
console.log(JSON.stringify(item, null, 2));

if (write) {
  const tableName = process.env['TABLE_NAME'];
  if (!tableName) {
    console.error('\n--write requires TABLE_NAME in the environment (see stack output TableName).');
    process.exit(1);
  }
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await doc.send(new PutCommand({ TableName: tableName, Item: item }));
  console.log(`\nWrote client ${clientId} to ${tableName}.`);
}
