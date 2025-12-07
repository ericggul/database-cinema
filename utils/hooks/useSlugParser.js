import { useRouter } from "next/router";
import { useMemo } from "react";

export function useSlugParser(basePath) {
  const router = useRouter();
  const { slug } = router.query;

  const { componentPath, componentId, metadata } = useMemo(() => {
    // Ensure slug is a valid array before processing
    if (!Array.isArray(slug) || slug.length === 0) {
      return { componentPath: null, componentId: null, metadata: null };
    }

    // The last element is the component identifier
    const componentId = slug[slug.length - 1];
    // The preceding elements form the path segments (e.g., ['3d-test'], ['3d-test', 'advanced'])
    const pathSegments = slug.slice(0, -1);

    // Construct the component path for dynamic import
    // Examples:
    // basePath/1 -> components/basePath/1
    // basePath/3d-test/1 -> components/basePath/3d-test/1
    // basePath/3d-test/235jl2/2331 -> components/basePath/3d-test/235jl2/2331
    const componentPath = pathSegments.length > 0 
      ? `components/${basePath}/${pathSegments.join('/')}/${componentId}`
      : `components/${basePath}/${componentId}`;

    // Create metadata for the component
    const metadata = {
      fullPath: slug.join('/'),
      category: pathSegments.length > 0 ? pathSegments[0] : 'main',
      subcategory: pathSegments.length > 1 ? pathSegments.slice(1).join('/') : null,
      id: componentId,
      title: `${basePath.charAt(0).toUpperCase() + basePath.slice(1)} ${pathSegments.length > 0 ? pathSegments.join(' / ') + ' / ' : ''}${componentId}`
    };

    return { componentPath, componentId, metadata };
  }, [slug, basePath]);

  return { componentPath, componentId, metadata, isLoading: !componentPath || !componentId };
} 