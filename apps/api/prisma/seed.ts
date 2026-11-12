/**
 * Dados de demonstracao. Gera NF-e sinteticas e passa cada uma pelo mesmo
 * caminho da importacao real (parser + motor de auditoria).
 * Login: admin@nayfiscal.dev / nay12345  ·  analista@nayfiscal.dev / nay12345
 */
try { process.loadEnvFile(); } catch { /* opcional */ }
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/db.js';
import { RULES } from '../src/engine/catalog.js';
import { buildNfe, cnpjFrom, type BuildItem } from './demo/nfe-builder.js';
import { ingestXml } from '../src/services/ingest/ingest-xml.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const MARINGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };

const SUPPLIERS = [
  { name: 'GCC Comércio de Móveis', base: '269475080001', crt: '3', ...MARINGA },
  { name: 'Tecidos Vale do Itajaí', base: '112085540001', crt: '3', city: 'Blumenau', cityCode: '4202404', uf: 'SC' },
  { name: 'Espumas Nordeste', base: '276630190001', crt: '3', city: 'Caruaru', cityCode: '2604106', uf: 'PE' },
  { name: 'Madeireira Serra Alta', base: '098713300001', crt: '1', city: 'Guarapuava', cityCode: '4109401', uf: 'PR' },
  { name: 'Ferragens Pinheiro', base: '145528900001', crt: '1', city: 'Londrina', cityCode: '4113700', uf: 'PR' },
  { name: 'Couros do Agreste', base: '303011620002', crt: '3', city: 'São Paulo', cityCode: '3550308', uf: 'SP' },
  { name: 'Transportes Rio Doce', base: '085448350001', crt: '3', city: 'Sarandi', cityCode: '4126256', uf: 'PR' },
].map((s) => ({ ...s, cnpj: cnpjFrom(s.base), crt: s.crt as '1' | '2' | '3' }));

const PRODUCTS = [
  { description: 'Tecido suede 1,40 m', ncm: '60019200' },
  { description: 'Espuma D33 laminada', ncm: '39211390' },
  { description: 'Revestimento linho', ncm: '52093100' },
  { description: 'Pé de madeira torneado', ncm: '94039090' },
  { description: 'Grampo 80/10', ncm: '73170090' },
  { description: 'Assento estofado modelo Lis', ncm: '94016100' },
];

type Scenario = 'ok_venda' | 'ok_remessa' | 'err_cclass' | 'err_valores' | 'err_grupo' | 'err_crt' | 'att_pis' | 'verificar' | 'cancelada' | 'destino';

function itemsFor(sc: Scenario, sup: (typeof SUPPLIERS)[number]): { items: Partial<BuildItem>[]; crt?: '1' | '2' | '3'; cStat?: '100' | '101' } {
  const simples = sup.crt === '1';
  const icms = simples ? { table: 'CSOSN' as const, code: '102' } : { table: 'CST' as const, code: '00', aliq: 12 };
  const venda: Partial<BuildItem> = { cfop: sup.uf === 'PR' ? '5102' : '6102', icms, pis: simples ? '49' : '01', ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
  const remessaCfop = sup.uf === 'PR' ? pick(['5949', '5915']) : pick(['6912', '6924', '6949']);
  const remessa: Partial<BuildItem> = { cfop: remessaCfop, icms: simples ? icms : { table: 'CST', code: '41' }, pis: '08', ibscbs: { cst: '410', cClassTrib: '410999' } };
  const n = 1 + Math.floor(rnd() * 3);
  const many = (base: Partial<BuildItem>, bad?: Partial<BuildItem>) => Array.from({ length: n }, (_, i) => (i === 0 && bad ? { ...base, ...bad } : base));
  switch (sc) {
    case 'ok_venda': return { items: many(venda) };
    case 'ok_remessa': return { items: many(remessa) };
    case 'err_cclass': return { items: Array.from({ length: n }, () => ({ ...remessa, ibscbs: { cst: '410', cClassTrib: rnd() < 0.3 ? null : '000001' } })) };
    case 'err_valores': return { items: many(remessa, { ibscbs: { cst: '410', cClassTrib: '410999', valores: true } }) };
    case 'err_grupo': return { items: many(venda, { ibscbs: undefined }) };
    case 'err_crt': return { items: [{ ...venda, icms: { table: 'CST', code: '00', aliq: 12 } }], crt: '1' };
    case 'att_pis': return { items: many({ ...venda, icms: { table: 'CSOSN', code: '102' }, pis: '01' }), crt: '1' };
    case 'verificar': return { items: [{ ...venda, cfop: pick(['5551', '5556']) }] };
    case 'cancelada': return { items: many(venda), cStat: '101' };
    case 'destino': return { items: many(venda) };
  }
}

async function seedClientNotes(clientId: string, client: { cnpj: string; name: string }, count: number, errRate: number, startNumber: number) {
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let sc: Scenario;
    if (r < errRate) {
      const e = rnd();
      sc = e < 0.56 ? 'err_cclass' : e < 0.88 ? 'err_valores' : e < 0.98 ? 'err_grupo' : 'err_crt';
    } else {
      const o = rnd();
      sc = o < 0.5 ? 'ok_venda' : o < 0.78 ? 'ok_remessa' : o < 0.9 ? 'att_pis' : 'verificar';
    }
    if (i % Math.floor(count / 5) === 3) sc = 'cancelada';
    if (i === 17) sc = 'destino';
    let sup = pick(SUPPLIERS);
    if (sc === 'att_pis') sup = SUPPLIERS[3];
    const { items, crt, cStat } = itemsFor(sc, sup);
    const day = Math.floor((i / count) * 98);
    const issuedAt = new Date(Date.UTC(2026, 7, 4 + day, 13, Math.floor(rnd() * 59)));
    const recipient = sc === 'destino'
      ? { cnpj: client.cnpj, name: client.name, city: 'Sarandi', cityCode: '4126256', uf: 'PR' }
      : { cnpj: client.cnpj, name: client.name, ...MARINGA };
    const { xml } = buildNfe({
      uf: sup.uf === 'PR' ? '41' : sup.uf === 'SC' ? '42' : sup.uf === 'SP' ? '35' : '26',
      issuedAt,
      number: startNumber + i,
      natOp: sc.includes('remessa') || sc === 'err_cclass' || sc === 'err_valores' ? 'REMESSA PARA DEMONSTRACAO' : 'VENDA DE MERCADORIA',
      emitter: { cnpj: sup.cnpj, name: sup.name, city: sup.city, cityCode: sup.cityCode, uf: sup.uf, crt: crt ?? sup.crt },
      recipient,
      cStat,
      items: items.map((p, k) => {
        const prod = pick(PRODUCTS);
        return { code: String(100 + k), description: prod.description, ncm: prod.ncm, cfop: '5102', qty: 1 + Math.floor(rnd() * 40), unit: Math.round(20 + rnd() * 600), icms: { table: 'CST', code: '00', aliq: 12 }, ...p } as BuildItem;
      }),
    });
    await ingestXml(clientId, xml);
  }
}

/** Clientes ficticios dos clientes do escritorio (destinatarios das notas de saida). */
const CUSTOMERS = [
  { name: 'Casa Bela Móveis e Decoração', base: '402118770001', city: 'Curitiba', cityCode: '4106902', uf: 'PR' },
  { name: 'Loja Conforto Lar', base: '377205410001', city: 'Cascavel', cityCode: '4104808', uf: 'PR' },
  { name: 'Magazine Ponte Alta', base: '215590320001', city: 'Joinville', cityCode: '4209102', uf: 'SC' },
  { name: 'Distribuidora Paulista Interiores', base: '189034560001', city: 'Campinas', cityCode: '3509502', uf: 'SP' },
  { name: 'Armazém Recife Novo', base: '310245780001', city: 'Recife', cityCode: '2611606', uf: 'PE' },
].map((c) => ({ ...c, cnpj: cnpjFrom(c.base) }));

type SaidaScenario = 'ok_venda' | 'ok_remessa' | 'err_cclass' | 'err_valores' | 'err_grupo' | 'cancelada';

/**
 * Notas emitidas pelo proprio cliente (saidas). Usa um gerador separado para nao
 * mudar a sequencia das entradas; continua deterministico.
 */
async function seedClientSaidas(clientId: string, client: { cnpj: string; name: string; regime: string }, count: number, startNumber: number) {
  let s = 4242 + startNumber;
  const r2 = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const pick2 = <T,>(a: T[]) => a[Math.floor(r2() * a.length)];
  const simples = client.regime === 'SIMPLES_NACIONAL';
  const crt = simples ? '1' : '3';
  const icms = simples ? { table: 'CSOSN' as const, code: '102' } : { table: 'CST' as const, code: '00', aliq: 12 };
  for (let i = 0; i < count; i++) {
    const r = r2();
    let sc: SaidaScenario = r < 0.55 ? 'ok_venda' : r < 0.7 ? 'ok_remessa' : r < 0.82 ? 'err_cclass' : r < 0.92 ? 'err_valores' : 'err_grupo';
    if (i === 2) sc = 'cancelada';
    const cust = pick2(CUSTOMERS);
    const interna = cust.uf === 'PR';
    const venda: Partial<BuildItem> = { cfop: interna ? '5102' : '6102', icms, pis: simples ? '49' : '01', ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
    const remessa: Partial<BuildItem> = { cfop: interna ? pick2(['5949', '5915']) : pick2(['6912', '6949']), icms: simples ? icms : { table: 'CST', code: '41' }, pis: '08', ibscbs: { cst: '410', cClassTrib: '410999' } };
    const n = 1 + Math.floor(r2() * 3);
    const items: Partial<BuildItem>[] = Array.from({ length: n }, (_, k) => {
      switch (sc) {
        case 'ok_remessa': return remessa;
        case 'err_cclass': return k === 0 ? { ...remessa, ibscbs: { cst: '410', cClassTrib: '000001' } } : remessa;
        case 'err_valores': return k === 0 ? { ...remessa, ibscbs: { cst: '410', cClassTrib: '410999', valores: true } } : remessa;
        case 'err_grupo': return k === 0 ? { ...venda, ibscbs: undefined } : venda;
        default: return venda;
      }
    });
    const day = Math.floor((i / count) * 98);
    const issuedAt = new Date(Date.UTC(2026, 7, 4 + day, 16, Math.floor(r2() * 59)));
    const isRemessa = sc === 'ok_remessa' || sc === 'err_cclass' || sc === 'err_valores';
    const { xml } = buildNfe({
      uf: '41',
      issuedAt,
      number: startNumber + i,
      series: 2,
      natOp: isRemessa ? 'REMESSA PARA DEMONSTRACAO' : 'VENDA DE MERCADORIA',
      emitter: { cnpj: client.cnpj, name: client.name, crt, ...MARINGA },
      recipient: { cnpj: cust.cnpj, name: cust.name, city: cust.city, cityCode: cust.cityCode, uf: cust.uf },
      cStat: sc === 'cancelada' ? '101' : undefined,
      items: items.map((p, k) => {
        const prod = pick2(PRODUCTS);
        return { code: String(500 + k), description: prod.description, ncm: prod.ncm, cfop: '5102', qty: 1 + Math.floor(r2() * 20), unit: Math.round(80 + r2() * 900), icms, ...p } as BuildItem;
      }),
    });
    await ingestXml(clientId, xml);
  }
}

async function main() {
  console.log('Limpando e criando dados de demonstração…');
  await prisma.finding.deleteMany();
  await prisma.documentItem.deleteMany();
  await prisma.document.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.auditRun.deleteMany();
  await prisma.establishment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.office.deleteMany();
  await prisma.rule.deleteMany();

  for (const r of RULES) await prisma.rule.create({ data: { ...r, definition: JSON.stringify(r.definition) } });

  const office = await prisma.office.create({ data: { name: 'Escritório Nay Contábil', cnpj: cnpjFrom('458812340001') } });
  const profile = await prisma.profile.create({
    data: { officeId: office.id, name: 'Analista fiscal', permissions: JSON.stringify(['inicio', 'importar', 'clientes', 'notas', 'auditoria', 'auditoria.rodar', 'clientes.gerenciar', 'nfse', 'simulador', 'creditos', 'ia', 'ajuda']) },
  });
  const hash = await bcrypt.hash('nay12345', 10);
  await prisma.user.create({ data: { name: 'Administrador', email: 'admin@nayfiscal.dev', passwordHash: hash, role: 'ADMIN', officeId: office.id } });
  await prisma.user.create({ data: { name: 'Nayara', email: 'analista@nayfiscal.dev', passwordHash: hash, role: 'ANALISTA', officeId: office.id, profileId: profile.id } });

  const CLIENTS = [
    { name: 'Empresa Exemplo Industria', cnpj: '11222333000181', regime: 'LUCRO_REAL', count: 298, err: 0.37, start: 4201 },
    { name: 'Ateliê Sertão Couros', cnpj: cnpjFrom('112089990001'), regime: 'SIMPLES_NACIONAL', count: 70, err: 0.09, start: 1501 },
    { name: 'Mercearia Boa Praça', cnpj: cnpjFrom('276631110001'), regime: 'LUCRO_PRESUMIDO', count: 90, err: 0.22, start: 8801 },
    { name: 'Gráfica Ipê Roxo', cnpj: cnpjFrom('098715550001'), regime: 'SIMPLES_NACIONAL', count: 45, err: 0.04, start: 301 },
    { name: 'Transportes Rio Doce', cnpj: cnpjFrom('145529990001'), regime: 'LUCRO_REAL', count: 80, err: 0.45, start: 7001 },
  ];
  for (const c of CLIENTS) {
    const client = await prisma.client.create({
      data: {
        officeId: office.id, name: c.name, tradeName: c.name, cnpj: c.cnpj, regime: c.regime, ...MARINGA, cnae: '3101-2/00',
        establishments: { create: [{ label: 'Matriz', cnpj: c.cnpj, isMatriz: true }] },
      },
    });
    // ~20% das notas da carteira sao emitidas pelo proprio cliente (saidas)
    const saidas = Math.round(c.count / 4);
    process.stdout.write(`  ${c.name}: ${c.count} entradas e ${saidas} saídas… `);
    await seedClientNotes(client.id, c, c.count, c.err, c.start);
    await seedClientSaidas(client.id, c, saidas, 20000 + c.start);
    console.log('ok');
  }
  await prisma.notification.create({ data: { officeId: office.id, type: 'AUDIT_DONE', title: 'Auditoria concluída', message: 'As notas de demonstração foram importadas e auditadas.', link: '/auditoria', severity: 'SUCCESS' } });
  console.log('Pronto. Entre com admin@nayfiscal.dev ou analista@nayfiscal.dev, senha nay12345.');
}

main().finally(() => prisma.$disconnect());
