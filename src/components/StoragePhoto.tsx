import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';

/**
 * Renders an image whose source may be either:
 *  - A full HTTP/HTTPS URL  →  used directly
 *  - An Amplify Storage path (e.g. "originals/id/file.jpg")  →  resolved via getUrl()
 */
export function StoragePhoto({
  path,
  alt,
  className,
  onClick,
}: {
  path: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const isStoragePath =
    !path.startsWith('http://') && !path.startsWith('https://');

  useEffect(() => {
    if (!isStoragePath) {
      setSrc(path);
      return;
    }

    let cancelled = false;
    getUrl({ path, options: { expiresIn: 3600 } })
      .then(result => {
        if (!cancelled) setSrc(result.url.href);
      })
      .catch(err => {
        console.warn('[StoragePhoto] getUrl failed for', path, err);
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [path, isStoragePath]);

  if (failed) return null;

  if (!src) {
    return (
      <div className={`storage-photo-loading ${className ?? ''}`}>
        <span>⏳</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setFailed(true)}
    />
  );
}
