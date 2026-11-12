import type { ParsedDocument } from '../../xml/nfe-parser.js';
import * as clients from '../../models/client.js';

type Party = ParsedDocument['emitter'] | ParsedDocument['recipient'];

/** Regime a partir do CRT do emitente: 1 e 2 = Simples; 3 = regime normal (Real ou Presumido, a definir). */
function regimeFromCrt(crt: string | null | undefined) {
  return crt === '1' || crt === '2' ? 'SIMPLES_NACIONAL' : 'A_DEFINIR';
}

const establishmentLabel = (cnpj: string, city: string) => (cnpj.slice(8, 12) === '0001' ? 'Matriz' : `Filial ${city || cnpj.slice(8, 12)}`.trim());

/**
 * Mapa raiz do CNPJ (8 digitos) -> cliente do escritorio. Matriz e filiais compartilham a raiz.
 * Cria clientes e estabelecimentos a partir dos dados da propria nota quando preciso.
 */
export class ClientResolver {
  private byRoot = new Map<string, { id: string; name: string; estabs: Set<string> }>();
  created: string[] = [];
  constructor(private officeId: string) {}

  async load() {
    const all = await clients.loadAllForResolver(this.officeId);
    for (const c of all) {
      const entry = { id: c.id, name: c.name, estabs: new Set([c.cnpj, ...c.establishments.map((e) => e.cnpj)]) };
      this.byRoot.set(c.cnpj.slice(0, 8), entry);
      for (const e of c.establishments) this.byRoot.set(e.cnpj.slice(0, 8), entry);
    }
  }

  find(cnpj: string) {
    return cnpj.length === 14 ? this.byRoot.get(cnpj.slice(0, 8)) : undefined;
  }

  /** Garante que o CNPJ exato (matriz ou filial) esteja nos estabelecimentos do cliente. */
  async ensureEstablishment(party: Party) {
    const c = this.find(party.cnpj);
    if (!c || c.estabs.has(party.cnpj)) return;
    await clients.createEstablishment({ clientId: c.id, cnpj: party.cnpj, label: establishmentLabel(party.cnpj, party.city), isMatriz: party.cnpj.slice(8, 12) === '0001' });
    c.estabs.add(party.cnpj);
  }

  async create(party: Party, crt: string | null) {
    const c = await clients.create({
      officeId: this.officeId,
      name: party.name || party.cnpj,
      cnpj: party.cnpj,
      regime: regimeFromCrt(crt),
      city: party.city || null,
      cityCode: party.cityCode || null,
      uf: party.uf || null,
      establishments: { create: [{ cnpj: party.cnpj, label: establishmentLabel(party.cnpj, party.city), isMatriz: party.cnpj.slice(8, 12) === '0001' }] },
    });
    const entry = { id: c.id, name: c.name, estabs: new Set([party.cnpj]) };
    this.byRoot.set(party.cnpj.slice(0, 8), entry);
    this.created.push(c.name);
    return entry;
  }
}