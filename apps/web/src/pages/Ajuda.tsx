import { dataBR, REFORMA } from '@nay/shared';

const pct = (fracao: number) => (fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const FAQ:{ q: string; a: string }[] = [
  { q: 'Como importo as notas?', a: 'Na tela Importar, solte os XMLs ou um ZIP (NF-e, NFC-e, CT-e e NFS-e). A auditoria roda sozinha e você pode continuar usando o sistema enquanto isso. O cliente é escolhido no envio ou reconhecido pelo CNPJ das notas.' },
  { q: 'O que são as notas de entrada e de saída?', a: 'Entrada é a nota em que o cliente compra (ele é o destinatário): a pergunta é se o crédito de IBS/CBS vale. Saída é a nota que o cliente emite: a pergunta é se ela foi emitida certa. Os vereditos mudam de acordo com isso.' },
  { q: 'O que significa "Crédito em risco"?', a: 'A nota de entrada tem pelo menos um erro. O crédito de IBS/CBS pode ser questionado até o fornecedor corrigir. A tela Créditos soma esse valor por fornecedor.' },
  { q: 'Quando preciso cancelar e reemitir uma nota?', a: 'Quando o erro está em campo que define o imposto. Nos demais casos, uma carta de correção resolve. A Auditoria diz qual é o caso de cada regra e o que pedir ao fornecedor.' },
  { q: 'Como funciona o cruzamento com o SPED?', a: 'Envie o arquivo .txt do SPED Fiscal na tela Importar. Ele é lido só para consulta e comparado, pela chave de acesso, com as notas já importadas: valor, ICMS, situação, operação, nota sem XML e XML fora do SPED. Os resultados ficam na aba SPED da Auditoria. Nada é alterado nas notas.' },
  { q: 'Por que o ISS abaixo de 2% aparece como "a verificar"?', a: 'A lei fixa o piso de 2% e o teto de 5%, mas há exceções legais (construção civil, transporte coletivo, Simples Nacional). A regra só vira erro quando a faixa do município está cadastrada.' },
  { q: 'Desde quando o grupo IBS/CBS é obrigatório?', a: `Desde ${dataBR(REFORMA.grupoObrigatorioDesde)} nas NF-e emitidas. Em 2026 a Reforma está em fase de teste, com alíquotas de teste de ${pct(REFORMA.cbsTeste)}% de CBS e ${pct(REFORMA.ibsTeste)}% de IBS.` },
  { q: 'Posso mandar o link de uma nota para um colega?', a: 'Sim. Ao abrir uma nota, o endereço da página passa a guardar a nota aberta. Copie o link do navegador e envie: quem tiver acesso ao escritório abre a mesma nota.' },
  { q: 'Os avisos do sino somem para todo mundo quando eu leio?', a: 'Não. Cada pessoa tem a própria leitura: o que você marca como lido continua não lido para os colegas.' },
];

const GLOSSARIO: [string, string][] = [
  ['IBS e CBS', 'Os novos tributos sobre consumo da Reforma Tributária, que substituem ICMS/ISS e PIS/Cofins ao longo da transição.'],
  ['cClassTrib', 'Classificação tributária do item no IBS/CBS (seis dígitos). Define a alíquota e o tratamento do item.'],
  ['CST', 'Código de situação tributária do item, por tributo.'],
  ['CRT', 'Código de regime tributário do emitente: 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 regime normal.'],
  ['CFOP', 'Código fiscal de operações: diz o que a nota representa (venda, remessa, devolução).'],
  ['SPED Fiscal', 'Escrituração digital de ICMS/IPI entregue ao Fisco. Aqui é lida só para comparar com os XMLs.'],
];

const ATALHOS: [string, string][] = [
  ['Buscar nota, regra ou tela', 'Ctrl K'],
  ['Fechar painel ou aviso', 'Esc'],
  ['Abrir a nota da linha', 'Enter'],
  ['Ordenar uma coluna', 'Clique no título'],
];

export function Ajuda() {
  return (
    <section className="view on" aria-labelledby="h-ajuda">
      <h1 id="h-ajuda">Ajuda</h1>
      <p className="lede">Como usar a Nay Fiscal, o que cada veredito quer dizer e onde está a base de cada regra.</p>
      <div className="two" style={{ marginTop: 18 }}>
        <div className="panel faq">
          <h2>Perguntas frequentes</h2>
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
        <div className="stack">
          <div className="panel">
            <h2>Atalhos</h2>
            <div className="pair" style={{ marginTop: 12 }}>
              {ATALHOS.map(([nome, tecla]) => <div key={nome}><small>{nome}</small><span className="mono">{tecla}</span></div>)}
            </div>
          </div>
          <div className="panel">
            <h2>Glossário</h2>
            <dl style={{ margin: '10px 0 0', display: 'grid', gap: 8 }}>
              {GLOSSARIO.map(([t, d]) => <div key={t}><dt style={{ fontWeight: 700, fontSize: 13 }}>{t}</dt><dd className="hint" style={{ margin: 0 }}>{d}</dd></div>)}
            </dl>
          </div>
          <div className="panel">
            <h2>Precisa de ajuda?</h2>
            <p className="hint" style={{ marginTop: 8 }}>Dúvidas sobre as regras ou o uso? Fale com quem administra a Nay Fiscal no seu escritório. Cada achado da Auditoria traz o motivo e o que pedir ao fornecedor.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
