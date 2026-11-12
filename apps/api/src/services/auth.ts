import { ACTIONS, SCREENS, type UserDTO } from '@nay/shared';
import * as users from '../models/user.js';

const ALL = [...SCREENS.map((s) => s.key), ...ACTIONS.map((a) => a.key)];

/** Usuario com permissoes (ADMIN/OWNER tem todas; os demais, as do perfil). */
export async function loadUser(id: string): Promise<UserDTO> {
  const u = await users.findWithOfficeAndProfile(id);
  if (!u.active) throw new Error('Usuário inativo');
  const isAdmin = u.role === 'ADMIN' || u.role === 'OWNER';
  const permissions = isAdmin ? ALL : (JSON.parse(u.profile?.permissions ?? '[]') as string[]);
  return { id: u.id, name: u.name, email: u.email, role: u.role as UserDTO['role'], officeId: u.officeId, officeName: u.office.name, permissions };
}