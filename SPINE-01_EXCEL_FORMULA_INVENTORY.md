# SPINE-01 — Inventario Exhaustivo de Fórmulas del Libro Excel de Livonia Print

**Misión:** `SPINE-01 — LIVONIA SPINE CALCULATOR: REVERSE ENGINEERING & ENGINE CONTRACT`  
**Fuente auditada:** `Livonia print spine calculator 2.0 iekšējā lietošana.xlsx` (SHA-256 verificado sobre XML OOXML interno: `xl/worksheets/sheet1..6.xml`, `xl/drawings/vmlDrawing1..5.vml`, `xl/ctrlProps/ctrlProp1..63.xml`)  
**Modalidad:** Ingeniería inversa determinista (100 % trazable a coordenadas de celda y controles VML).  
**Restricciones de la fase:** Cero despliegues, cero migraciones productivas, cero modificaciones de tarifas BPE.

---

## 1. Estructura General del Archivo Excel (`workbook.xml`)

El libro contiene exactamente **6 hojas de cálculo** y **63 controles de formulario VML** (botones de opción `Radio` y cajas de grupo `GBox`) vinculados a celdas de control:

| Índice | Nombre de la hoja (`sheet.name`) | Archivo XML interno | Perfil industrial | Propósito |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `Mīkstais sējums(Alegro)` | `xl/worksheets/sheet1.xml` | **Alegro** (Müller Martini Alegro) | Tapa blanda estándar (cosida o encolada), 4 páginas de cubierta. |
| **2** | `Mīk. sēj. ar atlokiem (Alegro)` | `xl/worksheets/sheet2.xml` | **Alegro** (Müller Martini Alegro) | Tapa blanda con solapas (`atloki`), 6 paneles horizontales. |
| **3** | `Ciet. sēj. + Superv. (Colibri)` | `xl/worksheets/sheet3.xml` | **Colibri** (Kolbus / línea tapa dura) | Tapa dura (cartoné) con guardas (`PP lapas`), cartón (`pape`), cajo (`rastri`), ceja (`kantes`), vueltas (`noloki`) y sobrecubierta (`supervāks`). |
| **4** | `Flexi (Colibri)` | `xl/worksheets/sheet4.xml` | **Colibri** (Flexibound / Integra) | Encuadernación flexible sin solapas con vueltas de 15 mm. |
| **5** | `Flexi ar  atlokiem (Colibri)` | `xl/worksheets/sheet5.xml` | **Colibri** (Flexibound con solapas) | Encuadernación flexible con solapas (`atloks`) y vueltas superiores/inferiores de 15 mm. |
| **6** | `Papers` | `xl/worksheets/sheet6.xml` | **Biblioteca técnica Livonia** | 60 bloques de papeles comerciales (10 columnas × 6 bandas horizontales) con **375 pares `(gsm, microns)`** y factores `bulk`. |

---

## 2. Hoja 1 — `Mīkstais sējums(Alegro)` (Tapa Blanda Estándar · Perfil Alegro)

### 2.1 Controles de Formulario VML (`xl/drawings/vmlDrawing1.vml`)

| Control VML | Etiqueta (`v:textbox`) | Tipo | Celda vinculada (`x:FmlaLink`) | Valor numérico en celda | Estado en archivo guardado |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `ctrlProp4` | `Šūts` (Cosido) | `Radio` (`firstButton=1`) | `$L$4` | `1` | `Checked` (`L4 = 1`) |
| `ctrlProp5` | `Līmēts` (Encolado) | `Radio` | `$L$4` | `2` | No seleccionado |

### 2.2 Matriz Completa de Entradas, Fórmulas y Resultados (`sheet1.xml`)

| Coordenada | Etiqueta / Rol en Hoja | Tipo | Fórmula Exacta en XML (`<f>`) | Valor Cacheado (`<v>`) | Unidad | Clasificación |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| **`C7`** | `Lpp. 1` (Páginas segmento 1) | Entrada | — | `220` | páginas | Entrada de usuario |
| **`E7`** | `mikroni (µ)` (Espesor papel 1) | Entrada | — | `145` | µm | Entrada técnica (de `Papers`) |
| **`C8`** | `Lpp. 2` (Páginas segmento 2) | Entrada | — | `0` | páginas | Entrada de usuario |
| **`E8`** | `mikroni (µ)` (Espesor papel 2) | Entrada | — | `None` (`0`) | µm | Entrada técnica (de `Papers`) |
| **`C10`** | `Platums` (Ancho libro cortado $W$) | Entrada | — | `170` | mm | Entrada de usuario |
| **`E10`** | `vāks (µ) :` (Espesor cartulina cubierta $\mu_{\text{cov}}$) | Entrada | — | `270` | µm | Entrada técnica cubierta |
| **`C11`** | `Garums` (Alto libro cortado $H$) | Entrada | — | `240` | mm | Entrada de usuario |
| **`L4`** | `checkbox` (Selector `Apstrāde`: `1`=Šūts, `2`=Līmēts) | Control | Vinculado a Radio VML | `1` | enum | Selector de proceso |
| **`L2`** | `Block thickness` ($T_{\text{bloque}}$) | Intermedio | `=(C8/2)*(E8/1000)+(C7/2)*(E7/1000)` | `15.95` | mm | **Hecho matemático físico** |
| **`M2`** | `glued` (Lomo encolado $S_g$) | Intermedio | `=_xlfn.CEILING.MATH(L2+0.7,0.5)` | `17` | mm | **Parámetro industrial Alegro** (`+0.7 mm`, paso `0.5 mm`) |
| **`N2`** | `sewn` (Lomo cosido $S_s$) | Intermedio | `=_xlfn.CEILING.MATH(1.0718*(L2+(2*E10/1000)-0.66)+0.9964,0.5)` | `18` | mm | **Parámetro industrial Alegro** (regresión empírica con espesor de cubierta `E10`) |
| **`E14`** | `Muguriņas plat.` (Ancho de lomo activo $S$) | Salida | `=IF(L4=2,M2,IF(L4=1,N2,"select processing type"))` | `18` | mm | Salida principal |
| **`E16`** | `Vāka platums (ieskaitot 3mm pārlaidi)` | Salida | `=(C10*2)+E14+6` | `364` | mm | Ancho cubierta extendida con sangrado (`+6 mm` = `3 mm` izq + `3 mm` der) |
| **`E18`** | `Vāka augstums (ieskaitot 3 mm pārlaidi)` | Salida | `=C11+6` | `246` | mm | Alto cubierta extendida con sangrado (`+6 mm` = `3 mm` sup + `3 mm` inf) |
| **`C30`** | Cota esquema: Ancho contraportada neta | Esquema | `=C10` | `170` | mm | Cota visual |
| **`E30`** | Cota esquema: Lomo | Esquema | `=E14` | `18` | mm | Cota visual |
| **`F30`** | Cota esquema: Ancho portada neta | Esquema | `=C10` | `170` | mm | Cota visual |
| **`H30`** | Cota esquema: Alto neto libro | Esquema | `=C11` | `240` | mm | Cota visual |
| **`I30`** | Cota esquema: Alto total con sangrado | Esquema | `=E18` | `246` | mm | Cota visual |
| **`E39`** | Cota esquema: Ancho neto abierta sin sangrado | Esquema | `=C10*2+E14` | `358` | mm | Ancho neto cubierta cortada (`2W + S`) |
| **`E41`** | Cota esquema: Ancho total con sangrado | Esquema | `=E16` | `364` | mm | Ancho bruto con sangrado (`2W + S + 6`) |

> [!IMPORTANT]
> **Hallazgo clave sobre `+6 mm` en Hojas 1 y 2 (`E16`, `E18` vs `E39`):**  
> En la fila `E39` (`=C10*2+E14 = 358 mm`), Livonia calcula explícitamente el **ancho neto de la cubierta abierta sin sangrado**, y en `C17`/`C19` etiqueta `(ieskaitot 3mm pārlaidi)` ("incluyendo 3 mm de sangrado/trim por cada lado exterior"). Por tanto, queda **confirmado documentalmente** que en las Hojas 1 y 2 los `+6 mm` en ancho y alto corresponden exactamente a `2 × 3 mm` de sangrado perimetral (`bleed = 3 mm`).

---

## 3. Hoja 2 — `Mīk. sēj. ar atlokiem (Alegro)` (Tapa Blanda con Solapas · Perfil Alegro)

### 3.1 Controles de Formulario VML (`xl/drawings/vmlDrawing2.vml`)

| Control VML | Etiqueta (`v:textbox`) | Tipo | Celda vinculada (`x:FmlaLink`) | Valor numérico | Estado en archivo guardado |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `ctrlProp9` | `Šūts` (Cosido) | `Radio` (`firstButton=1`) | `$L$4` | `1` | `Checked` (`L4 = 1`) |
| `ctrlProp10` | `Līmēts` (Encolado) | `Radio` | `$L$4` | `2` | No seleccionado |

### 3.2 Matriz Completa de Entradas, Fórmulas y Resultados (`sheet2.xml`)

| Coordenada | Etiqueta / Rol en Hoja | Tipo | Fórmula Exacta en XML (`<f>`) | Valor Cacheado (`<v>`) | Unidad | Clasificación |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| **`C7`** | `Lpp. 1` (Páginas segmento 1) | Entrada | — | `504` | páginas | Entrada de usuario |
| **`E7`** | `mikroni (µ)` (Espesor papel 1) | Entrada | — | `116` | µm | Entrada técnica |
| **`C8`** | `Lpp. 2` (Páginas segmento 2) | Entrada | — | `0` | páginas | Entrada de usuario |
| **`E8`** | `mikroni (µ)` (Espesor papel 2) | Entrada | — | `0` | µm | Entrada técnica |
| **`C10`** | `Platums` (Ancho libro cortado $W$) | Entrada | — | `170` | mm | Entrada de usuario |
| **`E10`** | `vāks (µ) :` (Espesor cartulina cubierta $\mu_{\text{cov}}$) | Entrada | — | `350` | µm | Entrada técnica cubierta |
| **`C11`** | `Garums` (Alto libro cortado $H$) | Entrada | — | `297` | mm | Entrada de usuario |
| **`E11`** | `Atloku gar.` (Ancho de solapa $F$) | Entrada | — | `80` | mm | Entrada de usuario |
| **`L4`** | `checkbox` (`1`=Šūts, `2`=Līmēts) | Control | Vinculado a Radio VML | `1` | enum | Selector de proceso |
| **`L2`** | `Block thickness` ($T_{\text{bloque}}$) | Intermedio | `=(C8/2)*(E8/1000)+(C7/2)*(E7/1000)` | `29.232000000000003` | mm | Hecho matemático físico |
| **`M2`** | `glued` (Lomo encolado $S_g$) | Intermedio | `=_xlfn.CEILING.MATH(L2+0.7,0.5)` | `30` | mm | Parámetro industrial Alegro |
| **`N2`** | `sewn` (Lomo cosido $S_s$) | Intermedio | `=_xlfn.CEILING.MATH(1.0718*(L2+(2*E10/1000)-0.66)+0.9964,0.5)` | `32.5` | mm | Parámetro industrial Alegro |
| **`E14`** | `Muguriņas plat.` (Ancho de lomo activo $S$) | Salida | `=IF(L4=2,M2,IF(L4=1,N2,"select processing type"))` | `32.5` | mm | Salida principal |
| **`B22`** | Alerta de validación de solapas | Validación | `=IF(E11>C10-16,"Atloki pārāk lieli. Samazini atlokus.","")` | `""` | texto | **Regla industrial Alegro:** Solapa máxima $F_{\max} = W - 16\text{ mm}$ |
| **`B30`** | Esquema: Solapa izquierda neta | Esquema | `=E11` | `80` | mm | Panel solapa trasera |
| **`C30`** | Esquema: Contraportada + compensación giro solapa | Esquema | `=C10+2` | `172` | mm | **Parámetro Alegro:** `+2 mm` por panel (`W + 2`) para el doblez de la solapa |
| **`E30`** | Esquema: Lomo | Esquema | `=E14` | `32.5` | mm | Panel lomo |
| **`F30`** | Esquema: Portada + compensación giro solapa | Esquema | `=C10+2` | `172` | mm | **Parámetro Alegro:** `+2 mm` por panel (`W + 2`) |
| **`H30`** | Esquema: Solapa derecha neta | Esquema | `=E11` | `80` | mm | Panel solapa delantera |
| **`I30`** | Esquema: Alto neto libro | Esquema | `=C11` | `297` | mm | Alto neto |
| **`C33`** | Esquema: Cota de hendido/referencia (`C30+5`) | Esquema | `=C30+5` | `177` | mm | Cota auxiliar visual (`W + 7`) |
| **`F33`** | Esquema: Cota de hendido/referencia (`F30+5`) | Esquema | `=F30+5` | `177` | mm | Cota auxiliar visual (`W + 7`) |
| **`E39`** | Ancho neto cubierta abierta con solapas (sin sangrado) | Intermedio | `=B30+C30+E30+F30+H30` | `536.5` | mm | $2F + 2(W+2) + S = 536.5\text{ mm}$ |
| **`E16`** | `Vāka platums (ieskaitot 3mm pārlaidi)` | Salida | `=E39+6` | `542.5` | mm | $2F + 2(W+2) + S + 6 = 542.5\text{ mm}$ (`+3 mm` sangrado en extremo de cada solapa) |
| **`E18`** | `Vāka augstums (ieskaitot 3 mm pārlaidi)` | Salida | `=C11+6` | `303` | mm | $H + 6 = 303\text{ mm}$ (`+3 mm` sangrado sup/inf) |

---

## 4. Hoja 3 — `Ciet. sēj. + Superv. (Colibri)` (Tapa Dura + Sobrecubierta · Perfil Colibri)

### 4.1 Controles de Formulario VML (`xl/drawings/vmlDrawing3.vml`)

| Caja de Grupo (`GBox`) | Opción `Radio` | Celda Vinculada | Valor | Estado en archivo guardado | Significado Técnico |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`Apstrāde`** | `Šūts` / `Līmēts` | `$AA$6` | `1` / `2` | `1` (`Šūts` — Cosido) | Método de unión del bloque |
| **`PP lapas`** (Guardas) | `No bloka` / `Atsevišķi` | `$AA$8` | `1` / `2` | `2` (`Atsevišķi` — Guardas aparte) | `1` = Guardas del propio pliego (`+0 mm`); `2` = Guardas pegadas aparte (`+0.6 mm`) |
| **`Papes biezums`** (Cartón) | `1,0 mm` / `2,0 mm` / `2,4 mm` / `3,0 mm` | `$AA$10` | `1` / `2` / `3` / `4` | `4` (`3,0 mm`) | Espesor de cada cartón; en `AD10` almacena `2 × espesor` (`2`, `4`, `4.8`, `6 mm`) |
| **`Papīra krītojums`** | `Krītots` / `Nekrītots` | `$AA$12` | `1` / `2` | `2` (`Nekrītots` — No estucado) | Tipo de papel del bloque (afecta el ensanchamiento por cosido `Uzaugums`) |
| **`Muguriņas forma`** | `Apaļa` / `Taisna` | `$AA$14` | `1` / `2` | `1` (`Apaļa` — Lomo redondo) | Forma del lomo (`1`=Redondo, `2`=Recto/Cuadrado) |
| **`Kantes`** (Ceja) | `3,0 mm` / `2,5 mm` | `$AA$16` | `1` / `2` | `2` (`2,5 mm`) | Ceja superior/inferior/frontal; en `J16` suma `+6 mm` (`2×3.0`) o `+5 mm` (`2×2.5`) al alto del cartón |
| **`Locīšana`** (Pliegos) | `8/12/16` / `20/24/32` | `$AA$34` | `1` / `2` | `1` (`8/12/16` pág/pliego) | Páginas por signatura de plegado |

### 4.2 Matriz Completa de Entradas, Fórmulas y Resultados (`sheet3.xml`)

| Coordenada | Etiqueta / Rol en Hoja | Fórmula Exacta en XML (`<f>`) | Valor Cacheado (`<v>`) | Unidad / Notas de Ingeniería |
| :---: | :--- | :--- | :---: | :--- |
| **`C7`, `E7`** | `Lpp. 1`, `mikroni (µ)` | — | `192`, `172` | 192 páginas × 172 µm |
| **`C8`, `E8`** | `Lpp. 2`, `mikroni (µ)` | — | `None`, `None` | Segundo segmento vacío |
| **`C10`, `C11`** | `Platums` ($W$), `Garums` ($H$) | — | `170`, `240` | Formato bloque cortado: 170 × 240 mm |
| **`R18`** | `Supervāka atloki` ($F_{\text{dj}}$) | — | `80` | Ancho de solapa de sobrecubierta (80 mm) |
| **`AA2`** | `Block thickness` ($T_{\text{bloque}}$) | `=(C8/2)*(E8/1000)+(C7/2)*(E7/1000)` | `16.512` | Espesor neto del papel sin guardas (mm) |
| **`AD8`** | Adición por guardas (`PP lapas`) | `=IF(AA8=1,0,IF(AA8=2,0.6,""))` | `0.6` | `+0 mm` si van incluidas en pliego (`AA8=1`); `+0.6 mm` si son independientes (`AA8=2`) |
| **`AD2` / `B14`** | `Bloks+PP` ($T_{\text{total}}$) | `=AA2+AD8` | `17.112` | Espesor del bloque + guardas (mm) |
| **`AD10`** | Dos veces el espesor del cartón ($2 \times T_{\text{board}}$) | `=IF(AA10=1,2,IF(AA10=2,4,IF(AA10=3,4.8,IF(AA10=4,6,""))))` | `6` | Para cartón de `1.0, 2.0, 2.4, 3.0 mm`, devuelve `2, 4, 4.8, 6 mm` |
| **`AB2`** | `round sewn` (Fórmula histórica auxiliar no referenciada) | `=IF((AA2+AD8)<=15,(AA2+AD8)*1.05+AD10,(AA2+AD8)*1.12+AD10)` | `25.16544` | **Nota de auditoría:** Celda huérfana/legada; ninguna otra celda la referencia |
| **`AG3`** | `Uzaugums` (Bloque expandido por cosido $T_{\text{sewn}}$) | `=IF(AA12=1,1.1906*AD2+1.2599,IF(AND(AA12=2,AD2<=29),1.1338*AD2+1.5213,IF(AND(AA12=2,AA34=1),1.1636*AD2+1.1486,IF(AND(AA12=2,AA34=2),1.104*AD2+1.894))))` | `20.9228856` | **Regresión de hinchamiento por hilo Colibri:**<br>• Estucado (`AA12=1`): $1.1906 \cdot T_{\text{total}} + 1.2599$<br>• No estucado $\le 29\text{ mm}$ (`AA12=2, AD2<=29`): $1.1338 \cdot T_{\text{total}} + 1.5213$<br>• No estucado $> 29\text{ mm}$, pliego 8/12/16 (`AA34=1`): $1.1636 \cdot T_{\text{total}} + 1.1486$<br>• No estucado $> 29\text{ mm}$, pliego 20/24/32 (`AA34=2`): $1.104 \cdot T_{\text{total}} + 1.894$ |
| **`AI3`** | Nota tecnológica en hoja | Valor literal | `"Nekrītots līdz 29mm var rekinat, virs, rekina tehnologi"` | *"No estucado hasta 29 mm se puede calcular; por encima, lo calculan los tecnólogos"*. (Ver hallazgo sobre `AF13`/`AF14` más abajo). |
| **`AF5`** | Arco de lomo cosido redondeado (`Ar apaļojumu`) | `=MROUND((PI()*R(AG3)*2*(90-ACOS(AG3/2/R(AG3))*180/PI()))/180,0.5)` | `22` | Longitud de arco circular de cuerda $C = \text{AG3}$ y radio escalonado $R(C)$:<br>$L_{\text{arc}} = 2 R \arcsin\left(\frac{C}{2R}\right)$, redondeado al múltiplo más cercano de `0.5 mm` (`MROUND`). |
| **`AF6`** | Lomo final cosido redondo (`Galējais`) | `=AF5+1` | `23` | Arco redondeado $+ 1.0\text{ mm}$ |
| **`AH5`** | Lomo teórico recto con cartón (`Teor. ar papi`) | `=AD2+AD10` | `23.112` | $T_{\text{total}} + 2 T_{\text{board}}$ |
| **`AH6`** | Lomo final cosido recto (`Galējais`) | `=IF(AG3>AH5,MROUND(AG3,0.5),_xlfn.FLOOR.MATH(AH5,0.5))` | `23` | Si el hinchamiento `AG3` supera a `AH5`, aplica `MROUND(AG3, 0.5)`; si no, aplica `FLOOR(AH5, 0.5)` |
| **`AF10`** | Arco de lomo encolado redondeado (`Līmēts · Ar apaļojumu`) | Misma fórmula trigonométrica que `AF5`, pero evaluada sobre `AD2` ($T_{\text{total}}$) en vez de `AG3` | `17.5` | Longitud de arco sobre cuerda $C = \text{AD2}$ |
| **`AF11`** | Lomo final encolado redondo (`Līmēts · Galējais`) | `=MROUND(AF10+(AD10/2),0.5)+2` | `22.5` | $\text{MROUND}(L_{\text{arc}}(\text{AD2}) + T_{\text{board}}, 0.5) + 2\text{ mm}$ |
| **`AH10`** | Lomo final encolado recto (`Līmēts · Taisna · Galējais`) | `=MROUND(AD2+AD10+0.5,0.5)` | `23.5` | $\text{MROUND}(T_{\text{total}} + 2 T_{\text{board}} + 0.5, 0.5)$ |
| **`AF13..AF16`** | Validaciones por combinación (`Šūts/Līmēts` × `Apaļa/Taisna`) | `AF13`: `=IF(AG3="uncoated > 29 mm","Contact staff",IF(ISNUMBER(AF6),AF6,"Exceeding max"))`<br>`AF14`: `=IF(AG3="uncoated > 29 mm","Contact staff",IF(AG3>78,"Exceeding max",AH6))`<br>`AF15`: `=IF(AD2>63,"Exceeding max",AF11)`<br>`AF16`: `=IF(AD2>63,"Exceeding max",AH10)` | `23`, `23`, `22.5`, `23.5` | Límites máximos:<br>• Cosido (`Šūts`): $\text{AG3} \le 78\text{ mm}$<br>• Encolado (`Līmēts`): $\text{AD2} \le 63\text{ mm}$ |
| **`AF18` / `H14`** | `GALĒJAIS` / `Muguriņas platums` (Lomo seleccionado $S$) | `=IF(AND(AA6=1,AA14=1),AF13,IF(AND(AA6=1,AA14=2),AF14,IF(AND(AA6=2,AA14=1),AF15,IF(AND(AA6=2,AA14=2),AF16,))))` | `23` | Selecciona entre las 4 ramas (`AF13..AF16`) |
| **`H15`** | `Rastri` (Ancho del cajo / hendido de bisagra $G$) | `=IF(AA14=1,AD23,AD30)` | `8` | Depende de forma de lomo (`AA14`), grosor `AD2` y cartón `AA10` (ver Subtabla 4.3) |
| **`H16` (`AA18`/`AA20`)** | `Papes izmērs` — Ancho del cartón ($W_{\text{board}}$) | Redondo (`AA18`): `=IF((AA2+AD8)<=30,C10-5,C10-6)`<br>Recto (`AA20`): `=IF((AA2+AD8)<=5,C10-3,C10-5)` | `165` | Ancho de cada cartón de tapa (mm) |
| **`J16` / `J30`** | `Papes izmērs` — Alto del cartón ($H_{\text{board}}$) | `=IF(AA16=1,C11+6,C11+5)` | `245` | Si ceja=`3.0 mm` (`AA16=1`) $\rightarrow H+6$; si ceja=`2.5 mm` (`AA16=2`) $\rightarrow H+5$ |
| **`H17`** | `Noloki` (Vueltas del forro / turn-in $U$) | `=IF(AA10=4, 19, 18)` | `19` | Si cartón es `3,0 mm` (`AA10=4`) $\rightarrow 19\text{ mm}$; en otro caso $\rightarrow 18\text{ mm}$ |
| **`E40`** | Ancho entre bordes exteriores de cartones | `=C31+D36+E31+F36+G31` (`2*W_board + 2*Rastri + S`) | `369` | $165 + 8 + 23 + 8 + 165 = 369\text{ mm}$ |
| **`H18`** | `Vāka platums` (Ancho total forro de cubierta) | `=B39+E40+H39` (`2*Noloki + 2*W_board + 2*Rastri + S`) | `407` | $19 + 369 + 19 = 407\text{ mm}$ |
| **`H19`** | `Vāka garums` (Alto total forro de cubierta) | `=J25+J30+J38` (`2*Noloki + H_board`) | `283` | $19 + 245 + 19 = 283\text{ mm}$ |
| **`P31`, `T31`** | Panel frontal/trasero de sobrecubierta (`Supervāks`) | `=G31+F36` (`W_board + Rastri`) | `173` | $165 + 8 = 173\text{ mm}$ |
| **`P34`, `T34`** | Cota auxiliar sobrecubierta con cajo | `=P31+8` | `181` | $173 + 8 = 181\text{ mm}$ |
| **`R40`** | Ancho neto sobrecubierta sin sangrado | `=M31+P31+R31+T31+V31` (`2*F_dj + 2*(W_board+Rastri) + S`) | `529` | $80 + 173 + 23 + 173 + 80 = 529\text{ mm}$ |
| **`R20`** | `Supervāks Platums` (Ancho sobrecubierta con sangrado) | `=R40+6` | `535` | $529 + 6 = 535\text{ mm}$ |
| **`R21`** | `Supervāks Garums` (Alto sobrecubierta con sangrado) | `=X30+6` (`H_board + 6`) | `251` | $245 + 6 = 251\text{ mm}$ |
| **`T18`** | Validación solapa sobrecubierta | `=IF(R18>C10-20,"Atloki pārāk lieli.","")` | `""` | Solapa máxima de sobrecubierta: $F_{\text{dj}} \le W - 20\text{ mm}$ |

### 4.3 Tablas Escalonadas Internas de la Hoja 3 (Colibri)

1. **Tabla de Radios de Curvatura $R(x)$ para Lomo Redondo (`AF5`, `AF10` y Hojas 4–5 `R4`, `R9`):**
   Dado el espesor de referencia $x$ ($x = \text{AG3}$ para cosido, $x = \text{AD2}$ para encolado):
   - $x \le 14$: $R = 16\text{ mm}$ *(Nota: el Excel repite `IF(x<=14, 16)` después de `x<=46`, rama muerta inofensiva porque ya se evaluó al principio)*
   - $14 < x \le 22$: $R = 20\text{ mm}$
   - $22 < x \le 26$: $R = 23\text{ mm}$
   - $26 < x \le 30$: $R = 28\text{ mm}$
   - $30 < x \le 34$: $R = 30\text{ mm}$
   - $34 < x \le 38$: $R = 35\text{ mm}$
   - $38 < x \le 42$: $R = 45\text{ mm}$
   - $42 < x \le 46$: $R = 50\text{ mm}$
   - $46 < x \le 50$: $R = 55\text{ mm}$
   - $50 < x \le 54$: $R = 60\text{ mm}$
   - $54 < x \le 63$: $R = 65\text{ mm}$
   - $63 < x \le 69$: $R = 70\text{ mm}$
   - $69 < x \le 72$: $R = 80\text{ mm}$
   - $72 < x \le 75$: $R = 85\text{ mm}$
   - $75 < x \le 78$: $R = 90\text{ mm}$
   - $x > 78$: `"bloks par lielu"` (`Exceeding max`)

2. **Tabla de Cajo / Hendido (`Rastri`, celda `H15`):**
   - **Lomo redondo (`AA14 = 1`, celda `AD23`):**
     - Si $T_{\text{total}} < 30\text{ mm}$: `8 mm`
     - Si $30\text{ mm} \le T_{\text{total}} < 40\text{ mm}$: `10 mm` si cartón = `3.0 mm` (`AA10=4`), `9 mm` para cartones `1.0 / 2.0 / 2.4 mm`
     - Si $T_{\text{total}} \ge 40\text{ mm}$: `10 mm`
   - **Lomo recto (`AA14 = 2`, celda `AD30`):**
     - Si $T_{\text{total}} < 5\text{ mm}$ (`AA30`): cartón `1.0 mm` $\rightarrow 7\text{ mm}$; `2.0 mm` $\rightarrow 8\text{ mm}$; `2.4 mm` $\rightarrow 8.5\text{ mm}$; `3.0 mm` $\rightarrow 9\text{ mm}$
     - Si $T_{\text{total}} \ge 5\text{ mm}$ (`AA32`): cartón `1.0 mm` $\rightarrow 9\text{ mm}$; `2.0 mm` $\rightarrow 10\text{ mm}$; `2.4 mm` $\rightarrow 10.5\text{ mm}$; `3.0 mm` $\rightarrow 11\text{ mm}$

> [!WARNING]
> **Hallazgo de Auditoría en `AG3` vs `AF13`/`AF14` (Hoja 3, 4 y 5):**  
> En `AF13` y `AF14` existe la guarda `IF(AG3="uncoated > 29 mm", "Contact staff", ...)`, y en `AI3` figura la nota `"Nekrītots līdz 29mm var rekinat, virs, rekina tehnologi"`. Sin embargo, en la versión 2.0 del Excel, un tecnólogo de Livonia reemplazó la rama `> 29 mm` de `AG3` por dos regresiones lineales según el plegado (`AA34=1`: `1.1636*AD2+1.1486`; `AA34=2`: `1.104*AD2+1.894`), por lo que `AG3` **nunca devuelve el string `"uncoated > 29 mm"`**. En nuestro motor `SpineCalculationService`, preservaremos el cálculo numérico de la versión 2.0 pero emitiremos un **`WARNING` explícito (`UNCOATED_BLOCK_OVER_29MM_TECH_REVIEW_RECOMMENDED`)** cuando un bloque no estucado supere los `29 mm`.

---

## 5. Hoja 4 (`Flexi (Colibri)`) y Hoja 5 (`Flexi ar atlokiem (Colibri)`)

### 5.1 Particularidades y Restricciones Operativas Detectadas

| Aspecto | Hoja 4 (`Flexi`) | Hoja 5 (`Flexi ar atlokiem`) | Diagnóstico de Ingeniería |
| :--- | :--- | :--- | :--- |
| **Valores guardados en ejemplo** | `C7=0, E7=0, C8=0, E8=0`, `N4=2` (guardas `+0.6 mm`), $W=210, H=297$ | `C7=0, E7=0, C8=0, E8=0`, `N4=1` (guardas `+0 mm`), $W=210, H=297, F=80$ | **Ejemplos en cero:** Ambas hojas fueron guardadas con `0 páginas`, dando lomos residuales (`3 mm` y `2.5 mm`) derivados únicamente del término independiente de la regresión (`1.2599 mm`) y las guardas. |
| **Lomo recto deshabilitado** | Celdas `S13` y `S15`: `"pagaidām flexi neizmantojam"` (*"por ahora no usamos flexi [de lomo recto]"*). Además, `R17` (`=IF(N8=1,R12,IF(N8=2,R14))`) **solo selecciona las ramas de lomo redondo (`R12`, `R14`)** y nunca conecta `R13` ni `R15`. | Idéntico: `S13` y `S15` contienen `"pagaidām flexi neizmantojam"` y `R17` solo devuelve lomo redondo (`R12` o `R14`). | **Bloqueo industrial confirmado:** En Livonia/Colibri, Flexi solo está operativo para **lomo redondo (`apaļa`)**. El lomo recto en Flexi está explícitamente marcado como fuera de uso. |
| **Geometría de cubierta Flexi sin solapas (Hoja 4)** | Paneles frontales/traseros: `C32 = F32 = W + 4` (`214 mm`).<br>Vueltas (`turn-in`) izq/der/sup/inf: `15 mm` fijos (`B41=15, H41=15, I25=15, I40=15`).<br>Alto interior `I32 = H + 6` (`303 mm`).<br>`Vāka platums` (`D16`) $= 15 + (W+4) + S + (W+4) + 15 = 2W + S + 38\text{ mm}$ (`461 mm`).<br>`Vāka garums` (`D18`) $= 15 + (H+6) + 15 = H + 36\text{ mm}$ (`333 mm`). | — | Requiere perfil específico `livonia-colibri-flexi-v2` con estado `EXPERIMENTAL_REQUIRES_TECH_APPROVAL`. |
| **Geometría de cubierta Flexi con solapas (Hoja 5)** | — | Solapas izq/der: `B32 = H32 = C13 = F` (`80 mm`).<br>Paneles: `C32 = F32 = W + 4` (`214 mm`).<br>Sin vueltas de 15 mm a izquierda/derecha (las solapas llegan al corte lateral; **ojo:** no añade `+6 mm` de sangrado horizontal en `D18=E39`, mientras que en vertical suma `15 + (H+6) + 15 = H + 36`).<br>Validación solapa (`A22`): `=IF(C13+15>C10,"Atloki pārāk lieli.","")` ($F_{\max} = W - 15\text{ mm}$). | Confirma tu observación: **Hoja 5 omite sangrado lateral en las solapas (`E39 = 2F + 2(W+4) + S`)**, por lo que no debe activarse automáticamente en producción sin validación física previa. |

---

## 6. Clasificación de Certeza Matemática y Reglas de Negocio

| Categoría | Elementos | Tratamiento en `SpineCalculationService` |
| :--- | :--- | :--- |
| **1. Hechos Físicos Universales** | Fórmula de espesor de bloque por segmentos: $T_{\text{bloque}} = \sum_{i} \frac{P_i}{2} \cdot \frac{\mu_i}{1000}$ | Función pura universal del motor (`calculateBlockThicknessMm`). |
| **2. Parámetros Industriales Certificados (`Alegro v2.0`)** | • Ajuste encolado: $\text{ceil}_{0.5}(T_{\text{bloque}} + 0.7)$<br>• Ajuste cosido: $\text{ceil}_{0.5}(1.0718(T_{\text{bloque}} + 2\mu_{\text{cov}}/1000 - 0.66) + 0.9964)$<br>• Sangrado exterior: `3 mm` por lado (`+6 mm` en ancho y alto)<br>• Compensación de panel por solapa: `+2 mm` por portada/contraportada y límite $F \le W - 16\text{ mm}$ | Encapsulados en el perfil versionado `livonia-alegro-softcover-v2.0` (**Fase 1 — Activable**). |
| **3. Parámetros Industriales Complejos (`Colibri Hardcover v2.0`)** | • Hinchamiento por cosido `AG3` (4 tramos según estucado/no estucado, umbral `29 mm` y signatura `16/32`)<br>• Arco trigonométrico `AF5`/`AF10` con tabla de 15 radios $R(x)$<br>• Tabla de cajos (`Rastri` `8–11 mm`), cejas (`Kantes` `2.5/3.0 mm`), vueltas (`Noloki` `18/19 mm`) y sobrecubierta | Encapsulados en el perfil `livonia-colibri-hardcover-v2.0`, sujeto a flag de aprobación técnica cuando $T_{\text{total}} > 29\text{ mm}$ en papel no estucado. |
| **4. Reglas Incompletas / Deshabilitadas (`Colibri Flexi v2.0`)** | • Ramas de lomo recto marcadas `"pagaidām flexi neizmantojam"`<br>• Ejemplos en `0` páginas y ausencia de sangrado horizontal en solapas de Hoja 5 (`E39`) | Marcados como `REQUIRES_PRINTHOUSE_TECH_APPROVAL` (bloqueados para liberación directa a Preflight hasta contar con casos físicos certificados). |

