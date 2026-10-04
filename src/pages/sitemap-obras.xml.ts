import type { APIRoute } from 'astro';
import { sitemapDeObras } from '@/lib/sitemapObras';

/** /sitemap-obras.xml — fichas de un solo formato (nivel B). Ver src/lib/sitemapObras.ts. */
export const GET: APIRoute = ({ site }) => sitemapDeObras(site!, 'B');
