import type { APIRoute } from 'astro';
import { formatos, getCapitulosExternos, getNovelas } from '@/lib/api';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /buscar.json — índice para el buscador del navbar
 * ─────────────────────────────────────────────────────────────────────────────
 * El buscador vive en el Header (todas las páginas) pero el sitio es estático:
 * no hay servidor que responda "títulos que empiezan por X". La solución es un
 * índice plano que el navegador descarga UNA vez (al primer teclazo) y filtra
 * en local. Con ~6.500 obras son unos cientos de KB, y como se pide en diferido
 * no pesa en la carga inicial de ninguna página.
 *
 * Formato mínimo a propósito —`s`lug, `t`ítulo, `a`lternativos—: cada byte se
 * multiplica por el catálogo. Los alternativos entran (recortados) porque son
 * justo lo que hace que se encuentre por el nombre en inglés o coreano.
 *
 * Solo el catálogo base (es), como el resto de páginas propias (idiomasDeObra).
 */
export const GET: APIRoute = async () => {
  const novelas = await getNovelas();
  const indice = await Promise.all(
    novelas.map(async (n) => {
      const fmt = formatos(await getCapitulosExternos(n.slug));
      return {
        s: n.slug,
        t: n.titulo,
        // Hasta 4 nombres alternativos: suficientes para enganchar el título en
        // inglés/coreano sin inflar el índice con los 15 que trae alguna obra.
        a: (n.titulosAlternativos ?? []).slice(0, 4),
        // Portada y formatos: lo que necesita la tarjeta de resultado de la
        // portada. Van aquí para que la home NO tenga que incrustar el catálogo
        // en su HTML (eran 2,5 MB en cada visita); esto se pide una vez, solo
        // cuando hace falta, y queda cacheado.
        p: n.portadaUrl,
        f: fmt.length ? fmt : n.tipo === 'ambos' ? ['manhwa', 'novela'] : [n.tipo],
      };
    }),
  );
  return new Response(JSON.stringify(indice), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Cambia con cada build; el edge lo cachea un día y revalida.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
