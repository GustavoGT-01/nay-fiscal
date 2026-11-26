import bcrypt from 'bcryptjs';

/** Mesmo custo do login e do script `npm run senha`. */
const COST = 12;

/** Regra de senha: 10+ caracteres, com letras e numeros, e nunca a senha de demonstracao. Devolve o motivo ou null. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10 || p === 'nay12345' || !/[a-zA-Z]/.test(p) || !/\d/.test(p)) {
    return 'A senha precisa ter pelo menos 10 caracteres, com letras e números.';
  }
  if (p.length > 200) return 'A senha é longa demais (máximo de 200 caracteres).';
  return null;
}

export const hashPassword = (p: string) => bcrypt.hash(p, COST);
