import { Package } from 'lucide-react';
import { useState } from 'react';

export function CategoryImage({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="category-preview" aria-hidden="true">
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Package size={28} strokeWidth={1.4} />
      )}
    </span>
  );
}
