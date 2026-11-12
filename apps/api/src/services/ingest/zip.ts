import yauzl from 'yauzl';

/** Extrai os .xml de um ZIP em memoria. */
export function xmlsFromZip(buf: Buffer): Promise<{ name: string; xml: string }[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('ZIP inválido'));
      const out: { name: string; xml: string }[] = [];
      zip.readEntry();
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName) || !/\.xml$/i.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e);
          const chunks: Buffer[] = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            out.push({ name: entry.fileName, xml: Buffer.concat(chunks).toString('utf8') });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
    });
  });
}
