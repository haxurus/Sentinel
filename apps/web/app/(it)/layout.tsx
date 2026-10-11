import type { ReactNode } from 'react';
import { RootDocument } from '../_components/RootDocument';
import { baseMetadata, viewport as sharedViewport } from '../_components/seo';

export const metadata = baseMetadata;
export const viewport = sharedViewport;

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return <RootDocument lang="it">{children}</RootDocument>;
}
