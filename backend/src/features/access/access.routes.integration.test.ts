// src/features/access/access.routes.integration.test.ts

/**
 * Roles and permissions end to end: the real route handlers, the real permission gate and
 * the real role rules on a real Postgres (PGlite, all migrations). Only the session (who
 * signed in) is stubbed, as Auth.js would hand it over.
 *
 * Plays each kind of caller: each default role, a custom user manager trying to rise above
 * their own role, a user changed or deactivated after signing in, a user editing their own
 * account, and the public routes that also accept a dashboard session or an ingestion key.
 */

import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_ROLE_ID, ALL_PERMISSIONS, REQUIRED_WITH, roleRefusal, type Permission } from './permissions';
import * as rolesRepository from './roles.repository';
import { updateUserAccess } from './roles.repository';



import * as setupDemoRoute from '@/app/api/admin/setup-demo/route';
import * as aiExperiencesRoute from '@/app/api/ai-experiences/route';
import * as providersRoute from '@/app/api/ai-providers/route';
import * as aiTextRoute from '@/app/api/ai-service/text/route';
import * as analyticsExperiencesRoute from '@/app/api/analytics/experiences/route';
import * as meRoute from '@/app/api/me/access/route';
import * as roleRoute from '@/app/api/roles/[id]/route';
import * as rolesRoute from '@/app/api/roles/route';
import * as docRoute from '@/app/api/search-indexes/[id]/documents/[documentId]/route';
import * as batchRoute from '@/app/api/search-indexes/[id]/documents/batches/[batchId]/route';
import * as batchesRoute from '@/app/api/search-indexes/[id]/documents/batches/route';
import * as bulkRoute from '@/app/api/search-indexes/[id]/documents/bulk/route';
import * as deleteByFilterRoute from '@/app/api/search-indexes/[id]/documents/delete-by-filter/route';
import { aiExperiences } from '@/db/schema/ai-experience.schema';
import { aiProviders } from '@/db/schema/ai-providers.schema';
import { dataSources } from '@/db/schema/data-sources.schema';
import { mcpConnections } from '@/db/schema/mcp-connections.schema';
import { roles } from '@/db/schema/roles.schema';
import { user } from '@/db/schema/users.schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
let session: { user: { id: string } } | null = null;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => session }));
// The real user and role lookups, counted (to check a save looks each up once)
vi.mock('@/features/auth/auth.repository', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/auth/auth.repository')>();
  return { ...real, getUserById: vi.fn(real.getUserById), getUserByEmail: vi.fn(real.getUserByEmail) };
});
vi.mock('@/features/access/roles.repository', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/access/roles.repository')>();
  return { ...real, getRole: vi.fn(real.getRole) };
});

import * as usersRoute from '@/app/api/users/route';
import * as userRoute from '@/app/api/users/[id]/route';
import * as deactivateRoute from '@/app/api/users/[id]/deactivate/route';
import * as activateRoute from '@/app/api/users/[id]/activate/route';
import * as toolsRoute from '@/app/api/tools/route';
import * as toolRoute from '@/app/api/tools/[id]/route';
import * as mcpRoute from '@/app/api/mcp-connections/route';
import * as mcpOneRoute from '@/app/api/mcp-connections/[id]/route';
import * as dataSourcesRoute from '@/app/api/data-sources/route';
import * as dataSourceRoute from '@/app/api/data-sources/[id]/route';
import * as passwordRoute from '@/app/api/users/[id]/change-password/route';
import * as secretsRoute from '@/app/api/secrets/route';
import * as searchExperiencesRoute from '@/app/api/search-experiences/route';
import * as scaffoldRoute from '@/app/api/tools/scaffold/route';
import * as kbDocRoute from '@/app/api/knowledge-base/[id]/route';
import { knowledgeDocuments } from '@/db/schema/knowledge-base.schema';
import * as allIndexesRoute from '@/app/api/search-indexes/all/route';
import * as promptTemplatesRoute from '@/app/api/prompt-templates/route';
import * as promptDefaultsRoute from '@/app/api/prompt-templates/defaults/route';
import * as allToolsRoute from '@/app/api/tools/all/route';
import * as indexesRoute from '@/app/api/search-indexes/route';
import * as attachmentsRoute from '@/app/api/ai-experiences/[id]/mcp-connections/route';
import * as exportRoute from '@/app/api/search-indexes/[id]/export/route';
import * as promptTemplateRoute from '@/app/api/prompt-templates/[id]/route';
import * as promptHistoryRoute from '@/app/api/prompt-templates/[id]/history/route';
import * as knowledgeBaseRoute from '@/app/api/knowledge-base/route';
import * as documentsRoute from '@/app/api/search-indexes/[id]/documents/route';
import * as authRepository from '@/features/auth/auth.repository';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { findSecretReferences } from '@/features/secrets/secrets.repository';


const EDITOR = '00000000-0000-4000-8000-000000000002';
const VIEWER = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

let n = 0;
async function makeUser(roleId: string, isActive = true): Promise<string> {
  const [row] = await testDb.db.insert(user).values({ email: `u${++n}@x.test`, roleId, isActive, firstName: 'First' }).returning();
  return row.id;
}
async function makeRole(name: string, permissions: string[]): Promise<string> {
  const [row] = await testDb.db.insert(roles).values({ name, permissions }).returning();
  return row.id;
}
const as = (userId: string | null) => { session = userId ? { user: { id: userId } } : null; };

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(fn: unknown, method: string, url: string, body?: unknown, params: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const res = await (fn as Route)(req, { params: Promise.resolve(params) });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
const getUser = async (id: string) => (await testDb.db.select().from(user).where(eq(user.id, id)))[0];

let admin: string, editor: string, viewer: string;
beforeEach(async () => {
  admin = await makeUser(ADMIN_ROLE_ID);
  editor = await makeUser(EDITOR);
  viewer = await makeUser(VIEWER);
});

describe('the session reflects the database on every request', () => {
  it('locks out a user deactivated after signing in, on their next request', async () => {
    as(editor);
    expect((await call(meRoute.GET, 'GET', '/api/me/access')).status).toBe(200);
    await testDb.db.update(user).set({ isActive: false }).where(eq(user.id, editor));
    expect((await call(meRoute.GET, 'GET', '/api/me/access')).status).toBe(401);
    expect((await call(searchExperiencesRoute.GET, 'GET', '/api/search-experiences')).status).toBe(401);
  });

  it('applies a demotion on the next request', async () => {
    as(editor);
    // An Editor passes the gate (an empty body is then refused by validation, not by access)
    expect((await call(searchExperiencesRoute.POST, 'POST', '/api/search-experiences', {})).status).toBe(400);
    await testDb.db.update(user).set({ roleId: VIEWER }).where(eq(user.id, editor));
    expect((await call(searchExperiencesRoute.POST, 'POST', '/api/search-experiences', {})).status).toBe(403);
  });

  it('applies a role edit to everyone holding it, on their next request', async () => {
    const role = await makeRole('Indexers', ['search-experiences:view']);
    const u = await makeUser(role);
    as(u);
    expect((await call(searchExperiencesRoute.GET, 'GET', '/api/search-experiences')).status).toBe(200);
    as(admin);
    expect((await call(roleRoute.PUT, 'PUT', `/api/roles/${role}`, { permissions: [] }, { id: role })).status).toBe(200);
    as(u);
    expect((await call(searchExperiencesRoute.GET, 'GET', '/api/search-experiences')).status).toBe(403);
  });

  it('answers 401 to a session whose user no longer exists', async () => {
    as('00000000-0000-4000-8000-0000000000ff');
    expect((await call(meRoute.GET, 'GET', '/api/me/access')).status).toBe(401);
  });

  it('ignores a permission name stored on a role that the code does not know', async () => {
    const role = await makeRole('Odd', ['secrets:manage-all', 'search-experiences:view']);
    as(await makeUser(role));
    const me = await call(meRoute.GET, 'GET', '/api/me/access');
    expect((me.body?.data as { permissions: string[] }).permissions).toEqual(['search-experiences:view']);
  });
});

describe('the default roles', () => {
  it('lets a Viewer read but not change, spend tokens, or reach secrets and users', async () => {
    as(viewer);
    expect((await call(searchExperiencesRoute.GET, 'GET', '/api/search-experiences')).status).toBe(200);
    expect((await call(searchExperiencesRoute.POST, 'POST', '/api/search-experiences', {})).status).toBe(403);
    expect((await call(aiTextRoute.POST, 'POST', '/api/ai-service/text', { prompt: 'hi' })).status).toBe(403);
    expect((await call(secretsRoute.GET, 'GET', '/api/secrets')).status).toBe(403);
    expect((await call(usersRoute.GET, 'GET', '/api/users')).status).toBe(403);
    expect((await call(providersRoute.GET, 'GET', '/api/ai-providers')).status).toBe(403);
  });

  it('keeps an Editor away from secrets, users and changing AI providers', async () => {
    as(editor);
    expect((await call(secretsRoute.GET, 'GET', '/api/secrets')).status).toBe(403);
    expect((await call(usersRoute.GET, 'GET', '/api/users')).status).toBe(403);
    expect((await call(rolesRoute.GET, 'GET', '/api/roles')).status).toBe(403);
    expect((await call(providersRoute.POST, 'POST', '/api/ai-providers', {})).status).toBe(403);
  });

  it('never sends an AI provider key to a role that may view providers', async () => {
    await testDb.db.insert(aiProviders).values({
      providerKey: `p${n}`, displayName: 'P', providerType: 'cloud', authType: 'api_key',
      baseUrl: 'https://example.test', apiKey: 'sk-very-secret-key',
    });
    as(editor);
    const res = await call(providersRoute.GET, 'GET', '/api/ai-providers');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('sk-very-secret-key');
  });
});

describe('nobody gives more than they hold', () => {
  let manager: string, managerRole: string;
  beforeEach(async () => {
    managerRole = await makeRole(`Managers ${n}`, ['users:manage', 'search-experiences:view']);
    manager = await makeUser(managerRole);
    as(manager);
  });

  const newUser = (roleId: string) => ({ email: `new${++n}@x.test`, password: 'Passw0rd-long', roleId });

  it('refuses a user manager creating an Admin or a role-holder above themselves', async () => {
    const admins = await call(usersRoute.POST, 'POST', '/api/users', newUser(ADMIN_ROLE_ID));
    expect(admins.status).toBe(403);
    expect(admins.body?.message).toBe('Only an Admin can give the Admin role.');
    const above = await call(usersRoute.POST, 'POST', '/api/users', newUser(EDITOR));
    expect(above.status).toBe(403);
    expect(above.body?.message).toBe("You can't give a role with permissions your own role doesn't have.");
    expect((await call(usersRoute.POST, 'POST', '/api/users', newUser(managerRole))).status).toBe(201);
  });

  it('refuses promoting someone to a role above the manager, or to Admin', async () => {
    const target = await makeUser(managerRole);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${target}`, { roleId: EDITOR }, { id: target })).status).toBe(403);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${target}`, { roleId: ADMIN_ROLE_ID }, { id: target })).status).toBe(403);
    expect((await getUser(target)).roleId).toBe(managerRole);
  });

  it('lets a user manager give a role within their own, and refuses managing a user whose role is above it', async () => {
    const lower = await makeRole(`Lower ${n}`, ['search-experiences:view']);
    const target = await makeUser(managerRole);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${target}`, { roleId: lower }, { id: target })).status).toBe(200);
    expect((await getUser(target)).roleId).toBe(lower);
    const editorUser = await makeUser(EDITOR);
    const refused = await call(userRoute.PUT, 'PUT', `/api/users/${editorUser}`, { firstName: 'Ed' }, { id: editorUser });
    expect(refused.status).toBe(403);
    // The same sentence the Users page shows on that row (permissions.ts roleRefusal)
    expect(refused.body?.message).toBe(roleRefusal('manage', { isBuiltIn: false }));
    expect(refused.body?.message).toBe("You can't manage a user whose role has permissions your own role doesn't have.");
    expect((await call(deactivateRoute.PATCH, 'PATCH', `/api/users/${editorUser}/deactivate`, undefined, { id: editorUser })).status).toBe(403);
  });

  it('still refuses a user manager changing their own role', async () => {
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${manager}`, { roleId: EDITOR }, { id: manager })).status).toBe(403);
    expect((await getUser(manager)).roleId).toBe(managerRole);
  });

  it('refuses a user manager who is not an Admin creating, changing or deleting any role, even one below them', async () => {
    const lesser = await makeRole(`Lesser ${n}`, ['search-experiences:view']);
    expect((await call(rolesRoute.POST, 'POST', '/api/roles', { name: 'Sneaky', permissions: ['secrets:manage'] })).status).toBe(403);
    expect((await call(rolesRoute.POST, 'POST', '/api/roles', { name: `Lesser2 ${n}`, permissions: ['search-experiences:view'] })).status).toBe(403);
    expect((await call(roleRoute.PUT, 'PUT', `/api/roles/${managerRole}`, { description: 'Mine' }, { id: managerRole })).status).toBe(403);
    expect((await call(roleRoute.PUT, 'PUT', `/api/roles/${lesser}`, { permissions: [] }, { id: lesser })).status).toBe(403);
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${lesser}`, undefined, { id: lesser })).status).toBe(403);
    // Reading the roles, to assign them, stays with user managers
    expect((await call(rolesRoute.GET, 'GET', '/api/roles')).status).toBe(200);
    expect((await rolesRepository.getRole(lesser))?.permissions).toEqual(['search-experiences:view']);
  });

  it('refuses managing an Admin: profile, password, deactivation', async () => {
    expect((await call(userRoute.GET, 'GET', `/api/users/${admin}`, undefined, { id: admin })).status).toBe(403);
    const owned = await call(userRoute.PUT, 'PUT', `/api/users/${admin}`, { firstName: 'Owned' }, { id: admin });
    expect(owned.status).toBe(403);
    expect(owned.body?.message).toBe('Only an Admin can manage a user with the Admin role.');
    expect((await call(passwordRoute.POST, 'POST', `/api/users/${admin}/change-password`, { currentPassword: 'x', newPassword: 'Passw0rd-long', confirmPassword: 'Passw0rd-long' }, { id: admin })).status).toBe(403);
    expect((await call(deactivateRoute.PATCH, 'PATCH', `/api/users/${admin}/deactivate`, undefined, { id: admin })).status).toBe(403);
    expect((await getUser(admin))).toMatchObject({ firstName: 'First', isActive: true });
  });
});

describe('a user on their own account', () => {
  it('can change their own name, and sending their current role back is not a role change', async () => {
    as(viewer);
    const res = await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { firstName: 'Renamed', roleId: VIEWER, isActive: true }, { id: viewer });
    expect(res.status).toBe(200);
    expect((await getUser(viewer)).firstName).toBe('Renamed');
  });

  it('cannot raise their own role or reactivate, and a refused change writes nothing', async () => {
    as(viewer);
    const res = await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { firstName: 'Sneaky', roleId: ADMIN_ROLE_ID }, { id: viewer });
    expect(res.status).toBe(403);
    expect(await getUser(viewer)).toMatchObject({ roleId: VIEWER, firstName: 'First' });
  });

  it('cannot read or change another user without users:manage, even one with the same role', async () => {
    const otherViewer = await makeUser(VIEWER);
    as(viewer);
    expect((await call(userRoute.GET, 'GET', `/api/users/${otherViewer}`, undefined, { id: otherViewer })).status).toBe(403);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${otherViewer}`, { firstName: 'X' }, { id: otherViewer })).status).toBe(403);
    expect((await call(passwordRoute.POST, 'POST', `/api/users/${otherViewer}/change-password`, { currentPassword: 'x', newPassword: 'Passw0rd-long', confirmPassword: 'Passw0rd-long' }, { id: otherViewer })).status).toBe(403);
    expect((await getUser(otherViewer)).firstName).toBe('First');
    expect((await call(userRoute.GET, 'GET', `/api/users/${editor}`, undefined, { id: editor })).status).toBe(403);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${editor}`, { firstName: 'X' }, { id: editor })).status).toBe(403);
  });

  it('keeps even an Admin from demoting or deactivating themselves', async () => {
    as(admin);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${admin}`, { roleId: VIEWER }, { id: admin })).status).toBe(403);
    expect((await call(deactivateRoute.PATCH, 'PATCH', `/api/users/${admin}/deactivate`, undefined, { id: admin })).status).toBe(403);
  });
});

describe('the Admin role and the last Admin', () => {
  it('lets an Admin manage other Admins and assign any role', async () => {
    const other = await makeUser(ADMIN_ROLE_ID);
    as(admin);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${other}`, { roleId: EDITOR }, { id: other })).status).toBe(200);
    expect((await getUser(other)).roleId).toBe(EDITOR);
  });

  it('refuses a change that would leave no active Admin', async () => {
    await testDb.db.update(user).set({ isActive: false }).where(eq(user.roleId, ADMIN_ROLE_ID));
    const last = await makeUser(ADMIN_ROLE_ID);
    await expect(updateUserAccess(last, { roleId: EDITOR })).rejects.toMatchObject({ status: 409 });
    await expect(updateUserAccess(last, { isActive: false })).rejects.toMatchObject({ status: 409 });
    expect((await getUser(last))).toMatchObject({ roleId: ADMIN_ROLE_ID, isActive: true });
    const second = await makeUser(ADMIN_ROLE_ID);
    await expect(updateUserAccess(last, { roleId: EDITOR })).resolves.toBe(true);
    expect((await getUser(second)).roleId).toBe(ADMIN_ROLE_ID);
  });

  it('refuses editing or deleting the built-in Admin role', async () => {
    as(admin);
    expect((await call(roleRoute.PUT, 'PUT', `/api/roles/${ADMIN_ROLE_ID}`, { name: 'Mine' }, { id: ADMIN_ROLE_ID })).status).toBe(403);
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${ADMIN_ROLE_ID}`, undefined, { id: ADMIN_ROLE_ID })).status).toBe(403);
  });

  it('refuses deleting a role in use, deletes one that is not', async () => {
    as(admin);
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${VIEWER}`, undefined, { id: VIEWER })).status).toBe(409);
    const unused = await makeRole(`Unused ${n}`, []);
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${unused}`, undefined, { id: unused })).status).toBe(200);
  });

  it('rejects unknown permissions and duplicate names', async () => {
    as(admin);
    expect((await call(rolesRoute.POST, 'POST', '/api/roles', { name: `Bad ${n}`, permissions: ['everything'] })).status).toBe(400);
    expect((await call(rolesRoute.POST, 'POST', '/api/roles', { name: 'Viewer', permissions: [] })).status).toBe(409);
    expect((await call(rolesRoute.POST, 'POST', '/api/roles', { name: `Made ${n}`, permissions: ['tools:view'] })).status).toBe(201);
  });
});

describe('routes that also take a dashboard session or an ingestion key', () => {
  const experience = { scope: 'search:e1', accessToken: 'the-token', policy: { allowedOrigins: [], rateLimit: null } } as never;
  const req = () => new NextRequest('http://localhost/api/v1/search/e1/search', { method: 'POST' });

  it('lets a dashboard session use a public experience route only with playground:use', async () => {
    as(viewer);
    const refused = await authenticateTokenOrSession(req(), experience);
    expect(refused.caller).toBeNull();
    expect(refused.refused?.status).toBe(403);
    as(editor);
    expect((await authenticateTokenOrSession(req(), experience)).caller).toBe('admin');
  });

  it('checks an ingestion key on the document routes itself, and a session without one by role', async () => {
    as(null);
    const index = '00000000-0000-4000-8000-0000000000aa';
    const withBadKey = await call(documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, undefined, { id: index }, { Authorization: 'Bearer not-a-key' });
    expect(withBadKey.status).toBe(401);
    expect(withBadKey.body).toMatchObject({ message: expect.stringMatching(/ingestion key/i) });
    as(await makeUser(await makeRole(`NoIndexes ${n}`, [])));
    // With a key, the key decides, not the role of a session that happens to be there
    const keyWithSession = await call(documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, undefined, { id: index }, { Authorization: 'Bearer not-a-key' });
    expect(keyWithSession).toMatchObject({ status: 401, body: { message: expect.stringMatching(/ingestion key/i) } });
    expect((await call(documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, undefined, { id: index })).status).toBe(403);
  });
});

describe('reactivating a user', () => {
  it('lets a user manager reactivate someone, and refuses a role without users:manage', async () => {
    const away = await makeUser(VIEWER, false);
    as(viewer);
    expect((await call(activateRoute.PATCH, 'PATCH', `/api/users/${away}/activate`, undefined, { id: away })).status).toBe(403);
    expect((await getUser(away)).isActive).toBe(false);
    as(admin);
    expect((await call(activateRoute.PATCH, 'PATCH', `/api/users/${away}/activate`, undefined, { id: away })).status).toBe(200);
    expect((await getUser(away)).isActive).toBe(true);
  });
});

describe('configs that send a vault secret need secrets:manage', () => {
  const httpTool = (slug: string, authentication?: Record<string, string>) => ({
    name: slug, slug, aiDescription: 'Looks things up over HTTP', executorType: 'http',
    executorConfig: { baseUrl: 'https://api.example.test/x', method: 'GET', responseMapping: { resultsPath: '$.r' }, ...(authentication && { authentication }) },
  });
  const leak = { type: 'header', key: 'X-Leak', valueRef: 'prod_es_key' };

  it('refuses an Editor creating a tool that sends a secret, allows one that does not', async () => {
    as(editor);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', httpTool(`leak-${n}`, leak))).status).toBe(403);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', httpTool(`plain-${n}`))).status).toBe(201);
  });

  it('refuses an Editor changing any part of a tool that already sends a secret (its host, say)', async () => {
    as(admin);
    const created = await call(toolsRoute.POST, 'POST', '/api/tools', httpTool(`admin-${n}`, leak));
    expect(created.status).toBe(201);
    const id = (created.body?.data as { id: string }).id;
    as(editor);
    // The new config doesn't mention the secret; the stored one does, and the executor would keep using it
    const redirect = { executorConfig: { baseUrl: 'https://attacker.example/c', method: 'GET' } };
    expect((await call(toolRoute.PUT, 'PUT', `/api/tools/${id}`, redirect, { id })).status).toBe(403);
    as(admin);
    expect((await call(toolRoute.PUT, 'PUT', `/api/tools/${id}`, { name: 'Renamed' }, { id })).status).toBe(200);
  });

  it('refuses a {{secret:name}} template anywhere in a tool config', async () => {
    as(editor);
    const tool = httpTool(`tmpl-${n}`);
    (tool.executorConfig as Record<string, unknown>).headers = { Authorization: 'Bearer {{secret:prod_es_key}}' };
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', tool)).status).toBe(403);
  });

  it('refuses an Editor creating an MCP connection that sends a secret', async () => {
    as(editor);
    const body = { name: 'Remote', slug: `remote-${n}`, serverUrl: 'http://127.0.0.1:9/mcp', authConfig: { type: 'bearer', secretRef: 'prod_es_key' } };
    expect((await call(mcpRoute.POST, 'POST', '/api/mcp-connections', body)).status).toBe(403);
  });

  it('refuses an Editor changing an MCP connection that sends a secret (its address, say)', async () => {
    const [conn] = await testDb.db.insert(mcpConnections).values({
      name: 'Remote', slug: `remote-db-${n}`, serverUrl: 'https://mcp.example.test',
      authConfig: { type: 'bearer', secretRef: 'prod_es_key' },
    } as never).returning();
    as(editor);
    const res = await call(mcpOneRoute.PATCH, 'PATCH', `/api/mcp-connections/${conn.id}`, { serverUrl: 'https://attacker.example/mcp' }, { id: conn.id });
    expect(res.status).toBe(403);
  });

  it('refuses an Editor creating a data source whose connection uses a secret', async () => {
    as(editor);
    const body = {
      name: 'Shop', slug: `shop-new-${n}`, type: 'search_index_external',
      config: {
        provider: 'elasticsearch',
        connection: { url: 'https://es.example.test', authType: 'api_key', indexName: 'p', credentials: { secretRef: 'prod_es_key' } },
        searchDefaults: { searchType: 'lexical' }, healthCheck: { enabled: false },
      },
    };
    expect((await call(dataSourcesRoute.POST, 'POST', '/api/data-sources', body)).status).toBe(403);
  });

  it('refuses an Editor changing a data source whose connection uses a secret', async () => {
    const [source] = await testDb.db.insert(dataSources).values({
      name: 'Shop', slug: `shop-${n}`, type: 'search_index_external',
      config: { provider: 'elasticsearch', connection: { url: 'https://es.example.test', authType: 'api_key', indexName: 'p', credentials: { secretRef: 'prod_es_key' } } } as never,
    }).returning();
    as(editor);
    const res = await call(dataSourceRoute.PUT, 'PUT', `/api/data-sources/${source.id}`, { name: 'Moved' }, { id: source.id });
    expect(res.status).toBe(403);
  });
});

describe('what the built-in help is made of', () => {
  const httpTool = (slug: string) => ({
    name: slug, slug, aiDescription: 'Looks things up over HTTP', executorType: 'http',
    executorConfig: { baseUrl: 'https://api.example.test/x', method: 'GET', responseMapping: { resultsPath: '$.r' } },
  });
  const docsSource = async (isBuiltIn: boolean) => (await testDb.db.insert(dataSources).values({
    name: 'Docs', slug: `docs-${isBuiltIn}-${++n}`, type: 'file_store', config: {} as never, isBuiltIn,
  }).returning())[0];

  it('refuses an Editor adding a tool to the docs data source (new or scaffolded), not to another', async () => {
    const builtIn = await docsSource(true);
    const other = await docsSource(false);
    as(editor);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', { ...httpTool(`onto-docs-${n}`), dataSourceId: builtIn.id })).status).toBe(403);
    expect((await call(scaffoldRoute.POST, 'POST', '/api/tools/scaffold', { dataSourceId: builtIn.id })).status).toBe(403);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', { ...httpTool(`mine-${n}`), dataSourceId: other.id })).status).toBe(201);
    // Admin may
    as(admin);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', { ...httpTool(`admin-docs-${n}`), dataSourceId: builtIn.id })).status).toBe(201);
  });

  it("refuses an Editor deleting a document of the docs data source's knowledge base, not another's", async () => {
    const builtIn = await docsSource(true);
    const other = await docsSource(false);
    const [docsDoc] = await testDb.db.insert(knowledgeDocuments).values({ dataSourceId: builtIn.id, name: 'intro.md' }).returning();
    const [otherDoc] = await testDb.db.insert(knowledgeDocuments).values({ dataSourceId: other.id, name: 'mine.md' }).returning();
    as(editor);
    expect((await call(kbDocRoute.DELETE, 'DELETE', `/api/knowledge-base/${docsDoc.id}`, undefined, { id: docsDoc.id })).status).toBe(403);
    expect(await testDb.db.query.knowledgeDocuments.findFirst({ where: (t, { eq: e }) => e(t.id, docsDoc.id) })).toBeTruthy();
    expect((await call(kbDocRoute.DELETE, 'DELETE', `/api/knowledge-base/${otherDoc.id}`, undefined, { id: otherDoc.id })).status).toBe(200);
  });
});

describe('review round 2', () => {
  it('deactivates a user through the route, and they are locked out', async () => {
    as(admin);
    expect((await call(deactivateRoute.PATCH, 'PATCH', `/api/users/${viewer}/deactivate`, undefined, { id: viewer })).status).toBe(200);
    expect((await getUser(viewer)).isActive).toBe(false);
    as(viewer);
    expect((await call(meRoute.GET, 'GET', '/api/me/access')).status).toBe(401);
  });

  it("refuses a manager activating someone they can't manage, even when nothing would change", async () => {
    const managerRole = await makeRole(`Mgr ${n}`, ['users:manage']);
    as(await makeUser(managerRole));
    expect((await call(activateRoute.PATCH, 'PATCH', `/api/users/${admin}/activate`, undefined, { id: admin })).status).toBe(403);
  });

  it("doesn't tell a caller without users:manage whether a user id exists", async () => {
    as(viewer);
    const missing = '00000000-0000-4000-8000-0000000000ee';
    expect((await call(userRoute.GET, 'GET', `/api/users/${missing}`, undefined, { id: missing })).status).toBe(403);
    expect((await call(userRoute.GET, 'GET', `/api/users/${editor}`, undefined, { id: editor })).status).toBe(403);
  });

  it('refuses a manager deleting a role with permissions they lack, and lets an Admin', async () => {
    const managerRole = await makeRole(`Mgr2 ${n}`, ['users:manage']);
    const above = await makeRole(`Above ${n}`, ['secrets:manage']);
    as(await makeUser(managerRole));
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${above}`, undefined, { id: above })).status).toBe(403);
    as(admin);
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${above}`, undefined, { id: above })).status).toBe(200);
  });

  it("lets a manager change the password of a user they manage (with that user's current password)", async () => {
    const managerRole = await makeRole(`Mgr3 ${n}`, ['users:manage', 'search-experiences:view']);
    const lowRole = await makeRole(`Low ${n}`, ['search-experiences:view']);
    as(admin);
    const created = await call(usersRoute.POST, 'POST', '/api/users', { email: `low${n}@x.test`, password: 'Passw0rd-old1', roleId: lowRole });
    const target = (created.body?.data as { id: string }).id;
    as(await makeUser(managerRole));
    const res = await call(passwordRoute.POST, 'POST', `/api/users/${target}/change-password`, { currentPassword: 'Passw0rd-old1', newPassword: 'Passw0rd-new1', confirmPassword: 'Passw0rd-new1' }, { id: target });
    expect(res.status).toBe(200);
  });

  it('lists users with their role and never their password', async () => {
    as(admin);
    const res = await call(usersRoute.GET, 'GET', '/api/users');
    expect(res.status).toBe(200);
    const rows = res.body?.data as Array<Record<string, unknown>>;
    expect(rows.find((u) => u.id === viewer)).toMatchObject({ roleId: VIEWER, role: { id: VIEWER, name: 'Viewer', isBuiltIn: false } });
    expect(rows.every((u) => !('password' in u))).toBe(true);
  });

  it('gives a role the permissions its permissions imply (asking analytics reads analytics)', async () => {
    as(await makeUser(await makeRole(`Askers ${n}`, ['analytics:ask', 'tools:edit'])));
    const me = await call(meRoute.GET, 'GET', '/api/me/access');
    expect((me.body?.data as { permissions: string[] }).permissions.sort()).toEqual(['analytics:ask', 'analytics:view', 'tools:edit', 'tools:view']);
  });

  it('lets a role that may only use the playgrounds load what they pick from: indexes and experiences', async () => {
    as(await makeUser(await makeRole(`Testers ${n}`, ['playground:use'])));
    const me = await call(meRoute.GET, 'GET', '/api/me/access');
    expect((me.body?.data as { permissions: string[] }).permissions.sort()).toEqual(
      ['ai-experiences:view', 'playground:use', 'search-experiences:view', 'search-indexes:view'],
    );
    expect((await call(allIndexesRoute.GET, 'GET', '/api/search-indexes/all')).status).toBe(200);
    expect((await call(searchExperiencesRoute.GET, 'GET', '/api/search-experiences')).status).toBe(200);
    expect((await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).status).toBe(200);
  });

  it("lets a chat editor load the lists the experience's pickers choose from, and nothing more", async () => {
    as(await makeUser(await makeRole(`Chat editors ${n}`, ['ai-experiences:edit'])));
    expect((await call(allToolsRoute.GET, 'GET', '/api/tools/all')).status).toBe(200);
    expect((await call(mcpRoute.GET, 'GET', '/api/mcp-connections?pageSize=100')).status).toBe(200);
    expect((await call(promptTemplatesRoute.GET, 'GET', '/api/prompt-templates')).status).toBe(200);
    expect((await call(promptDefaultsRoute.GET, 'GET', '/api/prompt-templates/defaults')).status).toBe(200);
    // Not a template's own page or history, nor the knowledge entries, nor any change
    expect((await call(promptTemplateRoute.GET, 'GET', '/api/prompt-templates/x', undefined, { id: 'x' })).status).toBe(403);
    expect((await call(promptHistoryRoute.GET, 'GET', '/api/prompt-templates/x/history', undefined, { id: 'x' })).status).toBe(403);
    expect((await call(knowledgeBaseRoute.GET, 'GET', '/api/knowledge-base')).status).toBe(403);
    expect((await call(toolRoute.GET, 'GET', '/api/tools/x', undefined, { id: 'x' })).status).toBe(403);
    expect((await call(toolsRoute.POST, 'POST', '/api/tools', {})).status).toBe(403);
    // The role itself still holds only what it was given
    const me = await call(meRoute.GET, 'GET', '/api/me/access');
    expect((me.body?.data as { permissions: string[] }).permissions.sort()).toEqual(['ai-experiences:edit', 'ai-experiences:view']);
  });

  it("lets a search editor load the lists the experience's pickers choose from, and nothing more", async () => {
    as(await makeUser(await makeRole(`Search editors ${n}`, ['search-experiences:edit'])));
    expect((await call(indexesRoute.GET, 'GET', '/api/search-indexes?isActive=true&pageSize=100')).status).toBe(200);
    expect((await call(dataSourcesRoute.GET, 'GET', '/api/data-sources?pageSize=100')).status).toBe(200);
    // Index rows carry only what the source picker shows
    await testDb.db.execute(sql`INSERT INTO search_index (name, display_name, search_type) VALUES (${`pick-index-${n}`}, ${`Pick index ${n}`}, 'lexical')`);
    const indexRows = ((await call(indexesRoute.GET, 'GET', '/api/search-indexes?pageSize=100')).body?.data as { items: Array<Record<string, unknown>> }).items;
    expect(indexRows.length).toBeGreaterThan(0);
    const indexShown = new Set(['id', 'name', 'displayName', 'description', 'searchType', 'searchProvider', 'status', 'documentCount', 'isActive', 'isBuiltIn']);
    expect(indexRows.flatMap((r) => Object.keys(r)).filter((k) => !indexShown.has(k))).toEqual([]);
    // Not an index's documents or export, nor secrets
    expect((await call(documentsRoute.GET, 'GET', '/api/search-indexes/x/documents', undefined, { id: 'x' })).status).toBe(403);
    expect((await call(exportRoute.GET, 'GET', '/api/search-indexes/x/export', undefined, { id: 'x' })).status).toBe(403);
    expect((await call(secretsRoute.GET, 'GET', '/api/secrets')).status).toBe(403);
  });

  it("gives a chat editor who can't view tools or prompts only what the pickers show: no settings, auth or prompt text", async () => {
    const tag = `pick${n}`;
    await testDb.db.execute(sql`INSERT INTO tools (name, slug, ai_description, executor_type, executor_config, is_active) VALUES (${tag}, ${tag}, 'Finds things', 'http', '{"baseUrl":"https://tool.internal.test","method":"GET"}', true)`);
    await testDb.db.execute(sql`INSERT INTO mcp_connections (name, slug, server_url, auth_config, last_health_message, discovered_tools) VALUES (${tag}, ${tag}, 'https://user:pw@mcp.test/sse/path-token?key=abc', '{"type":"bearer","secretRef":"mcp-token"}', 'health detail', '{"tools":[{"name":"lookup","description":"Looks up","inputSchema":{"type":"object"}}]}')`);
    await testDb.db.execute(sql`INSERT INTO prompt_templates (step, version, label, content, metadata, is_system_default) VALUES ('agentic_loop', 1, ${tag}, 'SECRET PROMPT TEXT', '{"variables":[],"sections":[]}', true)`);
    as(await makeUser(await makeRole(`Chat pickers ${n}`, ['ai-experiences:edit'])));

    // Every row carries only what the tool picker shows (the list may come from the cache)
    const tools = (await call(allToolsRoute.GET, 'GET', '/api/tools/all')).body?.data as Array<Record<string, unknown>>;
    expect(tools.length).toBeGreaterThan(0);
    const shown = new Set(['id', 'name', 'slug', 'description', 'aiDescription', 'executorType', 'operation', 'notReadyReason', 'isActive', 'isBuiltIn']);
    expect(tools.flatMap((t) => Object.keys(t)).filter((k) => !shown.has(k))).toEqual([]);
    const mcp = (await call(mcpRoute.GET, 'GET', '/api/mcp-connections?pageSize=100')).body?.data as Array<Record<string, unknown>>;
    const conn = mcp.find((c) => c.name === tag)!;
    // Only the host of its address (the path, query or user part can carry a token), and the tools' names
    expect(conn).toMatchObject({ name: tag, serverUrl: 'mcp.test', discoveredTools: { tools: [{ name: 'lookup', description: 'Looks up' }] } });
    expect(JSON.stringify(conn)).not.toMatch(/path-token|key=abc|pw@|inputSchema|mcp-token|health detail/);
    const templates = JSON.stringify((await call(promptTemplatesRoute.GET, 'GET', '/api/prompt-templates')).body?.data);
    expect(templates).toContain(tag);
    expect(templates).not.toContain('SECRET PROMPT TEXT');
    // Each step's default, as the Prompts panel shows it: never the prompt text
    await testDb.db.execute(sql`INSERT INTO prompt_templates (step, version, label, content, metadata, is_system_default) VALUES ('turn_planner', 99, ${tag}, 'SECRET PROMPT TEXT', '{"variables":[],"sections":[]}', true)`);
    const defaults = (await call(promptDefaultsRoute.GET, 'GET', '/api/prompt-templates/defaults')).body?.data as Record<string, Record<string, unknown> | null>;
    const rows = Object.values(defaults).filter((d): d is Record<string, unknown> => !!d);
    expect(rows.length).toBeGreaterThan(0);
    const picked = new Set(['id', 'step', 'version', 'label', 'status', 'isSystemDefault']);
    expect(rows.flatMap((d) => Object.keys(d)).filter((k) => !picked.has(k))).toEqual([]);

    // The experience's own list of attached connections shows them the same way
    const experienceId = ((await testDb.db.execute(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config) VALUES (${tag}, ${tag}, ${admin}, '{}', '{}', '{}', '{}') RETURNING id`)) as unknown as { rows: Array<{ id: string }> }).rows[0].id;
    await testDb.db.execute(sql`INSERT INTO ai_experience_mcp_connections (ai_experience_id, mcp_connection_id) SELECT ${experienceId}, id FROM mcp_connections WHERE name = ${tag}`);
    const attached = await call(attachmentsRoute.GET, 'GET', `/api/ai-experiences/${experienceId}/mcp-connections`, undefined, { id: experienceId });
    expect(attached.status).toBe(200);
    expect(attached.body?.data).toMatchObject([{ mcpConnection: { name: tag, serverUrl: 'mcp.test' } }]);
    expect(JSON.stringify(attached.body?.data)).not.toMatch(/path-token|key=abc|pw@|inputSchema|mcp-token|health detail/);
    // A role that views tools sees the attached connection whole
    as(await makeUser(await makeRole(`Tool viewers ${n}`, ['tools:view', 'ai-experiences:view'])));
    expect(JSON.stringify((await call(attachmentsRoute.GET, 'GET', `/api/ai-experiences/${experienceId}/mcp-connections`, undefined, { id: experienceId })).body?.data)).toContain('mcp-token');

    // A role that views them still gets them whole
    as(await makeUser(await makeRole(`Prompt viewers ${n}`, ['prompts:view'])));
    expect(JSON.stringify((await call(promptTemplatesRoute.GET, 'GET', '/api/prompt-templates')).body?.data)).toContain('SECRET PROMPT TEXT');
  });

  it("gives a search editor who can't view data sources the sources without their connection settings", async () => {
    const name = `Picker source ${n}`;
    const rows = await testDb.db.execute(sql`INSERT INTO data_sources (name, slug, type, config, schema) VALUES (${name}, ${`picker-source-${n}`}, 'search_index_external', '{"provider":"azure_ai_search","endpoint":"https://search.internal.test","apiKeySecretRef":"azure-key"}', '{"fields":[{"name":"title","displayName":"Title","type":"text","isSearchable":true,"isFacetable":false,"isFilterable":false,"profile":{"sampleSize":5,"nullRate":0,"distinctInSample":5,"sampleValues":["Private doc title"],"profiledAt":"x"}}]}') RETURNING id`);
    const id = (rows as unknown as { rows: Array<{ id: string }> }).rows[0].id;
    as(await makeUser(await makeRole(`Source pickers ${n}`, ['search-experiences:edit'])));
    const one = await call(dataSourceRoute.GET, 'GET', `/api/data-sources/${id}`, undefined, { id: id! });
    expect(one.status).toBe(200);
    expect(one.body?.data).toMatchObject({ id, name });
    // The provider names it in the picker; the rest of its settings stay out
    expect((one.body?.data as Record<string, unknown>).config).toEqual({ provider: 'azure_ai_search' });
    // Its fields, without the values sampled from documents
    expect(one.body?.data).toMatchObject({ schema: { fields: [{ name: 'title', type: 'text' }] } });
    expect(JSON.stringify(one.body?.data)).not.toContain('Private doc title');
    const list = await call(dataSourcesRoute.GET, 'GET', '/api/data-sources?pageSize=100');
    expect(JSON.stringify(list.body?.data)).not.toContain('search.internal.test');
    expect(JSON.stringify(list.body?.data)).not.toContain('azure-key');
    // A role that views data sources still sees them whole
    as(await makeUser(await makeRole(`Source viewers ${n}`, ['data-sources:view'])));
    expect((await call(dataSourceRoute.GET, 'GET', `/api/data-sources/${id}`, undefined, { id: id! })).body?.data).toHaveProperty('config');
  });
});

describe('review round 3', () => {
  it('lets any user change their own password with their current one', async () => {
    as(admin);
    const created = await call(usersRoute.POST, 'POST', '/api/users', { email: `self${n}@x.test`, password: 'Passw0rd-old1', roleId: VIEWER });
    const me = (created.body?.data as { id: string }).id;
    as(me);
    const change = (current: string) => call(passwordRoute.POST, 'POST', `/api/users/${me}/change-password`, { currentPassword: current, newPassword: 'Passw0rd-new1', confirmPassword: 'Passw0rd-new1' }, { id: me });
    expect((await change('wrong-one1A')).status).toBe(400);
    expect((await change('Passw0rd-old1')).status).toBe(200);
  });

  it('saves neither the profile nor the role when the role change is refused', async () => {
    await testDb.db.update(user).set({ isActive: false }).where(eq(user.roleId, ADMIN_ROLE_ID));
    const last = await makeUser(ADMIN_ROLE_ID);
    await expect(updateUserAccess(last, { roleId: EDITOR }, { firstName: 'Changed' })).rejects.toMatchObject({ status: 409 });
    expect(await getUser(last)).toMatchObject({ roleId: ADMIN_ROLE_ID, firstName: 'First' });
  });

  it('saves the profile and the role together when allowed', async () => {
    as(admin);
    const res = await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { firstName: 'Both', roleId: EDITOR }, { id: viewer });
    expect(res.status).toBe(200);
    expect(await getUser(viewer)).toMatchObject({ roleId: EDITOR, firstName: 'Both' });
  });

  it('looks the user, their role, the new role and the email up once each when saving', async () => {
    as(admin);
    vi.mocked(authRepository.getUserById).mockClear();
    vi.mocked(authRepository.getUserByEmail).mockClear();
    vi.mocked(rolesRepository.getRole).mockClear();
    const res = await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { email: `new${n}@x.test`, roleId: EDITOR }, { id: viewer });
    expect(res.status).toBe(200);
    // The user: once for the checks, once to answer with the saved user
    expect(authRepository.getUserById).toHaveBeenCalledTimes(2);
    expect(authRepository.getUserByEmail).toHaveBeenCalledTimes(1);
    // Their current role, then the new one
    expect(vi.mocked(rolesRepository.getRole).mock.calls).toEqual([[VIEWER], [EDITOR]]);
  });

  it.each([
    ['create a user', () => usersRoute.POST, 'POST', false],
    ['update a user', () => userRoute.PUT, 'PUT', true],
    ['change a password', () => passwordRoute.POST, 'POST', true],
  ] as const)('answers a body that is not JSON with 400 INVALID_JSON: %s', async (_name, fn, method, forUser) => {
    as(admin);
    const req = new NextRequest('http://localhost/api/users', { method, headers: { 'Content-Type': 'application/json' }, body: '{"email": "a' });
    const res = await (fn() as unknown as Route)(req, { params: Promise.resolve(forUser ? { id: viewer } : {}) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('lets a role that manages secrets set up an MCP connection and a data source that use one', async () => {
    const keeper = await makeRole(`Keepers ${n}`, ['secrets:manage', 'tools:edit', 'data-sources:edit']);
    as(await makeUser(keeper));
    const mcp = { name: 'Remote', slug: `remote-ok-${n}`, serverUrl: 'http://127.0.0.1:9/mcp', authConfig: { type: 'bearer', secretRef: 'prod_es_key' } };
    expect((await call(mcpRoute.POST, 'POST', '/api/mcp-connections', mcp)).status).toBe(201);
    const source = {
      name: 'Shop', slug: `shop-ok-${n}`, type: 'search_index_external',
      config: { provider: 'elasticsearch', connection: { url: 'https://es.example.test', authType: 'api_key', indexName: 'p', credentials: { secretRef: 'prod_es_key' } }, searchDefaults: { searchType: 'lexical' }, healthCheck: { enabled: false } },
    };
    expect((await call(dataSourcesRoute.POST, 'POST', '/api/data-sources', source)).status).toBe(201);
  });

  it('gives setup:run only to a role that also holds what the setup changes', async () => {
    as(await makeUser(await makeRole(`Setup only ${n}`, ['setup:run'])));
    expect((await call(setupDemoRoute.GET, 'GET', '/api/admin/setup-demo')).status).toBe(403);
    const full = [...(REQUIRED_WITH['setup:run'] ?? []), 'setup:run'] as Permission[];
    as(await makeUser(await makeRole(`Setup full ${n}`, full)));
    expect((await call(setupDemoRoute.GET, 'GET', '/api/admin/setup-demo')).status).not.toBe(403);
    expect(ALL_PERMISSIONS).toEqual(expect.arrayContaining(full));
  });

  it('checks a bad ingestion key on every document route method, without a session', async () => {
    as(null);
    const index = '00000000-0000-4000-8000-0000000000aa';
    const doc = '00000000-0000-4000-8000-0000000000bb';
    const key = { Authorization: 'Bearer not-a-key' };
    const methods: Array<[unknown, string, string, Record<string, string>, unknown?]> = [
      [documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, { id: index }],
      [documentsRoute.POST, 'POST', `/api/search-indexes/${index}/documents`, { id: index }, { documents: [{ id: 'a' }] }],
      [docRoute.GET, 'GET', `/api/search-indexes/${index}/documents/${doc}`, { id: index, documentId: doc }],
      [docRoute.PUT, 'PUT', `/api/search-indexes/${index}/documents/${doc}`, { id: index, documentId: doc }, { title: 'x' }],
      [docRoute.PATCH, 'PATCH', `/api/search-indexes/${index}/documents/${doc}`, { id: index, documentId: doc }, { title: 'x' }],
      [docRoute.DELETE, 'DELETE', `/api/search-indexes/${index}/documents/${doc}`, { id: index, documentId: doc }],
      [batchesRoute.GET, 'GET', `/api/search-indexes/${index}/documents/batches`, { id: index }],
      [batchRoute.GET, 'GET', `/api/search-indexes/${index}/documents/batches/${doc}`, { id: index, batchId: doc }],
      [batchRoute.DELETE, 'DELETE', `/api/search-indexes/${index}/documents/batches/${doc}`, { id: index, batchId: doc }],
      [bulkRoute.POST, 'POST', `/api/search-indexes/${index}/documents/bulk`, { id: index }, { operations: [] }],
      [deleteByFilterRoute.POST, 'POST', `/api/search-indexes/${index}/documents/delete-by-filter`, { id: index }, { filter: { field: 'a', value: 'b' } }],
    ];
    const wrong: string[] = [];
    for (const [fn, method, url, params, body] of methods) {
      const res = await call(fn, method, url, body, params, key);
      const message = String(res.body?.message ?? '');
      if (res.status !== 401 || message !== 'Invalid ingestion key') wrong.push(`${method} ${url} -> ${res.status} ${message}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('review round 4', () => {
  it('refuses a profile email another user has, alone or with a role change, and saves nothing', async () => {
    const taken = (await getUser(editor)).email;
    as(admin);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { email: taken }, { id: viewer })).status).toBe(400);
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${viewer}`, { email: taken, roleId: EDITOR }, { id: viewer })).status).toBe(400);
    expect(await getUser(viewer)).toMatchObject({ roleId: VIEWER });
  });

  it('answers a roles request whose body is not JSON with 400', async () => {
    as(admin);
    const req = new NextRequest('http://localhost/api/roles', { method: 'POST', body: '{not json' });
    const res = await (rolesRoute.POST as unknown as (r: NextRequest) => Promise<Response>)(req);
    expect(res.status).toBe(400);
  });
});

describe('which configs count as using a secret', () => {
  it('the delete check finds every form the access check guards, the web search key included', async () => {
    as(admin);
    const web = { name: 'Web', slug: `web-${n}`, aiDescription: 'Searches the web for answers', executorType: 'web_search', executorConfig: { apiKeySecret: 'web_key' } };
    const created = await call(toolsRoute.POST, 'POST', '/api/tools', web);
    expect(created.status).toBe(201);
    const refs = await findSecretReferences('web_key');
    expect(refs.map((r) => r.id)).toContain((created.body?.data as { id: string }).id);
  });
});

describe('adding a secret to a config that had none', () => {
  it('refuses an Editor adding a vault secret to their own tool, MCP connection or data source', async () => {
    as(editor);
    const tool = await call(toolsRoute.POST, 'POST', '/api/tools', {
      name: 'Plain', slug: `plain-up-${n}`, aiDescription: 'Looks things up over HTTP', executorType: 'http',
      executorConfig: { baseUrl: 'https://api.example.test/x', method: 'GET', responseMapping: { resultsPath: '$.r' } },
    });
    const toolId = (tool.body?.data as { id: string }).id;
    const withSecret = { executorConfig: { baseUrl: 'https://api.example.test/x', method: 'GET', authentication: { type: 'header', key: 'X', valueRef: 'prod_es_key' } } };
    expect((await call(toolRoute.PUT, 'PUT', `/api/tools/${toolId}`, withSecret, { id: toolId })).status).toBe(403);

    const [conn] = await testDb.db.insert(mcpConnections).values({ name: 'Open', slug: `open-${n}`, serverUrl: 'https://mcp.example.test', authConfig: { type: 'none' } } as never).returning();
    expect((await call(mcpOneRoute.PATCH, 'PATCH', `/api/mcp-connections/${conn.id}`, { authConfig: { type: 'bearer', secretRef: 'prod_es_key' } }, { id: conn.id })).status).toBe(403);

    const [source] = await testDb.db.insert(dataSources).values({
      name: 'Open', slug: `open-src-${n}`, type: 'search_index_external',
      config: { provider: 'elasticsearch', connection: { url: 'https://es.example.test', authType: 'none', indexName: 'p', credentials: { secretRef: '' } } } as never,
    }).returning();
    const sourceUpdate = { config: { provider: 'elasticsearch', connection: { url: 'https://es.example.test', authType: 'api_key', indexName: 'p', credentials: { secretRef: 'prod_es_key' } }, searchDefaults: { searchType: 'lexical' }, healthCheck: { enabled: false } } };
    expect((await call(dataSourceRoute.PUT, 'PUT', `/api/data-sources/${source.id}`, sourceUpdate, { id: source.id })).status).toBe(403);
  });
});

describe("a role's permissions compared as granted", () => {
  it('lets a user manager whose role holds a permission it lacks the companions for still manage users holding that role', async () => {
    // setup:run without its companions grants nothing; the role is still within its holders' reach
    const role = await makeRole(`Mgr setup ${n}`, ['users:manage', 'setup:run']);
    const peer = await makeUser(role);
    as(await makeUser(role));
    expect((await call(userRoute.PUT, 'PUT', `/api/users/${peer}`, { firstName: 'Peer' }, { id: peer })).status).toBe(200);
  });
});

describe('the experiences analytics can be scoped to', () => {
  it('are listed by name for a role that only reads analytics, without configs or tokens', async () => {
    const tag = `${n}-${Date.now()}`;
    await testDb.db.insert(aiExperiences).values({ name: `Helper ${tag}`, slug: `helper-${tag}`, accessToken: '00000000-0000-4000-8000-00000000c0de', createdBy: admin,
      personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {} } as never);
    as(await makeUser(await makeRole(`Analysts ${n}`, ['analytics:view'])));
    const res = await call(analyticsExperiencesRoute.GET, 'GET', '/api/analytics/experiences');
    expect(res.status).toBe(200);
    expect(res.body?.data).toEqual(expect.arrayContaining([{ id: expect.any(String), name: `Helper ${tag}`, slug: `helper-${tag}`, type: 'ai', isActive: true }]));
    expect(JSON.stringify(res.body)).not.toContain('00000000c0de');
  });
});
