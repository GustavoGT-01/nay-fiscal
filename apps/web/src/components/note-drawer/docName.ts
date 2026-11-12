/** Nome do documento pelo modelo. */
export const docName = (model: string) => (model === '57' ? 'CT-e' : model === '65' ? 'NFC-e' : model === 'NFSE' ? 'NFS-e' : 'NF-e');
