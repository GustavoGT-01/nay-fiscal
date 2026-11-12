/** Escapa texto vindo do XML ou do banco antes de por no HTML. */
export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dec = (v: number, max = 4) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: max });
export const TZ = 'America/Sao_Paulo';
export const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: TZ }) : '');
export const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
export const fmtDoc = (c: string) =>
  c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : c.length === 11 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : c;
export const fmtCep = (c: string) => (/^\d{8}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
export const fmtKey = (k: string) => k.replace(/(\d{4})(?=\d)/g, '$1 ');

export const MOD_FRETE: Record<string, string> = {
  '0': '0 - Por conta do emitente', '1': '1 - Por conta do destinatário', '2': '2 - Por conta de terceiros',
  '3': '3 - Próprio, do remetente', '4': '4 - Próprio, do destinatário', '9': '9 - Sem frete',
};
export const SEV_LABEL: Record<string, string> = { erro: 'Erro', atencao: 'Atenção', a_verificar: 'A verificar', ok: 'OK' };

export const box = (label: string, value: string, cls = '') => `<div class="f ${cls}"><small>${esc(label)}</small><span>${value || '&nbsp;'}</span></div>`;
