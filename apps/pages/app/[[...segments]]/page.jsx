import { readFile } from 'node:fs/promises';
import path from 'node:path';
import PublicPage from "../PublicPage";
import shared from "../../data/shared.json";
import routes from '../../data/routes.json';

export const dynamicParams = false;

export function generateStaticParams() {
  return routes.map(({ route }) => ({ segments: route.split('/').filter(Boolean).map(decodeURIComponent) }));
}

async function view(params) {
  const { segments = [] } = await params;
  const route = '/' + segments.map(encodeURIComponent).join('/') + (segments.length ? '/' : '');
  const { name } = routes.find(entry => entry.route === route);
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', name), 'utf8'));
}

export async function generateMetadata({ params }) {
  const { title, description } = await view(params);
  return { title, description };
}

export default async function Page({ params }) {
  return <PublicPage shared={shared} view={await view(params)} />;
}
