import ExcelJS from 'exceljs';
import type { Rule } from '@prisma/client';
import { presentFinding } from './present.js';
import { actionLabel } from './filters.js';
import type * as findingModel from '../models/finding.js';

type ExportFinding = Awaited<ReturnType<typeof findingModel.listForExport>>[number];

export const EXPORT_HEADER = ['Nota', 'Série', 'Emissão', 'Emitente', 'CNPJ emitente', 'Item', 'CFOP', 'Regra', 'Severidade', 'Está no XML', 'Deveria ser', 'Como corrigir', 'Base legal', 'Chave', 'Direção', 'O que fazer'];

/** Linhas do relatorio de auditoria (uma por achado), na ordem de EXPORT_HEADER. */
export function exportRows(findings: ExportFinding[], rules: Map<string, Rule>) {
  return findings.map((f) => {
    const p = presentFinding(f, rules.get(f.ruleCode), f.item, f.document);
    return [f.document.number, f.document.series, f.document.issuedAt.toLocaleDateString('pt-BR'), f.document.emitterName, f.document.emitterCnpj, f.item?.n ?? '', f.item?.cfop ?? '', p.title, p.severity, p.observed, p.expected, p.how ?? '', p.legalBasis ?? '', f.document.key, f.document.direction === 'saida' ? 'Saída' : 'Entrada', actionLabel(f.document.direction, p.action, p.severity)];
  });
}

/**
 * Injecao de formula (CSV injection): textos do XML como `=HYPERLINK(...)` ou `@SUM(...)`
 * virariam formula ao abrir no Excel. Prefixar com apostrofo faz o Excel tratar como texto.
 * Numeros negativos (-12,50) continuam numeros.
 */
export function neutralizeFormula(s: string) {
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)*$/.test(s)) return `'${s}`;
  return s;
}

/** CSV com BOM (o Excel abre com acentos certos) e ponto e virgula. */
export function toCsv(rows: unknown[][]) {
  const esc = (v: unknown) => `"${neutralizeFormula(String(v ?? '')).replaceAll('"', '""')}"`;
  return '﻿' + [EXPORT_HEADER, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export async function toXlsx(client: { name: string; cnpj: string }, rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Resumo');
  sum.addRow(['Nay Fiscal — Relatório de auditoria']).font = { bold: true, size: 14 };
  sum.addRow([client.name, client.cnpj]);
  sum.addRow([]);
  sum.addRow(['Regra', 'Achados']).font = { bold: true };
  const byRule = new Map<string, number>();
  rows.forEach((r) => byRule.set(String(r[7]), (byRule.get(String(r[7])) ?? 0) + 1));
  [...byRule].sort((a, b) => b[1] - a[1]).forEach((r) => sum.addRow(r));
  sum.columns = [{ width: 50 }, { width: 14 }];
  const ws = wb.addWorksheet('Achados');
  ws.addRow(EXPORT_HEADER).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => (c.width = 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
