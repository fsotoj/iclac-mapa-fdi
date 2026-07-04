# data/external — fuentes externas de referencia

## unctad_fdi_stock.csv

Stock de FDI **inward** anual por país, US$ millones a precios corrientes. 13 países del proyecto, 1990–2024 (Surinam desde 2011; Brasil sin dato 2000 — gap del bulk original).

- **Fuente:** UNCTADstat, dataset `US.FdiFlowsStock` (filtrado a `Flow=09 Stock`, `Direction=1 Inward`).
- **Descarga:** `https://unctadstat-api.unctad.org/bulkdownload/US.FdiFlowsStock/US_FdiFlowsStock` (7z con CSV adentro; el `tar` de Windows 11 lo extrae). Sin API key. Release usado: 2025-08.
- **Refresh:** 1 vez al año, tras el World Investment Report (junio). Re-descargar, re-filtrar a los 13 países (códigos M49: ARG 32, BOL 68, BRA 76, CHL 152, COL 170, ECU 218, GUY 328, PAN 591, PRY 600, PER 604, SUR 740, URY 858, VEN 862), regenerar este CSV con las columnas `iso3,country,year,stock_musd`.
- **Consumidor:** `scripts/build_fdi_share.mjs` (análisis métrica FDI share, docs/sprint_4/).

## imf_cdis_china.csv

Posición de inversión directa inward **desde China** (contraparte inmediata) por país-año, US$ millones. 13 países del proyecto.

- **Fuente:** FMI, dataset `IMF.STA:DIP` (Direct Investment Positions, ex-CDIS), indicador `INWD_D_NETLA_FALL_ALL` (posición inward total, todos los instrumentos), contraparte `CHN`.
- **Descarga:** `https://api.imf.org/external/sdmx/2.1/data/IMF.STA,DIP/ARG+BOL+BRA+CHL+COL+ECU+GUY+PAN+PRY+PER+SUR+URY+VEN..INWD_D_NETLA_FALL_ALL.CHN.A?startPeriod=2009` (XML SDMX; valores en USD planos → dividir por 1e6). Sin API key.
- **`dv_type`:** `SCC` = encuesta CDIS estándar (los 13 países, 2018–2024); `O` = vintage anterior (9 países, historia pre-2018). El script prefiere `SCC` y rellena con `O`.
- **Advertencia:** atribución por contraparte **inmediata** — subestima China por conduits (HK/Caimán/BVI). Se usa como comparador de brecha (métrica 2b), no como cifra de inversión china real.
- **Refresh:** anual, junto con el de UNCTAD.
- **Consumidor:** `scripts/build_fdi_share.mjs` (hojas `cdis_brecha`/`cdis_resumen`).
