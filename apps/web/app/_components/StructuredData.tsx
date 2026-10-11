/**
 * schema.org JSON-LD for rich results. Not executed by browsers, so the strict
 * CSP is unaffected; `<` is escaped so content can never close the tag.
 */
export function StructuredData({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
