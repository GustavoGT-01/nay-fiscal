// tema salvo, aplicado antes do React (arquivo proprio: a CSP nao permite script inline)
try { var t = localStorage.getItem('nay.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignora */ }
