import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACTIONS, SCREENS, type AdminProfileDTO, type AdminUserDTO } from '@nay/shared';
import { IdParam } from '../lib/query.js';
import { safeJson } from '../lib/json.js';
import * as profiles from '../models/profile.js';
import * as users from '../models/user.js';
import { hashPassword, passwordProblem } from '../services/password.js';

/** Usuarios e perfis do escritorio. Ler exige a tela Gestao; criar e alterar, ser administrador (routes/admin.ts). */

const PERMISSION_KEYS = new Set<string>([...SCREENS.map((s) => s.key), ...ACTIONS.map((a) => a.key)]);

const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type UserRow = Awaited<ReturnType<typeof users.listByOffice>>[number];
const userDTO = (u: UserRow): AdminUserDTO => ({
  id: u.id, name: u.name, email: u.email, role: u.role as AdminUserDTO['role'], active: u.active,
  profile: u.profile?.name ?? null, profileId: u.profileId, mustChangePassword: u.mustChangePassword, createdAt: u.createdAt.toISOString(),
});

type ProfileRow = NonNullable<Awaited<ReturnType<typeof profiles.findOfOffice>>>;
const profileDTO = (p: ProfileRow): AdminProfileDTO => {
  const raw = safeJson<unknown>(p.permissions, []);
  return { id: p.id, name: p.name, permissions: Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [], users: p._count.users };
};

export async function listUsers(req: FastifyRequest): Promise<AdminUserDTO[]> {
  return (await users.listByOffice(req.me.officeId)).map(userDTO);
}

const Name = z.string().trim().min(1, 'Informe o nome.').max(120);
const Role = z.enum(['ADMIN', 'ANALISTA']);
const ProfileRef = z.string().max(100).nullable();

const CreateUser = z.object({
  name: Name,
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(254),
  password: z.string().max(200),
  role: Role,
  profileId: ProfileRef.optional(),
}).strict();

const UpdateUser = z.object({
  name: Name.optional(),
  role: Role.optional(),
  profileId: ProfileRef.optional(),
  active: z.boolean().optional(),
  password: z.string().max(200).optional(),
}).strict();

/** Perfil do proprio escritorio; analista precisa ter um. */
async function resolveProfile(officeId: string, role: string, profileId: string | null | undefined) {
  if (role === 'ADMIN') return null;
  if (!profileId) throw fail(400, 'Escolha o perfil do analista.');
  const p = await profiles.findOfOffice(profileId, officeId);
  if (!p) throw fail(400, 'Perfil não encontrado.');
  return p.id;
}

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

export async function createUser(req: FastifyRequest, reply: FastifyReply) {
  const b = CreateUser.parse(req.body);
  const bad = passwordProblem(b.password);
  if (bad) throw fail(400, bad);
  const profileId = await resolveProfile(req.me.officeId, b.role, b.profileId);
  try {
    const u = await users.create({ officeId: req.me.officeId, name: b.name, email: b.email, passwordHash: await hashPassword(b.password), role: b.role, profileId });
    return reply.code(201).send(userDTO(u));
  } catch (e) {
    if (isUnique(e)) throw fail(409, 'Já existe um usuário com este e-mail.');
    throw e;
  }
}

export async function updateUser(req: FastifyRequest): Promise<AdminUserDTO> {
  const { id } = IdParam.parse(req.params);
  const b = UpdateUser.parse(req.body);
  const target = await users.findOfOffice(id, req.me.officeId);
  if (!target) throw fail(404, 'Usuário não encontrado.');
  if (target.role === 'OWNER' && req.me.role !== 'OWNER') throw fail(403, 'Só o dono do escritório altera a própria conta.');
  const self = target.id === req.me.id;
  if (self && ((b.active !== undefined && b.active !== target.active) || (b.role !== undefined && b.role !== target.role))) {
    throw fail(400, 'Você não pode desativar nem mudar o papel da própria conta.');
  }
  if (target.role === 'OWNER' && (b.role !== undefined || b.active === false)) throw fail(400, 'A conta do dono do escritório não pode ser desativada nem mudar de papel.');

  const role = target.role === 'OWNER' ? 'OWNER' : b.role ?? target.role;
  const data: Parameters<typeof users.update>[1] = {};
  if (b.name !== undefined) data.name = b.name;
  if (b.active !== undefined) data.active = b.active;
  if (role !== target.role && target.role !== 'OWNER') data.role = role;
  if (role !== 'OWNER' && (b.role !== undefined || b.profileId !== undefined)) data.profileId = await resolveProfile(req.me.officeId, role, b.profileId === undefined ? target.profileId : b.profileId);
  if (b.password !== undefined) {
    if (self) throw fail(400, 'Para trocar a sua própria senha, use "Trocar senha" no menu do seu usuário.');
    const bad = passwordProblem(b.password);
    if (bad) throw fail(400, bad);
    data.passwordHash = await hashPassword(b.password);
    data.mustChangePassword = true; // a senha definida por outra pessoa vale so ate o primeiro acesso
  }
  const u = await users.update(id, data);
  // papel, perfil, situacao ou senha mudaram: encerra as sessoes abertas dessa pessoa (a propria sessao de quem edita continua)
  const sensitive = data.role !== undefined || data.profileId !== undefined || data.active !== undefined || data.passwordHash !== undefined;
  if (sensitive && !self) await users.bumpTokenVersion(id);
  return userDTO(u);
}

export async function listProfiles(req: FastifyRequest): Promise<AdminProfileDTO[]> {
  return (await profiles.listOfOffice(req.me.officeId)).map(profileDTO);
}

const ProfileBody = z.object({
  name: z.string().trim().min(1, 'Informe o nome do perfil.').max(60),
  permissions: z.array(z.string().max(60)).max(60),
}).strict();

/** So chaves que existem; repetidas somem. Chave desconhecida e erro (nao vira permissao silenciosa). */
function cleanPermissions(list: string[]) {
  const unknown = list.find((k) => !PERMISSION_KEYS.has(k));
  if (unknown) throw fail(400, `Permissão desconhecida: ${unknown}.`);
  return [...new Set(list)];
}

export async function createProfile(req: FastifyRequest, reply: FastifyReply) {
  const b = ProfileBody.parse(req.body);
  if (await profiles.nameTaken(req.me.officeId, b.name)) throw fail(409, 'Já existe um perfil com este nome.');
  return reply.code(201).send(profileDTO(await profiles.create(req.me.officeId, b.name, cleanPermissions(b.permissions))));
}

export async function updateProfile(req: FastifyRequest): Promise<AdminProfileDTO> {
  const { id } = IdParam.parse(req.params);
  const b = ProfileBody.parse(req.body);
  const p = await profiles.findOfOffice(id, req.me.officeId);
  if (!p) throw fail(404, 'Perfil não encontrado.');
  if (await profiles.nameTaken(req.me.officeId, b.name, p.id)) throw fail(409, 'Já existe um perfil com este nome.');
  return profileDTO(await profiles.update(p.id, { name: b.name, permissions: cleanPermissions(b.permissions) }));
}

export async function deleteProfile(req: FastifyRequest) {
  const { id } = IdParam.parse(req.params);
  const p = await profiles.findOfOffice(id, req.me.officeId);
  if (!p) throw fail(404, 'Perfil não encontrado.');
  if (p._count.users > 0) throw fail(409, `Há ${p._count.users} usuário(s) com este perfil. Troque o perfil deles antes de apagar.`);
  await profiles.remove(p.id);
  return { ok: true };
}
