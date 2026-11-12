/** Limites de envio. Protegem memoria e CPU contra arquivos enormes e "zip bombs". */
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024; // por arquivo enviado
export const MAX_UPLOAD_TOTAL_BYTES = 50 * 1024 * 1024; // soma dos arquivos de um envio
export const MAX_XML_BYTES = 5 * 1024 * 1024; // um XML fiscal real tem poucos KB
export const MAX_ZIP_ENTRIES = 5000; // entradas no indice do ZIP (inclusive pastas e outros tipos)
export const MAX_ZIP_XMLS = 3000;
export const MAX_ZIP_TOTAL_BYTES = 150 * 1024 * 1024; // descompactado
export const MAX_ZIP_RATIO = 200; // tamanho descompactado / compactado por entrada
