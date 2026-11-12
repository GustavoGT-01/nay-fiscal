/**
 * Gera XMLs de exemplo de NFS-e nacional em fixtures/xml/nfse/ para testar a importacao.
 * Tomador: Empresa Exemplo Industria (CNPJ dos dados de demonstracao). Prestadores ficticios.
 * Uso: npm run exemplos:nfse
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNfse, type BuildNfse } from './demo/nfse-builder.js';
import { cnpjFrom } from './demo/nfe-builder.js';

const OUT = fileURLToPath(new URL('../../../fixtures/xml/nfse/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const EXEMPLO = { doc: '11222333000181', name: 'EMPRESA EXEMPLO INDUSTRIA LTDA', cityCode: '4115200', city: 'Maringá', uf: 'PR' };
const MGA = { cityCode: '4115200', city: 'Maringá', uf: 'PR' };
const base = { issuedAt: new Date('2026-10-20T10:00:00-03:00'), taker: EXEMPLO, ibscbs: true };

const casos: [string, Partial<BuildNfse> & Pick<BuildNfse, 'number' | 'provider' | 'serviceCode' | 'description' | 'value' | 'rate'>][] = [
  ['01-correta-manutencao.xml', { number: 1201, provider: { cnpj: cnpjFrom('445566770001'), name: 'Manutenção Industrial Paraná Ltda', im: '45871', ...MGA, simples: '3' }, serviceCode: '140101', description: 'Manutenção de máquinas de costura industrial', value: 3200, rate: 3 }],
  ['02-erro-aliquota-6.xml', { number: 88, provider: { cnpj: cnpjFrom('556677880001'), name: 'Consultoria Tributária Alfa', im: '99102', ...MGA, simples: '1' }, serviceCode: '170101', description: 'Consultoria tributária sobre a Reforma', value: 5000, rate: 6 }],
  ['03-erro-calculo-iss.xml', { number: 412, provider: { cnpj: cnpjFrom('667788990001'), name: 'Fretes Rápidos Maringá', im: '30441', ...MGA, simples: '3' }, serviceCode: '160201', description: 'Transporte municipal de mercadorias', value: 1800, rate: 2, issOverride: 18 }],
  ['04-retencao-com-irrf.xml', { number: 77, provider: { cnpj: cnpjFrom('778899000001'), name: 'Engenharia Norte Projetos', im: '55120', ...MGA, simples: '1' }, serviceCode: '070301', description: 'Projeto de layout fabril', value: 12000, rate: 5, retention: '2', irrf: 180 }],
  ['05-atencao-sem-ibscbs.xml', { number: 905, provider: { cnpj: cnpjFrom('889900110001'), name: 'Limpeza Brilho Total', im: '61230', ...MGA, simples: '3' }, serviceCode: '070101', description: 'Limpeza e conservação de galpão', value: 2400, rate: 2, ibscbs: false }],
];

for (const [file, c] of casos) {
  const { xml } = buildNfse({ ...base, ...c } as BuildNfse);
  writeFileSync(OUT + file, xml, 'utf8');
  console.log('  ' + file);
}
console.log(`Pronto: ${casos.length} NFS-e em fixtures/xml/nfse/. Importe pela tela Importar.`);
