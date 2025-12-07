import { useSlugParser } from "@/utils/hooks/useSlugParser";
import DynamicPageViewer from "@/components/common/DynamicPageViewer";

export default function MobiusPage() {
  const { componentPath, metadata, isLoading } = useSlugParser('vis');

  return (
    <DynamicPageViewer
      componentPath={componentPath}
      metadata={metadata}
      isLoading={isLoading}
      loadingMessage="Loading mobius..."
    />
  );
}
