import type { APIRoute } from 'astro';
import { getActividad, getNovelas } from '@/lib/api';
import { IDIOMA_BASE, IDIOMAS } from '@/lib/i18n';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RSS de capítulos nuevos
 * ─────────────────────────────────────────────────────────────────────────────
 * Un feed cuesta un archivo y abre una puerta de entrada que no depende de
 * Google: lectores de RSS, canales de Discord/Telegram con bot, agregadores y
 * los propios rastreadores, que lo usan como señal de frescura del dominio.
 *
 * Un solo feed global, no uno por obra: 7.000 archivos XML para que cada uno lo
 * siga una persona es peso de build a cambio de nada. Si alguna obra concreta
 * lo pide, se añade entonces.
 */

/** &, <, > y comillas: lo mínimo para que un título con "&" no rompa el XML. */
const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const TOPE = 100;

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? '';
  const [actividad, novelas] = await Promise.all([getActividad(), getNovelas(IDIOMA_BASE)]);
  const porSlug = new Map(novelas.map((n) => [n.slug, n]));

  const items = actividad
    .filter((a) => porSlug.has(a.slug))
    .slice(0, TOPE)
    .map((a) => {
      const n = porSlug.get(a.slug)!;
      const url = `${base}/novela/${n.slug}`;
      const alternos = n.titulosAlternativos.slice(0, 3).join(' · ');
      return `    <item>
      <title>${esc(n.titulo)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="false">${esc(`${url}#${a.cuando}`)}</guid>
      <pubDate>${new Date(a.cuando).toUTCString()}</pubDate>
      <description>${esc(
        `Capítulo nuevo en ${a.fuentes.join(', ')}.${alternos ? ` También conocida como ${alternos}.` : ''}`,
      )}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ManhwaToNovel — Capítulos nuevos</title>
    <link>${esc(base)}</link>
    <atom:link href="${esc(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" />
    <description>Manhwas y novelas ligeras que acaban de recibir capítulo, con el enlace a donde leerlas.</description>
    <language>${IDIOMAS[IDIOMA_BASE].htmlLang}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
