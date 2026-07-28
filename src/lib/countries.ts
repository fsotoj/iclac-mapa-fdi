import i18n from '@/i18n'

// `cn` es la etiqueta interna del proyecto; BCP-47 no la conoce, el tag válido es
// `zh`. Importa para todo lo que sea `Intl`: con 'cn' el Collator no reconoce el
// idioma y cae a orden de codepoint, que no es el orden de nadie — ni pinyin ni
// trazos. Se veía en la lista de países: 乌拉圭 antes que 阿根廷.
export const intlLocale = (lang: string): string =>
  lang.startsWith('cn') || lang.startsWith('zh') ? 'zh' : lang

// El país llega en inglés desde la base (`Brazil`, `Peru`); el nombre mostrado sale
// de `country.*`, mismo patrón que `sector.*`. El valor crudo queda de respaldo: un
// país que entre a la base antes que su string igual se dibuja, sólo que sin
// traducir. Las claves cubren todo `data/schema/countries.csv`, no sólo los 13 con
// datos, para que sumar un país no obligue a tocar los locales.
export const localizedCountry = (name: string, lang?: string): string =>
  i18n.t(`country.${name}`, { lng: lang, defaultValue: name })

// Comparador por nombre **mostrado**: ordenar por el inglés deja la lista en un
// orden arbitrario para quien la lee en español o en chino.
export const byLocalizedCountry = (lang: string): ((a: string, b: string) => number) => {
  const collator = new Intl.Collator(intlLocale(lang))
  return (a, b) => collator.compare(localizedCountry(a, lang), localizedCountry(b, lang))
}
