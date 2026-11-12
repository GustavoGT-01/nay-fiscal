import yauzl from 'yauzl';
import { MAX_XML_BYTES, MAX_ZIP_ENTRIES, MAX_ZIP_RATIO, MAX_ZIP_TOTAL_BYTES, MAX_ZIP_XMLS } from './limits.js';

const fail = (msg: string) => Object.assign(new Error(msg), { statusCode: 400 });

/**
 * Extrai os .xml de um ZIP em memoria, com limites contra zip bomb:
 * numero de entradas, tamanho por XML, taxa de compressao e total descompactado.
 * Os bytes sao contados no fluxo real (nao so no cabecalho, que pode mentir).
 */
export function xmlsFromZip(buf: Buffer): Promise<{ name: string; xml: string }[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false }, (err, zip) => {
      if (err || !zip) return reject(fail('ZIP inválido ou corrompido.'));
      if (zip.entryCount > MAX_ZIP_ENTRIES) {
        zip.close();
        return reject(fail(`O ZIP tem ${zip.entryCount} arquivos; o limite é ${MAX_ZIP_ENTRIES}. Divida em partes menores.`));
      }
      const out: { name: string; xml: string }[] = [];
      let total = 0;
      let done = false;
      const stop = (e: Error) => {
        if (done) return;
        done = true;
        zip.close();
        reject(e);
      };
      zip.readEntry();
      zip.on('entry', (entry: yauzl.Entry) => {
        if (done) return;
        if (/\/$/.test(entry.fileName) || !/\.xml$/i.test(entry.fileName)) return zip.readEntry();
        if (out.length >= MAX_ZIP_XMLS) return stop(fail(`O ZIP tem mais de ${MAX_ZIP_XMLS} XMLs. Divida em partes menores.`));
        if (entry.uncompressedSize > MAX_XML_BYTES) return stop(fail(`${entry.fileName} é grande demais para um XML fiscal.`));
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_ZIP_RATIO) {
          return stop(fail(`${entry.fileName} tem compressão suspeita (possível zip bomb).`));
        }
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return stop(fail('ZIP inválido ou corrompido.'));
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (c: Buffer) => {
            size += c.length;
            total += c.length;
            if (size > MAX_XML_BYTES || total > MAX_ZIP_TOTAL_BYTES) {
              stream.destroy();
              return stop(fail('O conteúdo do ZIP passa do limite de tamanho.'));
            }
            chunks.push(c);
          });
          stream.on('error', () => stop(fail('ZIP inválido ou corrompido.')));
          stream.on('end', () => {
            if (done) return;
            out.push({ name: entry.fileName, xml: Buffer.concat(chunks).toString('utf8') });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        if (!done) { done = true; resolve(out); }
      });
      zip.on('error', () => stop(fail('ZIP inválido ou corrompido.')));
    });
  });
}
