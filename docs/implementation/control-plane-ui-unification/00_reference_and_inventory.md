# PrintPrice OS Control Plane — Unificación Visual de UI

## Iteración V0: Referencia Visual Real e Inventario de Pantallas

### 1. Referencia Visual Real (Extraída de Guided Onboarding)

El onboarding guiado (`GuidedPrinthouseJourney`, `ProductFamilyCard`, `GuidedStepCompany`, etc.) es el estándar canónico de interfaz aprobado para PrintPrice OS. Presenta una experiencia accesible, fiable y despejada sin sacrificar el rigor técnico.

#### 1.1 Superficies, Bordes y Elevación
- **Fondo Global (Canvas)**: `bg-[#fafafa]` (Light) / `dark:bg-[#0e0e0f]` (Dark). Eliminación de la cuadrícula decorativa dura `tactical-grid`.
- **Superficie de Cards**: `bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs p-5 sm:p-6 rounded-2xl space-y-4`.
- **Superficie Interna / Formularios**: `bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm`.
- **Anillo de Foco (Focus Ring)**: `focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] focus:outline-none transition-colors`.
- **Modales (`AccessibleModal`)**: `DialogPanel` centrado en viewport con `rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden`.

#### 1.2 Geometría y Radios (`border-radius`)
- **Cards Principales y Contenedores**: `rounded-2xl` (16px).
- **Cards de Selección y Previews**: `rounded-2xl` a `rounded-3xl` con borde reactivo al estado seleccionado.
- **Campos de Entrada (`input`, `select`, `textarea`)**: `rounded-xl` (12px).
- **Botones Primarios y Secundarios**: `rounded-xl` o `rounded-2xl` (según jerarquía).
- **Badges y Etiquetas de Estado**: `rounded-full` (pills) o `rounded-lg`.
- **Abandono de `rounded-none`**: Se retira el patrón visual de esquinas rectas de guillotina en cards, modales y formularios.

#### 1.3 Tipografía y Jerarquía
- **Familia Tipográfica**: Google Font `Manrope`, sans-serif (`font-sans` / `font-manrope`).
- **Título de Pantalla (H1)**: `text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight`.
- **Subtítulo de Pantalla**: `text-sm text-zinc-600 dark:text-zinc-400 font-medium`.
- **Título de Sección / Card**: `text-sm font-bold text-zinc-900 dark:text-zinc-100`.
- **Sobretítulo / Categoría**: `text-[11px] font-black uppercase tracking-wider text-[#dc0000]`.
- **Monoespaciado Selectivo**: Reservado estrictamente a identificadores técnicos (SKU, IDs de lote, hashes, PIDs, coordenadas GPS) y cifras monetarias tabulares. Se elimina de encabezados generales.

---

### 2. Inventario de Pantallas y Módulos a Unificar

| Módulo / Ruta | Componente Fuente | Defectos Actuales | Plan de Migración |
| :--- | :--- | :--- | :--- |
| **Shell: Header** | `src/ui/layout/Topbar.tsx` | Marca duplicada en escritorio (`PrintPrice OS Control Plane`); bordes duros `rounded-none`. | Retirar bloque de marca duplicado; redistribuir espacio; badges e inputs redondeados (`rounded-full` / `rounded-lg`). |
| **Shell: Sidebar** | `src/ui/layout/Sidebar.tsx` | Botones cuadrados, hover plano y bordes de guillotina. | Envoltorios de navegación `rounded-xl`; logo e iconos en `rounded-xl`; transiciones suaves. |
| **Shell: Layout** | `src/ui/layout/Layout.tsx` | Cuadrícula de fondo `tactical-grid` en todo el viewport. | Retirar `tactical-grid` del área de contenido principal para dar superficie limpia. |
| **Settings** (`/settings`) | `src/ui/pages/os/GlobalSettingsPage.tsx` | Cards `rounded-none`; select de países limitado a 6; select de timezone sin IANA completo ni persistencia adecuada. | Integrar `CountrySelect` y `TimezoneSelect`; modernizar cards a `rounded-2xl`; inputs `rounded-xl`; switches `rounded-full`. |
| **Onboarding: Sede** | `src/ui/components/printhouse/setup/ProductionSitesPanel.tsx` | País como input de texto libre; timezone con solo 4 opciones; clave literal `status.suspended`. | Integrar `CountrySelect` y `TimezoneSelect`; traducir `status.suspended`; cards `rounded-2xl`; inputs `rounded-xl`. |
| **Supplier: Dashboard** (`/supplier/dashboard`) | `src/ui/pages/supplier/SupplierDashboardPage.tsx` | KPI cards `rounded-none`, badges industriales duros. | Unificar a cards `rounded-2xl` con `shadow-2xs` y badges redondeados. |
| **Supplier: Catálogo y Ofertas** (`/supplier/catalog`) | `src/ui/pages/supplier/SupplierCatalogOffersPage.tsx` | Tablas y tabs planos con `rounded-none`; modales de importación, edición y lotes con estética antigua. | Convertir contenedor de tablas a `rounded-2xl overflow-hidden`; modales a `rounded-2xl`; botones a `rounded-xl`. |
| **Supplier: Pedidos** (`/supplier/orders`) | `src/ui/pages/supplier/SupplierOrdersPage.tsx` | Filtros y tablas sin redondeos. | Aplicar cards y tabla canónica con estilo onboarding. |
| **Supplier: Ajustes** (`/supplier/settings`) | `src/ui/pages/supplier/SupplierSettingsPage.tsx` | Formulario con inputs y cards rectangulares. | Aplicar `rounded-2xl` y `rounded-xl`. |
| **Dashboard Operativo** (`/dashboard`) | `src/ui/pages/admin/CommandCenterPage.tsx` | Paneles tácticos con `rounded-none` y texto excesivamente miniaturizado. | Adaptar `TacticalPanel` a `rounded-2xl bg-white dark:bg-[#18181b]` con tipografía legible. |
| **Gestión Imprentas** (`/printhouses`) | `src/ui/pages/os/PrinthousesPage.tsx` | `PrinthouseFormModal` con `rounded-none shadow-none`. | Actualizar `DialogPanel` a `rounded-2xl shadow-2xl`. |
| **Detalle de Imprenta** | `src/ui/pages/printhouse/PrinthouseDetailDrawer.tsx` | Timezone como input libre; bordes rectos. | Integrar `TimezoneSelect`; estilos redondeados en cajón. |
| **Flota Maquinaria** (`/machines`) | `src/ui/pages/os/MachinesPage.tsx` | Tablas y cards planas. | Aplicar tokens de cards y botones unificados. |
| **Materiales** (`/materials`) | `src/ui/pages/admin/MaterialsPage.tsx` | Contenedores industriales rectos. | Actualizar a componentes unificados. |
| **Órdenes y Trabajos** (`/orders`, `/jobs`) | `src/ui/pages/os/OrdersPage.tsx`, `JobsPage.tsx` | Tablas `rounded-none`. | Envolver en contenedor canónico `rounded-2xl`. |
| **Modales Comunes** | `src/ui/components/AccessibleModal.tsx` | `rounded-none` en panel del diálogo. | Actualizar a `rounded-2xl` con portal y centrado viewport inmune a scroll. |
| **Tablas Comunes** | `src/ui/components/DataTable.tsx` | Contenedor y buscador `rounded-none`. | Envoltorio `rounded-2xl overflow-hidden shadow-2xs` y buscador `rounded-xl`. |
| **Badges de Estado** | `src/ui/components/StatusBadge.tsx` | `rounded-none` en etiquetas de estado. | Actualizar a `rounded-full` / pills con padding equilibrado. |
