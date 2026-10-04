import type { APIRoute } from 'astro';
import { sitemapDeObras } from '@/lib/sitemapObras';

/** /sitemap-ambos.xml — obras con manhwa Y novela (nivel A), es + en. Ver src/lib/sitemapObras.ts. */
export const GET: APIRoute = ({ site }) => sitemapDeObras(site!, 'A');
