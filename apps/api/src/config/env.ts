/** Configuracao lida do ambiente. Os padroes servem para desenvolvimento local. */
export const env = {
  get jwtSecret() {
    return process.env.JWT_SECRET ?? 'dev-secret-nay-fiscal';
  },
  get hasJwtSecret() {
    return !!process.env.JWT_SECRET;
  },
  get webOrigin(): string | true {
    return process.env.WEB_ORIGIN ?? true;
  },
  // API_PORT (e nao PORT): ferramentas de preview definem PORT para o front.
  get port() {
    return Number(process.env.API_PORT ?? 3333);
  },
};