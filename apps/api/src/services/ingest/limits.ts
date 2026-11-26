import { LIMITES_ENVIO } from '@nay/shared';

/** Limites de envio (os de arquivo vem de @nay/shared, que a tela tambem usa). Protegem memoria e CPU contra arquivos enormes e "zip bombs". */
export const MAX_UPLOAD_FILES = LIMITES_ENVIO.arquivos;
export const MAX_UPLOAD_FILE_BYTES = LIMITES_ENVIO.bytesPorArquivo; // por arquivo enviado
export const MAX_UPLOAD_TOTAL_BYTES = LIMITES_ENVIO.bytesTotal; // soma dos arquivos de um envio
export const MAX_XML_BYTES = LIMITES_ENVIO.bytesPorXml;
export const MAX_ZIP_ENTRIES = 5000; // entradas no indice do ZIP (inclusive pastas e outros tipos)
export const MAX_ZIP_XMLS = 3000;
export const MAX_ZIP_TOTAL_BYTES = 150 * 1024 * 1024; // descompactado
export const MAX_ZIP_RATIO = 200; // tamanho descompactado / compactado por entrada
