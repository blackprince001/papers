const SOURCES = [
  'arXiv',
  'ACM',
  'IEEE',
  'OpenReview',
  'PMLR',
  'NeurIPS',
  'PDF upload',
  'DOI',
  'Semantic Scholar',
  'bioRxiv',
  'SSRN',
  'JSTOR',
  'PubMed',
  'Springer',
];

function Row({ reverse = false }: { reverse?: boolean }) {
  return (
    <div
      className={`marquee-row flex w-max shrink-0 items-center gap-4 pr-4${reverse ? ' marquee-row-reverse' : ''}`}
    >
      {[...SOURCES, ...SOURCES].map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="whitespace-nowrap rounded-full bg-deep-forest px-6 py-3 text-lg font-bold text-mint"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function SourcesMarquee() {
  return (
    <section className="relative z-10 -mt-24 mb-20 overflow-hidden bg-mint py-16 md:-mt-36 md:mb-28">
      <h2 className="mb-12 px-6 text-center text-2xl font-bold text-deep-forest md:text-3xl">
        Import from anywhere.
        <br />
        Every source, organized by Lumen.
      </h2>
      <div className="flex flex-col gap-4">
        <div className="flex overflow-hidden">
          <Row />
          <Row />
        </div>
        <div className="flex overflow-hidden">
          <Row reverse />
          <Row reverse />
        </div>
      </div>
    </section>
  );
}
