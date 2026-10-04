'use client';

import { useEffect } from 'react';

export default function LanguageRedirect() {
  useEffect(() => {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language].filter(Boolean);
    const preferred = languages
      .map((value) => String(value).toLowerCase().split(/[-_]/)[0])
      .find((value) => value === 'it' || value === 'en') ?? 'it';
    window.location.replace(`/${preferred}`);
  }, []);

  return <main className="language-redirect"><p>Sentinel · <a href="/it">Italiano</a> · <a href="/en">English</a></p></main>;
}
