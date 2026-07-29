// Interpretación de los montos que la IA transcribe de la boleta.
//
// La IA copia el texto impreso tal cual ("$66.791,73") y acá se decide qué
// separador es de miles y cuál es decimal. Pedirle a ella que devolviera el
// número ya normalizado fue la causa de un error de 100x: el prompt decía
// "sin puntos ni símbolos" — le ordenaba borrar el punto — y no decía nada de
// la coma decimal, que además JSON no acepta dentro de un número. Un total de
// $66.792 entró como $6.679.173.
//
// La regla es determinística y no depende del criterio de nadie: el ÚLTIMO
// separador manda, y solo es decimal si lo siguen 1 o 2 dígitos. En Chile los
// miles siempre van de a 3 ("$58.708"), así que la distinción no es ambigua.

/** Separador seguido de 1-2 dígitos = decimal; de 3 = miles. */
function esSeparadorDecimal(sufijo: string): boolean {
  return sufijo.length > 0 && sufijo.length <= 2 && /^\d+$/.test(sufijo)
}

// Devuelve el número tal cual viene (conserva decimales). Acepta también un
// number ya parseado, para no romper si el modelo igual responde con número.
export function parsearNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor !== 'string') return null

  // Fuera símbolos de moneda, espacios y cualquier texto ("$", "CLP", "Lt").
  const limpio = valor.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(limpio)) return null

  const negativo = limpio.trimStart().startsWith('-')
  const cuerpo = limpio.replace(/-/g, '')

  const posDecimal = Math.max(cuerpo.lastIndexOf('.'), cuerpo.lastIndexOf(','))
  let entero = cuerpo
  let decimales = ''
  if (posDecimal >= 0 && esSeparadorDecimal(cuerpo.slice(posDecimal + 1))) {
    entero = cuerpo.slice(0, posDecimal)
    decimales = cuerpo.slice(posDecimal + 1)
  }

  const soloDigitos = entero.replace(/[.,]/g, '')
  if (soloDigitos !== '' && !/^\d+$/.test(soloDigitos)) return null

  const n = Number(`${soloDigitos || '0'}.${decimales || '0'}`)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

// Monto en pesos: se redondea al peso. Los centavos que traen algunos
// marketplaces ($66.791,73) no aportan nada y la tolerancia de cuadre los
// absorbe de sobra.
export function parsearMontoCLP(valor: unknown): number | null {
  const n = parsearNumero(valor)
  return n == null ? null : Math.round(n)
}
