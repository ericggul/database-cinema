import { useSlugParser } from "@/utils/hooks/useSlugParser";
import DynamicPageViewer from "@/components/common/DynamicPageViewer";

export default function MobiusPage() {
  const { componentPath, metadata, isLoading } = useSlugParser('10k');

  return (
    <DynamicPageViewer
      componentPath={componentPath}
      metadata={metadata}
      isLoading={isLoading}
      loadingMessage="Loading mobius..."
    />
  );
}
