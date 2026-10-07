# CORAL-ES

**Instalación y experiencia de escucha · Entrega digital V5 · Octubre de 2026**

CORAL-ES propone un espacio para llegar, recorrer, detenerse y escuchar. Su núcleo es un banco continuo en forma de espiral que reúne cuerpos y acompaña el movimiento del público. Doce estaciones de escucha sobre el muro complementan ese espacio colectivo con lugares de permanencia individual. La madera y la iluminación ámbar forman parte de la atmósfera de la instalación.

Este repositorio reúne la representación interactiva y la documentación de la propuesta: panorámicas 360°, un recorrido tridimensional, un modelo del banco con sus piezas y secuencias de armado, y seis cuadernos PDF de presentación y planos. Sirve para comprender la experiencia espacial, revisar el diseño y preparar su discusión y prototipado.

**Estado del proyecto:** propuesta para revisión y prototipo. Las representaciones y los planos documentan el diseño; las verificaciones digitales no acreditan resistencia ni habilitan uso público.

## La instalación

| Componente | Descripción de la propuesta V5 |
| --- | --- |
| Banco en espiral | Espiral de Arquímedes de 1,5 vueltas, formada por 17 módulos identificados como M01–M17 y 16 encuentros J01–J16. |
| Dimensiones del banco | Ancho exterior de referencia de 6 m, profundidad nominal de asiento de 600 mm y altura terminada de asiento de 450 mm. Las cotas particulares se consultan en los planos. |
| Estructura y uniones | Patas fijas. La unión principal G utiliza tres garfios, receptores y seguros por encuentro. Los sistemas T con pernos y R con rieles se muestran como alternativas. |
| Estaciones de escucha | Doce estaciones S01–S12, con cajas de asiento, soportes para audífonos y halos de luz posteriores. |
| Materialidad | Madera y/o chapilla natural Flor Morado en las caras visibles. |
| Implantación | Banco centrado en una sala de referencia de 14,5 × 14,5 m, con las estaciones sobre el muro del fondo y recorridos por el perímetro y el interior de la espiral. |
| Iluminación | Atmósfera ámbar con un foco cenital ambiental y halos en los soportes de las estaciones. |

Las dimensiones corresponden al diseño documentado. Los planos distinguen las cotas de las piezas, las envolventes del conjunto y su posición en el recinto; deben contrastarse con el lugar y los componentes reales antes de fabricar.

## Tres formas de explorar el proyecto

Abre [index.html](index.html) para acceder a los tres visores. [INICIO.html](INICIO.html) ofrece la misma entrada.

| Visor | Qué permite explorar | Controles principales |
| --- | --- | --- |
| [Visión 360°](CORALES_360_V5.html) | Panorámicas desde el centro, la entrada, el lateral y las estaciones. Incluye la descarga de las imágenes PNG originales. | Arrastrar para mirar; seleccionar el punto de vista; `H` para ocultar o mostrar la interfaz. |
| [Recorrido 3D](CORALES_Recorrido_3D_V5.html) | Caminar por el recinto, aproximarse al banco y las estaciones, sentarse y observar la instalación desde distintas posiciones y alturas de ojos. | `WASD` o flechas para caminar; clic y ratón para mirar; `Esc` para liberar el ratón; `E` para sentarse o ponerse de pie; `H` para la interfaz. |
| [Modelo interactivo](CORALES_Modelo_Interactivo_G_V5.html) | Examinar el banco completo, módulos y encuentros; comparar G/T/R; ver estructura, lastre, despiece por capas, piezas en el suelo y pasos de armado; buscar piezas por función, ID o material; descargar el modelo mostrado como GLB. | Arrastrar para girar; rueda para acercar; clic para identificar; flechas para girar; `+` / `−` para acercar; `Inicio` para encuadrar; `Esc` para quitar la selección. |

El modelo permite añadir figuras de escala humana. Esas figuras y las escenas de ocupación son referencias ilustrativas; no constituyen una determinación de aforo o accesibilidad.

## Documentación incluida

| Documento | Contenido |
| --- | --- |
| [1. Presentación](PDFs/1.%20CORALES_Presentacion.pdf) | Intención y experiencia, vistas de la instalación, circulación, implantación, iluminación, materiales y construcción. |
| [2. Planos de instalación](PDFs/2.%20CORALES_Planos_Instalacion.pdf) | Implantación en la sala, circulación, distribución de estaciones, iluminación y relaciones entre banco, cajas y soportes. |
| [3. Planos de la espiral](PDFs/3.%20CORALES_Planos_Espiral.pdf) | Conjunto del banco, módulos M01–M17, encuentros, estructura, piezas y cotas. |
| [4. Planos de cajas](PDFs/4.%20CORALES_Planos_Cajas.pdf) | Construcción de las cajas de escucha, medidas terminadas, despieces y piezas de las estaciones S01–S12. |
| [5. Planos de soportes](PDFs/5.%20CORALES_Planos_Soportes.pdf) | Soportes para audífonos, montaje, halo LED, canaleta y detalles de piezas y fijaciones. |
| [6. Superiores y guías para plóter 1:1](PDFs/6.%20CORALES_Superiores_Guias_Ploter_1a1.pdf) | Láminas a escala 1:1 de las piezas superiores y guías de los módulos. |

Para imprimir las láminas 1:1, conserva el tamaño real y comprueba una cota de referencia en la salida física antes de emplearla como plantilla.

## Abrir la entrega en tu equipo

1. Descarga el repositorio completo o clónalo:

   ```powershell
   git clone https://github.com/sasiborg/coral-es.git
   ```

2. Si descargaste un ZIP, extrae todo su contenido antes de abrirlo.
3. Abre `index.html` con un navegador. También puedes abrir `INICIO.html`.
4. Conserva `assets/` junto a los HTML y `PDFs/` para consultar los documentos.

La entrega está preparada para abrirse directamente desde archivos locales, sin instalación, compilación ni conexión a internet después de descargarla. Las imágenes, los modelos y la biblioteca 3D están incluidos; no hay dependencias de CDN.

Los visores necesitan JavaScript, WebGL y la API `DecompressionStream` para descomprimir los recursos locales. El recorrido utiliza teclado y ratón. Si el navegador no puede iniciar una vista, los visores muestran una alternativa o un mensaje de recuperación.

Si prefieres servir la carpeta por HTTP y ya tienes Python instalado, ejecuta este comando desde la raíz del repositorio:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Después abre `http://127.0.0.1:8000/`. Detén el servidor con `Ctrl+C`.

## Organización del repositorio

```text
coral-es/
├── index.html                         Entrada principal
├── INICIO.html                        Entrada equivalente para uso local
├── CORALES_360_V5.html                 Visor panorámico
├── CORALES_Recorrido_3D_V5.html         Recorrido por la instalación
├── CORALES_Modelo_Interactivo_G_V5.html Modelo y lectura constructiva
├── assets/
│   └── interactivos_r1/
│       ├── *_app_r1.js                 Código de los visores
│       ├── web_assets_r1.js            Carga de recursos locales
│       ├── resource_*.js               Datos y modelos empaquetados
│       ├── three_local_r1.js           Biblioteca 3D local
│       ├── LICENSE_THREE.txt           Licencia de Three.js
│       ├── *.webp / union_*.png        Panorámicas, previas y detalles
│       └── originales/                Cuatro panorámicas PNG originales
├── PDFs/                              Presentación y cinco cuadernos de planos
├── CNAME                              Dominio de GitHub Pages
├── .nojekyll                          Entrega estática sin procesamiento Jekyll
├── .gitignore                         Exclusiones de archivos locales
└── README.md
```

Los HTML identifican la versión V5 y los recursos se agrupan en `assets/interactivos_r1/`. Los modelos GLB se reconstruyen desde esos recursos para su visualización y descarga. Esta entrega web no contiene escenas nativas de Blender ni archivos de audio de las estaciones.

## Alojamiento y mantenimiento

La dirección de publicación de los visores es [corales.simonaldana.com](https://corales.simonaldana.com/). El repositorio es [sasiborg/coral-es](https://github.com/sasiborg/coral-es). GitHub Pages está configurado para publicar la raíz de la rama `main`; `index.html` es la entrada del sitio. El archivo `CNAME` conserva el dominio `corales.simonaldana.com` y `.nojekyll` forma parte de la entrega estática.

Mantén las rutas relativas al mover o publicar la carpeta. Para actualizarla, conserva todos los recursos que requieren los visores y revisa los enlaces a los PDFs. Los PNG originales son archivos grandes: utiliza Git o GitHub Desktop para subir la entrega completa.

El código utiliza HTML, CSS y JavaScript con una copia local de Three.js r186. No hay un gestor de paquetes, un proceso de compilación ni un backend en este repositorio. La [licencia MIT incluida](assets/interactivos_r1/LICENSE_THREE.txt) corresponde a Three.js.

## Alcance de la propuesta y verificaciones pendientes

La presentación, los planos y los interactivos permiten revisar geometría, piezas, montaje y experiencia espacial. Las secuencias de unión y las separaciones del despiece son explicativas.

Antes de fabricar o habilitar la instalación para uso público, quedan por resolver y comprobar:

- La resistencia, estabilidad, apoyos, lastre y uniones mediante revisión técnica y ensayos físicos.
- Las tolerancias y el ajuste real de las piezas mediante prototipos de módulo, encuentro y estación.
- Los anclajes murales, el equipo de audio, el cableado y los componentes reales de iluminación.
- El aforo, la accesibilidad, la circulación y la evacuación en el recinto y con ocupación real.

La descripción de este README se basa en los seis PDFs y los controles de los visores incluidos en la carpeta.
