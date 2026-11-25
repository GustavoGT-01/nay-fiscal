import { describe, expect, it } from 'vitest';
import { aliquotaEfetiva, simular, PARCELA_SUBSTITUIDA } from '../src/simples.js';
import { cnpjValido, onlyDigits } from '../src/index.js';

// Valores de referencia calculados a mao a partir das tabelas da LC 123/2006 (Anexos I a III):
// efetiva = (RBT12 x aliquota nominal - parcela a deduzir) / RBT12.
describe('alíquota efetiva do Simples', () => {
  it('1ª faixa não tem parcela a deduzir: a efetiva é a própria alíquota nominal', () => {
    expect(aliquotaEfetiva('I', 180_000)).toMatchObject({ faixa: 1, nominal: 0.04, deduzir: 0, efetiva: 0.04 });
    expect(aliquotaEfetiva('III', 100_000).efetiva).toBeCloseTo(0.06, 10);
  });

  it('Anexo I, RBT12 de R$ 360 mil: (360000 x 7,3% - 5940) / 360000 = 5,65%', () => {
    const a = aliquotaEfetiva('I', 360_000);
    expect(a.faixa).toBe(2);
    expect(a.efetiva).toBeCloseTo(0.0565, 10);
  });

  it('Anexo III, RBT12 de R$ 600 mil: (600000 x 13,5% - 17640) / 600000 = 10,56%', () => {
    const a = aliquotaEfetiva('III', 600_000);
    expect(a.faixa).toBe(3);
    expect(a.efetiva).toBeCloseTo(0.1056, 10);
  });

  it('o limite da faixa pertence à faixa de baixo; um centavo acima muda de faixa', () => {
    expect(aliquotaEfetiva('II', 180_000).faixa).toBe(1);
    expect(aliquotaEfetiva('II', 180_000.01).faixa).toBe(2);
    expect(aliquotaEfetiva('II', 4_800_000).faixa).toBe(6);
  });

  it('sem faturamento usa a alíquota nominal; acima de R$ 4,8 milhões fica na última faixa e avisa', () => {
    expect(aliquotaEfetiva('I', 0).efetiva).toBe(0.04);
    const acima = aliquotaEfetiva('I', 5_000_000);
    expect(acima.acimaDoLimite).toBe(true);
    expect(acima.faixa).toBe(6);
    expect(aliquotaEfetiva('I', 4_800_000).acimaDoLimite).toBe(false);
  });

  it('a efetiva nunca é negativa nem passa da nominal', () => {
    for (const anexo of ['I', 'II', 'III'] as const) {
      for (const rbt12 of [1, 50_000, 180_001, 500_000, 1_000_000, 3_000_000, 4_800_000]) {
        const a = aliquotaEfetiva(anexo, rbt12);
        expect(a.efetiva).toBeGreaterThanOrEqual(0);
        expect(a.efetiva).toBeLessThanOrEqual(a.nominal);
      }
    }
  });
});

describe('simulador Simples puro x híbrido', () => {
  const base = { anexo: 'I' as const, faturamentoMensal: 30_000, vendasB2B: 0.5, comprasComCredito: 10_000, aliquotaReferencia: 0.265 };

  it('calcula DAS, IVA e custo extra do híbrido (conta feita à mão)', () => {
    const r = simular(base);
    expect(r.rbt12).toBe(360_000);
    expect(r.efetiva).toBeCloseTo(0.0565, 10);
    expect(r.dasPuro).toBeCloseTo(1695, 6); // 30000 x 5,65%
    expect(r.dasHibrido).toBeCloseTo(1695 * (1 - PARCELA_SUBSTITUIDA.I), 6); // 855,975
    expect(r.debito).toBeCloseTo(7950, 6); // 30000 x 26,5%
    expect(r.credito).toBeCloseTo(2650, 6); // 10000 x 26,5%
    expect(r.ivaHibrido).toBeCloseTo(5300, 6);
    expect(r.custoHibrido).toBeCloseTo(6155.975, 6);
    expect(r.custoExtra).toBeCloseTo(4460.975, 6);
  });

  it('ganho dos clientes B2B com o crédito cheio do híbrido', () => {
    const r = simular(base);
    expect(r.creditoClientesPuro).toBeCloseTo(419.5125, 6); // 15000 x 5,65% x 49,5%
    expect(r.creditoClientesHibrido).toBeCloseTo(3975, 6); // 15000 x 26,5%
    expect(r.ganhoClientes).toBeCloseTo(3555.4875, 6);
  });

  it('recomenda o puro quando o ganho dos clientes não cobre o custo extra', () => {
    expect(simular(base).recomendado).toBe('puro');
  });

  it('recomenda o híbrido quando vende só para empresas e compra tudo com crédito', () => {
    const r = simular({ ...base, vendasB2B: 1, comprasComCredito: 30_000 });
    expect(r.ivaHibrido).toBe(0); // crédito igual ao débito
    expect(r.custoExtra).toBeLessThan(0); // sai mais barato que o puro
    expect(r.recomendado).toBe('hibrido');
  });

  it('o IVA do híbrido nunca é negativo, mesmo com crédito maior que o débito', () => {
    const r = simular({ ...base, comprasComCredito: 1_000_000 });
    expect(r.ivaHibrido).toBe(0);
  });
});

describe('CNPJ', () => {
  it('valida pelos dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false); // DV errado
  });

  it('recusa tamanho errado e sequências repetidas', () => {
    expect(cnpjValido('')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });

  it('onlyDigits tira tudo que não é dígito', () => {
    expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181');
    expect(onlyDigits('abc')).toBe('');
  });
});
